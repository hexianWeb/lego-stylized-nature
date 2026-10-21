import * as THREE from 'three/webgpu'
import { random01 } from '../../utils/random.js'
import { getChunkWindowCoords, getRenderChunkKey } from './chunkCoordinates.js'

const clamp01 = value => Math.max(0, Math.min(1, value))
const smoothstep = value => value * value * (3 - 2 * value)
// Broad, thin base; two uneven puffs; one offset crown. The deliberate silhouette
// stays readable at a distance instead of filling every cell with noisy voxels.
const CLOUD_PROFILE = [
  [-1, 0, -1], [0, 0, -1], [1, 0, -1],
  [-3, 0, 0], [-2, 0, 0], [-1, 0, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0],
  [-1, 0, 1], [0, 0, 1], [1, 0, 1],
  [-1, 1, -1], [0, 1, -1], [-2, 1, 0], [-1, 1, 0], [0, 1, 0], [2, 1, 0], [-1, 1, 1], [0, 1, 1],
  [-1, 2, 0], [0, 2, 0], [2, 2, 0], [-1, 3, 0],
]

/** A fixed instance pool of cloud banks, dissolved by the terrain's own column clock. */
export default class VoxelClouds {
  constructor({ config, parentGroup }) {
    this.config = config
    this.parentGroup = parentGroup
    const settings = config.chunks.clouds ?? config.chunks.distantTerrain ?? {}
    this.chunkSize = config.chunks.size
    this.windowRadius = config.chunks.windowRadius ?? 1
    const configuredRadius = Number.isFinite(settings.radius) ? Math.floor(settings.radius) : 3
    this.radius = Math.max(this.windowRadius + 1, Math.min(5, configuredRadius))
    const chunkWorldSize = this.chunkSize * config.terrain.cellSize
    this.anchorSpacing = chunkWorldSize / 2
    this.voxelSize = chunkWorldSize / 13.5
    this.maxCloudRadius = this.voxelSize * 4.2
    this.cache = new Map()
    this.centerCoord = null
    this.activeSlots = null
    this.visible = true
    this.background = new THREE.Color('#6aca97')
    this.lightColor = new THREE.Color('#ffffff')
    this.shadowColor = new THREE.Color('#f1f7fc')

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
    const anchorsPerAxis = Math.ceil((chunkWorldSize + 2 * this.maxCloudRadius) / this.anchorSpacing + 0.12) + 1
    this.capacity = (this.radius * 2 + 1) ** 2 * anchorsPerAxis ** 2 * CLOUD_PROFILE.length
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity)
    this.mesh.name = 'VoxelClouds'
    this.mesh.count = 0
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.castShadow = false
    this.mesh.receiveShadow = false
    parentGroup.add(this.mesh)
  }

  createCloud(anchorX, anchorZ) {
    const seed = this.config.seed + 52817
    const unit = this.voxelSize * (0.86 + random01(anchorX, anchorZ, seed) * 0.22)
    const variant = Math.floor(random01(anchorX, anchorZ, seed + 1) * 3)
    const rotation = Math.floor(random01(anchorX, anchorZ, seed + 2) * 4)
    const centerX = (anchorX + 0.5 + (random01(anchorX, anchorZ, seed + 3) - 0.5) * 0.12) * this.anchorSpacing
    const centerZ = (anchorZ + 0.5 + (random01(anchorX, anchorZ, seed + 4) - 0.5) * 0.12) * this.anchorSpacing
    const { layerHeight, maxHeight } = this.config.terrain
    const baseHeight = maxHeight * layerHeight * 0.28 + (0.2 + random01(anchorX, anchorZ, seed + 5) * 0.7) * this.voxelSize
    const cloudId = `${anchorX}:${anchorZ}`
    const voxels = []
    CLOUD_PROFILE.forEach(([profileX, layer, profileZ], index) => {
      if (variant === 1 && (layer === 3 || (layer === 2 && profileX === 2))) return
      let x = variant === 2 ? -profileX : profileX
      let z = profileZ
      for (let turn = 0; turn < rotation; turn++) [x, z] = [-z, x]
      const noise = random01(anchorX, anchorZ, seed + 83 + index * 37)
      voxels.push({
        cloudId,
        x: centerX + x * unit,
        y: baseHeight + (layer === 0 ? 0 : 0.88 + (layer - 1) * 0.95) * unit,
        z: centerZ + z * unit,
        size: unit * 1.02,
        sizeY: unit * (layer === 0 ? 0.84 : 1.02),
        sizeZ: unit * 1.02,
        tint: 0.9 + random01(anchorX, anchorZ, seed + 6) * 0.1,
        dissolveStart: 0.07 + noise * 0.2,
        dissolveEnd: 0.77 + random01(anchorX, anchorZ, seed + index * 117) * 0.2,
        driftX: (noise - 0.5) * unit * 0.4,
        driftZ: (random01(anchorX, anchorZ, seed + index * 61) - 0.5) * unit * 0.4,
      })
    })
    return voxels
  }

  createChunk(coord) {
    const { cellSize } = this.config.terrain
    const span = this.chunkSize * cellSize
    const minX = coord.x * span
    const minZ = coord.z * span
    const minAnchorX = Math.ceil((minX - this.maxCloudRadius) / this.anchorSpacing - 0.56)
    const maxAnchorX = Math.floor((minX + span + this.maxCloudRadius) / this.anchorSpacing - 0.44)
    const minAnchorZ = Math.ceil((minZ - this.maxCloudRadius) / this.anchorSpacing - 0.56)
    const maxAnchorZ = Math.floor((minZ + span + this.maxCloudRadius) / this.anchorSpacing - 0.44)
    const voxels = []
    for (let z = minAnchorZ; z <= maxAnchorZ; z++) {
      for (let x = minAnchorX; x <= maxAnchorX; x++) {
        for (const voxel of this.createCloud(x, z)) {
          if (voxel.x < minX || voxel.x >= minX + span || voxel.z < minZ || voxel.z >= minZ + span) continue
          const cellX = Math.min(this.chunkSize - 1, Math.floor((voxel.x - minX) / cellSize))
          const cellZ = Math.min(this.chunkSize - 1, Math.floor((voxel.z - minZ) / cellSize))
          voxels.push({ ...voxel, cell: cellZ * this.chunkSize + cellX })
        }
      }
    }
    return { coord: { ...coord }, voxels, start: 0, mode: null }
  }

  update(centerCoord, activeSlots = new Map()) {
    if (!centerCoord)
      return
    const moved = this.centerCoord?.x !== centerCoord.x || this.centerCoord?.z !== centerCoord.z
    this.activeSlots = activeSlots
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
        chunk.start = start
        start += chunk.voxels.length
      }
      this.mesh.count = start
      const chunkWorldSize = this.chunkSize * this.config.terrain.cellSize
      const center = new THREE.Vector3((centerCoord.x + 0.5) * chunkWorldSize, 0, (centerCoord.z + 0.5) * chunkWorldSize)
      const extent = (this.radius + 0.5) * chunkWorldSize + this.voxelSize
      this.mesh.boundingSphere = new THREE.Sphere(center, Math.hypot(extent, extent, this.config.terrain.maxHeight * this.config.terrain.layerHeight + this.voxelSize * 4))
      this.updateColors()
    }

    let firstChanged = Infinity
    let lastChanged = 0
    for (const [key, chunk] of this.cache) {
      const slot = activeSlots.get(key)
      const mode = !slot ? 'covered' : slot.columnTransition?.active ? 'dissolving' : 'revealed'
      if (!moved && mode === chunk.mode && mode !== 'dissolving')
        continue
      chunk.mode = mode
      this.updateChunk(chunk, slot)
      firstChanged = Math.min(firstChanged, chunk.start * 16)
      lastChanged = Math.max(lastChanged, (chunk.start + chunk.voxels.length) * 16)
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

  updateChunk(chunk, slot) {
    const matrix = this.mesh.instanceMatrix.array
    const transition = slot?.columnTransition
    for (let index = 0; index < chunk.voxels.length; index++) {
      const voxel = chunk.voxels[index]
      const progress = slot ? transition?.progress[voxel.cell] ?? 1 : 0
      const dissolve = smoothstep(clamp01((progress - voxel.dissolveStart) / (voxel.dissolveEnd - voxel.dissolveStart)))
      const scale = voxel.size * (1 - dissolve)
      const offset = (chunk.start + index) * 16
      matrix.fill(0, offset, offset + 16)
      matrix[offset] = scale
      matrix[offset + 5] = (voxel.sizeY ?? voxel.size) * (1 - dissolve)
      matrix[offset + 10] = (voxel.sizeZ ?? voxel.size) * (1 - dissolve)
      matrix[offset + 12] = voxel.x + voxel.driftX * dissolve
      matrix[offset + 13] = voxel.y + this.voxelSize * 0.7 * dissolve
      matrix[offset + 14] = voxel.z + voxel.driftZ * dissolve
      matrix[offset + 15] = 1
    }
  }

  updateColors() {
    let ancestor = this.parentGroup
    while (ancestor && !ancestor.isScene)
      ancestor = ancestor.parent
    if (ancestor?.background?.isColor)
      this.background.copy(ancestor.background)
    const chunkWorldSize = this.chunkSize * this.config.terrain.cellSize
    const centerX = (this.centerCoord.x + 0.5) * chunkWorldSize
    const centerZ = (this.centerCoord.z + 0.5) * chunkWorldSize
    const inner = (this.windowRadius + 0.5) * chunkWorldSize
    const outer = (this.radius + 0.5) * chunkWorldSize
    const color = new THREE.Color()
    for (const chunk of this.cache.values()) {
      chunk.voxels.forEach((voxel, index) => {
        const distance = Math.max(Math.abs(voxel.x - centerX), Math.abs(voxel.z - centerZ))
        const haze = smoothstep(clamp01((distance - inner) / (outer - inner))) * 0.42
        color.copy(this.shadowColor).lerp(this.lightColor, voxel.tint).lerp(this.background, haze)
        this.mesh.setColorAt(chunk.start + index, color)
      })
    }
    if (this.mesh.instanceColor)
      this.mesh.instanceColor.needsUpdate = true
  }

  refresh(visible = true) {
    this.visible = visible
    if (this.centerCoord)
      this.updateColors()
    this.mesh.visible = visible && this.centerCoord !== null && (this.config.chunks.debugSpacing ?? 0) === 0
  }

  reset() {
    this.cache.clear()
    this.centerCoord = null
    this.activeSlots = null
    this.mesh.count = 0
    this.mesh.visible = false
    this.mesh.instanceMatrix.clearUpdateRanges()
  }

  dispose() {
    this.reset()
    this.mesh.dispose()
    this.geometry.dispose()
    this.material.dispose()
    this.parentGroup.remove(this.mesh)
  }
}
