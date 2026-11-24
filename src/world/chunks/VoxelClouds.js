import * as THREE from 'three/webgpu'
import { createNoise2D } from 'simplex-noise'
import { mulberry32 } from '../../utils/random.js'
import { getChunkWindowCoords, getRenderChunkKey } from './chunkCoordinates.js'
import { createCloudLayerGeometry } from './cloudLayerGeometry.js'

export default class VoxelClouds {
  constructor({ config, parentGroup, placeholder, releaseSceneObjects = null }) {
    this.config = config
    this.placeholder = placeholder
    this.releaseSceneObjects = releaseSceneObjects
    const settings = config.chunks.clouds ?? {}
    const { cellSize, layerHeight, maxHeight } = config.terrain
    const cellSpan = Number.isFinite(settings.cellSpan) ? Math.max(1, Math.floor(settings.cellSpan)) : 4
    this.chunkSpan = config.chunks.size * cellSize
    this.cellsPerChunk = Math.ceil(config.chunks.size / cellSpan)
    this.cellSize = this.chunkSpan / this.cellsPerChunk
    this.thickness = Number.isFinite(settings.thickness) && settings.thickness > 0 ? settings.thickness : 0.76
    this.windowRadius = config.chunks.windowRadius ?? 1
    this.radius = placeholder.radius
    this.fieldSize = (this.radius * 2 + 1) * this.cellsPerChunk
    this.mask = new Uint8Array(this.fieldSize ** 2)
    this.chunkMasks = new Map()
    this.centerCoord = null
    this.visible = true

    const maxCoarseTop = placeholder.getTop(maxHeight)
    const maxMidTop = placeholder.midground ? placeholder.getTop(maxHeight, placeholder.midground.step) : maxCoarseTop
    const maxTerrainTop = Math.max(maxCoarseTop, maxMidTop)
    this.height = Number.isFinite(settings.baseHeight) ? settings.baseHeight : maxTerrainTop + 5 * layerHeight
    this.groundLimit = this.height - 2 * layerHeight
    this.clipsTerrain = this.groundLimit < maxTerrainTop
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material)
    this.mesh.name = 'VoxelClouds'
    this.mesh.visible = false
    parentGroup.add(this.mesh)
  }

  sampleChunk(coord) {
    const { x, z } = coord
    const resolution = this.cellsPerChunk
    const mask = new Uint8Array(resolution ** 2)
    for (let row = 0; row < resolution; row++) {
      const worldZ = (z * resolution + row + 0.5) * this.cellSize
      for (let col = 0; col < resolution; col++) {
        const worldX = (x * resolution + col + 0.5) * this.cellSize
        const coverage = this.noise2D(worldX / 11, worldZ / 11) * 0.74
          + this.noise2D(worldX / 3.8 + 17, worldZ / 3.8 - 11) * 0.26
        mask[row * resolution + col] = Number(coverage > 0.17)
      }
    }
    if (this.clipsTerrain && mask.some(Boolean)) {
      const key = getRenderChunkKey(coord)
      const coarse = this.placeholder.cache.get(key) ?? this.placeholder.createChunk(coord)
      this.clearTerrainCells(mask, coarse.voxels, x, z)
      const midground = this.placeholder.midground
      if (midground) {
        // Reserve clearance for the finer tiles even before their mesh is ready.
        const tiles = midground.patches.get(key)?.tiles ?? this.placeholder.createChunk(coord, midground.span, midground.step).voxels
        this.clearTerrainCells(mask, tiles, x, z)
      }
    }
    return mask
  }

  clearTerrainCells(mask, tiles, chunkX, chunkZ) {
    const resolution = this.cellsPerChunk
    const cellSize = this.cellSize
    const originX = chunkX * this.chunkSpan
    const originZ = chunkZ * this.chunkSpan
    // Treat exact shared grid boundaries as touching rather than overlapping.
    const tolerance = 1e-7
    for (const tile of tiles) {
      if (tile.top <= this.groundLimit) continue
      const x = tile.x - originX
      const z = tile.z - originZ
      const startX = Math.max(0, Math.floor((x - tile.size * 0.5) / cellSize + tolerance))
      const startZ = Math.max(0, Math.floor((z - tile.sizeZ * 0.5) / cellSize + tolerance))
      const endX = Math.min(resolution, Math.ceil((x + tile.size * 0.5) / cellSize - tolerance))
      const endZ = Math.min(resolution, Math.ceil((z + tile.sizeZ * 0.5) / cellSize - tolerance))
      for (let row = startZ; row < endZ; row++) {
        mask.fill(0, row * resolution + startX, row * resolution + endX)
      }
    }
  }

  update(center) {
    if (!center) return
    if (this.seed !== this.config.seed) {
      this.seed = this.config.seed
      this.noise2D = createNoise2D(mulberry32(this.seed + 7919))
      this.chunkMasks.clear()
      this.centerCoord = null
    }
    if (this.centerCoord?.x !== center.x || this.centerCoord?.z !== center.z) {
      this.rebuild(center)
    }
    this.refresh(this.visible)
  }

  rebuild(center) {
    const firstX = center.x - this.radius
    const firstZ = center.z - this.radius
    const resolution = this.cellsPerChunk
    const cache = new Map()
    this.mask.fill(0)
    for (const coord of getChunkWindowCoords(center, this.radius)) {
      const distance = Math.max(Math.abs(coord.x - center.x), Math.abs(coord.z - center.z))
      if (distance <= this.windowRadius) continue
      const key = getRenderChunkKey(coord)
      const mask = this.chunkMasks.get(key) ?? this.sampleChunk(coord)
      cache.set(key, mask)
      const startX = (coord.x - firstX) * resolution
      const startZ = (coord.z - firstZ) * resolution
      for (let row = 0; row < resolution; row++) {
        this.mask.set(mask.subarray(row * resolution, (row + 1) * resolution), (startZ + row) * this.fieldSize + startX)
      }
    }

    const geometry = createCloudLayerGeometry({
      mask: this.mask,
      width: this.fieldSize,
      depth: this.fieldSize,
      cellSize: this.cellSize,
      thickness: this.thickness,
    })
    this.releaseGeometry()
    this.mesh.geometry = geometry
    this.mesh.position.set(firstX * this.chunkSpan, this.height, firstZ * this.chunkSpan)
    this.chunkMasks = cache
    this.centerCoord = { ...center }
  }

  refresh(visible = true) {
    this.visible = visible
    this.mesh.visible = visible && this.mesh.geometry.index?.count > 0 && (this.config.chunks.debugSpacing ?? 0) === 0
  }

  releaseGeometry() {
    this.releaseSceneObjects?.(this.mesh)
    this.mesh.geometry.dispose()
  }

  reset() {
    this.chunkMasks.clear()
    this.centerCoord = null
    this.mesh.visible = false
    this.releaseGeometry()
    this.mesh.geometry = new THREE.BufferGeometry()
  }

  dispose() {
    this.releaseGeometry()
    this.chunkMasks.clear()
    this.mesh.removeFromParent()
    this.mesh.material.dispose()
  }
}
