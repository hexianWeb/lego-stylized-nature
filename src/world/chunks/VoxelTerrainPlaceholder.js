import * as THREE from 'three/webgpu'
import { createNoise2D } from 'simplex-noise'
import { mulberry32, random01 } from '../../utils/random.js'
import BiomeMaskGenerator from '../biomes/BiomeMaskGenerator.js'
import BiomeRegistry from '../biomes/BiomeRegistry.js'
import BiomeBlender from '../biomes/BiomeBlender.js'
import { hasActiveAirPerspective } from '../atmosphere/airPerspective.js'
import BrickColorResolver from '../bricks/BrickColorResolver.js'
import { heightShapers } from '../terrain/heightShapers.js'
import { getChunkWindowCoords, getRenderChunkKey } from './chunkCoordinates.js'
import MidTerrainRing from './MidTerrainRing.js'
import { createPlaceholderTerrainMaterial } from '../../materials/tsl/placeholderTerrainMaterial.js'
import { createPlaceholderColorAttributes, samplePlaceholderPalette, writePlaceholderColors } from './placeholderTerrainPalette.js'

const clamp01 = value => Math.max(0, Math.min(1, value))
const smoothstep = value => value * value * (3 - 2 * value)

/** Coarse biome-colored boxes, dissolved by the detailed terrain's column clock. */
export default class VoxelTerrainPlaceholder {
  constructor({ config, parentGroup, biomeRegistry = new BiomeRegistry(), biomeMaskGenerator = new BiomeMaskGenerator(config), colorResolver = null, releaseSceneObjects = null }) {
    this.config = config
    this.parentGroup = parentGroup
    this.biomeRegistry = biomeRegistry
    this.biomeMaskGenerator = biomeMaskGenerator
    this.colorResolver = colorResolver?.resolveColor ? colorResolver : new BrickColorResolver({
      config, biomeRegistry, biomeBlender: new BiomeBlender(biomeRegistry),
    })
    const settings = config.chunks.placeholder ?? config.chunks.distantTerrain ?? {}
    this.chunkSize = config.chunks.size
    this.windowRadius = config.chunks.windowRadius ?? 1
    const configuredRadius = Number.isFinite(settings.radius) ? Math.floor(settings.radius) : 3
    this.radius = Math.max(this.windowRadius + 1, Math.min(5, configuredRadius))
    this.cellSpan = Math.max(1, Math.min(this.chunkSize, Math.floor(Number.isFinite(settings.cellSpan) ? settings.cellSpan : 12)))
    this.voxelSize = this.cellSpan * config.terrain.cellSize
    this.heightStep = config.terrain.layerHeight * 6
    this.cache = new Map()
    this.centerCoord = null
    this.activeSlots = null
    this.visible = true
    this.background = new THREE.Color('#6aca97')
    this.useBakedHaze = true

    this.geometry = new THREE.BoxGeometry(1, 1, 1)
    this.material = createPlaceholderTerrainMaterial(config.terrain)
    this.capacity = (this.radius * 2 + 1) ** 2 * Math.ceil(this.chunkSize / this.cellSpan) ** 2
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity)
    this.colors = createPlaceholderColorAttributes(this.mesh, this.capacity)
    this.mesh.name = 'VoxelTerrainPlaceholder'
    this.mesh.count = 0
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.castShadow = false
    this.mesh.receiveShadow = false
    parentGroup.add(this.mesh)
    this.midground = settings.midground ? new MidTerrainRing(this, settings.midground, releaseSceneObjects) : null
  }

  sampleHeight(x, z, biomeCell) {
    if (this.noiseSeed !== this.config.seed) {
      this.noise2D = createNoise2D(mulberry32(this.config.seed))
      this.noiseSeed = this.config.seed
    }
    const terrain = this.config.terrain
    let height = terrain.waterLevel
    // Sample the same height functions as TerrainGenerator, only at coarse centers.
    for (const [biomeId, weight] of Object.entries(biomeCell.weights)) {
      if (weight <= 0) continue
      const params = this.biomeRegistry.get(biomeId).terrain.shape
      height += weight * heightShapers[params.type]({
        x, z, noise2D: this.noise2D, terrain, params, site: biomeCell.sites?.[biomeId],
      })
    }
    return Math.max(0, Math.min(terrain.maxHeight, Math.floor(height)))
  }

  getTop(height, step = this.heightStep) {
    return Math.max(step, Math.round((height + 1) * this.config.terrain.layerHeight / step) * step)
  }

  createChunk(coord, span = this.cellSpan, step = this.heightStep) {
    const { cellSize } = this.config.terrain
    const originX = coord.x * this.chunkSize
    const originZ = coord.z * this.chunkSize
    const context = this.biomeMaskGenerator.createSamplingContext()
    const voxels = []
    for (let z = 0; z < this.chunkSize; z += span) {
      for (let x = 0; x < this.chunkSize; x += span) {
        const endX = Math.min(this.chunkSize, x + span)
        const endZ = Math.min(this.chunkSize, z + span)
        const sampleX = originX + Math.floor((x + endX) / 2)
        const sampleZ = originZ + Math.floor((z + endZ) / 2)
        const biomeCell = this.biomeMaskGenerator.getCellBiome(sampleX, sampleZ, context)
        const height = this.sampleHeight(sampleX, sampleZ, biomeCell)
        const top = this.getTop(height, step)
        const noise = random01(sampleX, sampleZ, this.config.seed + 52817)
        voxels.push({
          top,
          x: (originX + (x + endX) / 2) * cellSize,
          y: (top - step) / 2,
          z: (originZ + (z + endZ) / 2) * cellSize,
          size: (endX - x) * cellSize,
          sizeY: top + step,
          sizeZ: (endZ - z) * cellSize,
          sample: { x: sampleX, y: height, z: sampleZ, biomeCell, surfaceCell: { height }, layer: 'surface' },
          // Wait for the trailing edge of this large box: all covered columns
          // have begun rising before its cover contracts, in either direction.
          cells: [z * this.chunkSize + x, z * this.chunkSize + endX - 1,
            (endZ - 1) * this.chunkSize + x, (endZ - 1) * this.chunkSize + endX - 1],
          dissolveStart: 0.07 + noise * 0.12,
          dissolveEnd: 0.85 + noise * 0.12,
          driftX: (noise - 0.5) * this.voxelSize * 0.1,
          driftZ: (random01(sampleX, sampleZ, this.config.seed + 271) - 0.5) * this.voxelSize * 0.1,
        })
      }
    }
    return { coord: { ...coord }, voxels, start: 0, mode: null }
  }

  update(centerCoord, activeSlots = new Map(), deadline = Infinity) {
    if (!centerCoord)
      return
    const moved = this.centerCoord?.x !== centerCoord.x || this.centerCoord?.z !== centerCoord.z
    const scene = this.getScene()
    const useBakedHaze = !hasActiveAirPerspective(scene?.fogNode)
    const recolor = moved || useBakedHaze !== this.useBakedHaze
    this.useBakedHaze = useBakedHaze
    this.activeSlots = activeSlots
    if (moved) {
      this.centerCoord = { ...centerCoord }
      const coords = getChunkWindowCoords(centerCoord, this.radius)
      // Keep the far ring at the front of the instance buffer. When the middle
      // ring is ready, its fallback instances are outside the submitted draw.
      if (this.midground) coords.sort((a, b) =>
        Math.max(Math.abs(b.x - centerCoord.x), Math.abs(b.z - centerCoord.z))
        - Math.max(Math.abs(a.x - centerCoord.x), Math.abs(a.z - centerCoord.z)))
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
    }
    if (recolor)
      this.updateColors(scene)

    const visible = this.visible && (this.config.chunks.debugSpacing ?? 0) === 0
    this.midground?.update(centerCoord, activeSlots, recolor, visible, deadline)
    const useMidground = this.midground && this.midground.mode !== 'coarse'
    let count = 0
    let firstChanged = Infinity
    let lastChanged = 0
    for (const [key, chunk] of this.cache) {
      const slot = activeSlots.get(key)
      const mode = this.midground?.patches.has(key) ? 'replaced'
        : !slot ? 'covered' : slot.columnTransition?.active ? 'dissolving' : 'revealed'
      if (!useMidground || (mode !== 'replaced' && mode !== 'revealed'))
        count = Math.max(count, chunk.start + chunk.voxels.length)
      if (!moved && mode === chunk.mode && mode !== 'dissolving')
        continue
      chunk.mode = mode
      if (mode === 'replaced') {
        this.mesh.instanceMatrix.array.fill(0, chunk.start * 16, (chunk.start + chunk.voxels.length) * 16)
      }
      else this.updateChunk(chunk, slot)
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
    this.mesh.count = count
    this.mesh.visible = visible
  }

  updateChunk(chunk, slot) {
    const matrix = this.mesh.instanceMatrix.array
    const transition = slot?.columnTransition
    for (let index = 0; index < chunk.voxels.length; index++) {
      const voxel = chunk.voxels[index]
      const progress = !slot ? 0 : transition?.progress
        ? Math.min(...voxel.cells.map(cell => transition.progress[cell])) : 1
      const dissolve = smoothstep(clamp01((progress - voxel.dissolveStart) / (voxel.dissolveEnd - voxel.dissolveStart)))
      const scale = voxel.size * (1 - dissolve)
      const offset = (chunk.start + index) * 16
      matrix.fill(0, offset, offset + 16)
      matrix[offset] = scale
      matrix[offset + 5] = (voxel.sizeY ?? voxel.size) * (1 - dissolve)
      matrix[offset + 10] = (voxel.sizeZ ?? voxel.size) * (1 - dissolve)
      matrix[offset + 12] = voxel.x + voxel.driftX * dissolve
      matrix[offset + 13] = voxel.y + this.voxelSize * 0.15 * dissolve
      matrix[offset + 14] = voxel.z + voxel.driftZ * dissolve
      matrix[offset + 15] = 1
    }
  }

  hazeAt(x, z) {
    if (!this.useBakedHaze)
      return 0
    const distance = Math.max(Math.abs(x - this.hazeX), Math.abs(z - this.hazeZ))
    return smoothstep(clamp01((distance - this.hazeInner) / this.hazeSpan)) * 0.32
  }

  getScene() {
    let ancestor = this.parentGroup
    while (ancestor && !ancestor.isScene)
      ancestor = ancestor.parent
    return ancestor
  }

  updateColors(scene = this.getScene(), resample = false) {
    if (scene?.background?.isColor)
      this.background.copy(scene.background)
    const chunkWorldSize = this.chunkSize * this.config.terrain.cellSize
    this.hazeX = (this.centerCoord.x + 0.5) * chunkWorldSize
    this.hazeZ = (this.centerCoord.z + 0.5) * chunkWorldSize
    this.hazeInner = (this.windowRadius + 0.5) * chunkWorldSize
    this.hazeSpan = (this.radius - this.windowRadius) * chunkWorldSize
    for (const chunk of this.cache.values()) {
      if (!chunk.palette || resample) {
        chunk.palette = samplePlaceholderPalette(this.colorResolver, chunk.voxels, chunk.palette)
      }
      writePlaceholderColors(this, chunk.voxels, chunk.palette, this.colors, { start: chunk.start })
    }
    for (const attribute of this.colors) attribute.needsUpdate = true
  }

  refresh(visible = true) {
    this.visible = visible
    this.colorResolver.invalidatePalettes?.()
    if (this.centerCoord)
      this.updateColors(this.getScene(), true)
    this.mesh.visible = visible && this.centerCoord !== null && (this.config.chunks.debugSpacing ?? 0) === 0
    if (this.midground) {
      this.midground.group.visible = this.mesh.visible
      for (const patch of this.midground.patches.values()) patch.updateColors(this, true)
    }
  }

  reset() {
    this.midground?.clear()
    this.cache.clear()
    this.centerCoord = null
    this.activeSlots = null
    this.mesh.count = 0
    this.mesh.visible = false
    this.mesh.instanceMatrix.clearUpdateRanges()
  }

  dispose() {
    this.reset()
    this.midground?.dispose()
    this.mesh.dispose()
    this.geometry.dispose()
    this.material.dispose()
    this.parentGroup.remove(this.mesh)
  }
}
