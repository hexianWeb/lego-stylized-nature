import * as THREE from 'three/webgpu'
import { createNoise2D } from 'simplex-noise'
import { mulberry32, random01 } from '../../utils/random.js'
import { getChunkWindowCoords, getRenderChunkKey } from './chunkCoordinates.js'

const clamp01 = value => Math.max(0, Math.min(1, value))
const smoothstep = value => value * value * (3 - 2 * value)
const APPEAR_SECONDS = 0.6
const MAX_LAYERS = 4

/**
 * A continuous band of brick-sized cloud columns hugging the loaded window, over the placeholder.
 * Columns joining the band grow in; columns of chunks entering the window stay until the
 * terrain's column clock dissolves them. Each column is one stretched box.
 */
export default class VoxelClouds {
  constructor({ config, parentGroup, placeholder }) {
    this.config = config
    this.parentGroup = parentGroup
    this.placeholder = placeholder
    const settings = config.chunks.clouds ?? {}
    this.chunkSize = config.chunks.size
    this.windowRadius = config.chunks.windowRadius ?? 1
    this.radius = this.windowRadius + 1
    const bandBoxes = Number.isFinite(settings.bandBoxes) ? Math.max(1, Math.floor(settings.bandBoxes)) : 2
    this.band = bandBoxes * placeholder.cellSpan
    this.voxelSize = config.terrain.cellSize
    this.voxelHeight = config.terrain.layerHeight * 2
    this.cache = new Map()
    this.centerCoord = null
    this.visible = true

    this.geometry = new THREE.BoxGeometry(1, 1, 1)
    const normals = this.geometry.getAttribute('normal')
    const faceColors = new Float32Array(normals.count * 3)
    const faceColor = new THREE.Color()
    for (let index = 0; index < normals.count; index++) {
      const y = normals.getY(index)
      const x = normals.getX(index)
      // Cool sides and undersides make the stepped volumes read like clouds,
      // even without shadow maps or the world's green environmental lighting.
      faceColor.set(y > 0 ? '#f7feff' : y < 0 ? '#91bad0' : x > 0 ? '#b6d7e6' : x < 0 ? '#d9eef5' : '#c7e3ef')
      faceColor.toArray(faceColors, index * 3)
    }
    this.geometry.setAttribute('color', new THREE.BufferAttribute(faceColors, 3))
    this.material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
    this.capacity = 0
    this.mesh = null
    const windowCells = (this.windowRadius * 2 + 1) * this.chunkSize
    this.ensureCapacity(Math.ceil(((windowCells + this.band * 2) ** 2 - windowCells ** 2) * 0.6))
  }

  ensureCapacity(count) {
    if (this.mesh && count <= this.capacity)
      return
    if (this.mesh) {
      this.parentGroup.remove(this.mesh)
      this.mesh.dispose()
    }
    this.capacity = Math.ceil(Math.max(count, 1) * 1.25)
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity)
    this.mesh.name = 'VoxelClouds'
    this.mesh.count = 0
    this.mesh.visible = false
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.castShadow = false
    this.mesh.receiveShadow = false
    this.parentGroup.add(this.mesh)
  }

  createChunk(coord) {
    if (this.noiseSeed !== this.config.seed) {
      this.noise2D = createNoise2D(mulberry32(this.config.seed + 7919))
      this.noiseSeed = this.config.seed
    }
    const size = this.chunkSize
    const span = this.placeholder.cellSpan
    const boxes = Math.ceil(size / span)
    const originX = coord.x * size
    const originZ = coord.z * size
    const coverage = new Float32Array(size * size)
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const blockX = originX + x
        const blockZ = originZ + z
        coverage[z * size + x] = this.noise2D(blockX / 14, blockZ / 14) * 0.7
          + this.noise2D(blockX / 5 + 31.7, blockZ / 5 - 12.3) * 0.3
      }
    }
    // Box tops with a one-box margin; each base is the 3x3 maximum so a cloud bank keeps
    // one level across neighboring boxes and never dips into a taller neighbor.
    const { cellSize } = this.config.terrain
    const paddedBoxes = boxes + 2
    const tops = new Float32Array(paddedBoxes ** 2)
    for (let boxZ = -1; boxZ <= boxes; boxZ++) {
      for (let boxX = -1; boxX <= boxes; boxX++) {
        const x = (originX + (boxX + 0.5) * span) * cellSize
        const z = (originZ + (boxZ + 0.5) * span) * cellSize
        tops[(boxZ + 1) * paddedBoxes + boxX + 1] = this.placeholder.getMaxTop(x, z, x, z)
      }
    }
    const bases = new Float32Array(boxes * boxes)
    for (let boxZ = 0; boxZ < boxes; boxZ++) {
      for (let boxX = 0; boxX < boxes; boxX++) {
        let top = 0
        for (let dz = 0; dz < 3; dz++) {
          for (let dx = 0; dx < 3; dx++)
            top = Math.max(top, tops[(boxZ + dz) * paddedBoxes + boxX + dx])
        }
        bases[boxZ * boxes + boxX] = top + this.voxelHeight * 1.5
      }
    }
    return {
      coord: { ...coord },
      coverage,
      bases,
      boxes,
      shownAt: new Float32Array(size * size).fill(Number.NaN),
      layers: new Uint8Array(size * size),
      cells: [],
      start: 0,
      mode: null,
      appearing: false,
    }
  }

  getWindowDistance(blockX, blockZ) {
    const size = this.chunkSize
    const minX = (this.centerCoord.x - this.windowRadius) * size
    const maxX = (this.centerCoord.x + this.windowRadius + 1) * size - 1
    const minZ = (this.centerCoord.z - this.windowRadius) * size
    const maxZ = (this.centerCoord.z + this.windowRadius + 1) * size - 1
    return Math.hypot(Math.max(minX - blockX, 0, blockX - maxX), Math.max(minZ - blockZ, 0, blockZ - maxZ))
  }

  refreshBand(chunk, inWindow, now) {
    if (chunk.mode === 'revealed')
      chunk.shownAt.fill(Number.NaN)
    const size = this.chunkSize
    const originX = chunk.coord.x * size
    const originZ = chunk.coord.z * size
    chunk.cells.length = 0
    for (let cell = 0; cell < size * size; cell++) {
      // Chunks inside the window never gain columns; they keep theirs until the terrain rises.
      if (!inWindow) {
        const distance = this.getWindowDistance(originX + cell % size, originZ + Math.floor(cell / size))
        // Dense against the loaded terrain, thinning out toward the outer edge of the band.
        const excess = chunk.coverage[cell] + 0.35 - 0.8 * distance / this.band
        if (distance <= this.band && excess > 0) {
          if (Number.isNaN(chunk.shownAt[cell])) {
            chunk.shownAt[cell] = now
            chunk.layers[cell] = Math.min(MAX_LAYERS, 1 + Math.floor(excess * 6))
          }
        }
        else {
          chunk.shownAt[cell] = Number.NaN
        }
      }
      if (!Number.isNaN(chunk.shownAt[cell]))
        chunk.cells.push(cell)
    }
  }

  update(centerCoord, activeSlots = new Map(), now = performance.now() / 1000) {
    if (!centerCoord)
      return
    const moved = this.centerCoord?.x !== centerCoord.x || this.centerCoord?.z !== centerCoord.z
    if (moved) {
      this.centerCoord = { ...centerCoord }
      const coords = getChunkWindowCoords(centerCoord, this.radius)
      const retained = new Set(coords.map(getRenderChunkKey))
      for (const key of this.cache.keys()) {
        if (!retained.has(key))
          this.cache.delete(key)
      }
      let start = 0
      for (const coord of coords) {
        const key = getRenderChunkKey(coord)
        if (!this.cache.has(key))
          this.cache.set(key, this.createChunk(coord))
        const chunk = this.cache.get(key)
        const inWindow = Math.max(Math.abs(coord.x - centerCoord.x), Math.abs(coord.z - centerCoord.z)) <= this.windowRadius
        this.refreshBand(chunk, inWindow, now)
        chunk.start = start
        start += chunk.cells.length
      }
      this.ensureCapacity(start)
      this.mesh.count = start
      const { cellSize, maxHeight, layerHeight } = this.config.terrain
      const chunkWorldSize = this.chunkSize * cellSize
      const center = new THREE.Vector3((centerCoord.x + 0.5) * chunkWorldSize, 0, (centerCoord.z + 0.5) * chunkWorldSize)
      const extent = (this.radius + 0.5) * chunkWorldSize
      this.mesh.boundingSphere = new THREE.Sphere(center, Math.hypot(extent, extent, maxHeight * layerHeight + this.voxelHeight * 12))
      this.updateColors()
    }

    let firstChanged = Infinity
    let lastChanged = 0
    for (const [key, chunk] of this.cache) {
      const slot = activeSlots.get(key)
      const mode = !slot ? 'covered' : slot.columnTransition?.active ? 'dissolving' : 'revealed'
      if (!moved && mode === chunk.mode && mode !== 'dissolving' && !chunk.appearing)
        continue
      chunk.mode = mode
      this.updateChunk(chunk, slot, now)
      firstChanged = Math.min(firstChanged, chunk.start * 16)
      lastChanged = Math.max(lastChanged, (chunk.start + chunk.cells.length) * 16)
    }
    if (lastChanged > firstChanged) {
      // Pending uploads can span multiple updates before a render (pause/teleport).
      const attribute = this.mesh.instanceMatrix
      for (const range of attribute.updateRanges) {
        firstChanged = Math.min(firstChanged, range.start)
        lastChanged = Math.max(lastChanged, range.start + range.count)
      }
      attribute.clearUpdateRanges()
      attribute.addUpdateRange(firstChanged, lastChanged - firstChanged)
      attribute.needsUpdate = true
    }
    this.mesh.visible = this.visible && (this.config.chunks.debugSpacing ?? 0) === 0
  }

  updateChunk(chunk, slot, now) {
    const matrix = this.mesh.instanceMatrix.array
    const progressByCell = slot?.columnTransition?.progress
    const size = this.chunkSize
    const span = this.placeholder.cellSpan
    const { cellSize } = this.config.terrain
    const seed = this.config.seed + 52817
    chunk.appearing = false
    chunk.cells.forEach((cell, index) => {
      const localX = cell % size
      const localZ = (cell - localX) / size
      const blockX = chunk.coord.x * size + localX
      const blockZ = chunk.coord.z * size + localZ
      const appear = smoothstep(clamp01((now - chunk.shownAt[cell]) / APPEAR_SECONDS))
      if (appear < 1)
        chunk.appearing = true
      const progress = !slot ? 0 : progressByCell ? progressByCell[cell] : 1
      const noise = random01(blockX, blockZ, seed)
      const dissolveStart = 0.05 + noise * 0.2
      const dissolveEnd = 0.6 + random01(blockX, blockZ, seed + 117) * 0.3
      const dissolve = smoothstep(clamp01((progress - dissolveStart) / (dissolveEnd - dissolveStart)))
      const scale = appear * (1 - dissolve)
      const sizeY = chunk.layers[cell] * this.voxelHeight
      const base = chunk.bases[Math.floor(localZ / span) * chunk.boxes + Math.floor(localX / span)]
      const offset = (chunk.start + index) * 16
      matrix.fill(0, offset, offset + 16)
      matrix[offset] = this.voxelSize * scale
      matrix[offset + 5] = sizeY * scale
      matrix[offset + 10] = this.voxelSize * scale
      matrix[offset + 12] = (blockX + 0.5) * cellSize + (noise - 0.5) * cellSize * 2 * dissolve
      matrix[offset + 13] = base + sizeY / 2 + this.voxelHeight * 3 * dissolve
      matrix[offset + 14] = (blockZ + 0.5) * cellSize + (random01(blockX, blockZ, seed + 61) - 0.5) * cellSize * 2 * dissolve
      matrix[offset + 15] = 1
    })
  }

  updateColors() {
    const color = new THREE.Color()
    const seed = this.config.seed + 52823
    const size = this.chunkSize
    for (const chunk of this.cache.values()) {
      chunk.cells.forEach((cell, index) => {
        const tint = 0.93 + random01(chunk.coord.x * size + cell % size, chunk.coord.z * size + Math.floor(cell / size), seed) * 0.07
        this.mesh.setColorAt(chunk.start + index, color.setScalar(tint))
      })
    }
    if (this.mesh.instanceColor)
      this.mesh.instanceColor.needsUpdate = true
  }

  refresh(visible = true) {
    this.visible = visible
    this.mesh.visible = visible && this.centerCoord !== null && (this.config.chunks.debugSpacing ?? 0) === 0
  }

  reset() {
    this.cache.clear()
    this.centerCoord = null
    this.mesh.count = 0
    this.mesh.visible = false
    this.mesh.instanceMatrix.clearUpdateRanges()
  }

  dispose() {
    this.reset()
    this.parentGroup.remove(this.mesh)
    this.mesh.dispose()
    this.geometry.dispose()
    this.material.dispose()
  }
}
