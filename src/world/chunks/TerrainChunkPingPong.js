import TerrainBrickRenderer from '../bricks/TerrainBrickRenderer.js'
import WaterBrickRenderer from '../bricks/WaterBrickRenderer.js'
import LavaBrickRenderer from '../bricks/LavaBrickRenderer.js'
import HeightfieldAO from '../bricks/HeightfieldAO.js'
import PrefabPlacer from '../prefabs/PrefabPlacer.js'
import {
  coordsEqual,
  getPrefetchChunkCoord,
  getRenderChunkCoord,
  getRenderChunkOrigin,
  getWorldBlockFromPosition,
  toLocalCell
} from './chunkCoordinates.js'
import ChunkRenderSlot from './ChunkRenderSlot.js'

export default class TerrainChunkPingPong {
  constructor({
    config,
    terrainGenerator,
    layeredTerrainBuilder,
    brickColorResolver,
    brickGeometry,
    parentGroup,
    biomeRegistry = null,
    prefabRegistry = null,
    waterNoiseTexture = null,
    lavaConfig = {},
    lavaNoiseTexture = null
  }) {
    this.config = config
    this.terrainGenerator = terrainGenerator
    this.layeredTerrainBuilder = layeredTerrainBuilder
    this.brickColorResolver = brickColorResolver
    this.parentGroup = parentGroup
    this.biomeRegistry = biomeRegistry
    this.prefabRegistry = prefabRegistry
    this.waterNoiseTexture = waterNoiseTexture
    this.lavaConfig = lavaConfig
    this.lavaNoiseTexture = lavaNoiseTexture

    const chunkConfig = config.chunks ?? {}
    this.chunkSize = chunkConfig.size ?? 32
    this.halo = chunkConfig.halo ?? 1
    this.prefetchThreshold = chunkConfig.prefetchThreshold ?? 0.2
    this.cellSize = config.terrain.cellSize

    this.slots = [
      this.createSlot(0, brickGeometry),
      this.createSlot(1, brickGeometry)
    ]
    this.activeIndex = 0
    this.playerCoord = null

    for (const slot of this.slots) {
      this.parentGroup.add(slot.group)
    }
  }

  createSlot(index, brickGeometry) {
    const prefabPlacer = this.prefabRegistry && this.biomeRegistry
      ? new PrefabPlacer({
        config: this.config,
        biomeRegistry: this.biomeRegistry,
        prefabRegistry: this.prefabRegistry
      })
      : null

    return new ChunkRenderSlot({
      index,
      chunkSize: this.chunkSize,
      cellSize: this.cellSize,
      terrainRenderer: new TerrainBrickRenderer({
        config: this.config,
        brickGeometry
      }),
      heightfieldAO: new HeightfieldAO({ config: this.config }),
      prefabPlacer,
      waterRenderer: new WaterBrickRenderer({
        config: this.config,
        brickGeometry,
        waterNoiseTexture: this.waterNoiseTexture
      }),
      lavaRenderer: new LavaBrickRenderer({
        config: this.config,
        brickGeometry,
        lavaConfig: this.lavaConfig,
        lavaNoiseTexture: this.lavaNoiseTexture
      })
    })
  }

  get activeSlot() {
    return this.slots[this.activeIndex]
  }

  get standbySlot() {
    return this.slots[1 - this.activeIndex]
  }

  bootstrap(worldX, worldZ) {
    const worldBlock = getWorldBlockFromPosition(worldX, worldZ, this.cellSize)
    const coord = getRenderChunkCoord(worldBlock.x, worldBlock.z, this.chunkSize)
    this.playerCoord = coord
    this.fillSlot(this.activeSlot, coord)
    this.activeSlot.show()
    this.standbySlot.hide()
  }

  update(worldX, worldZ) {
    const worldBlock = getWorldBlockFromPosition(worldX, worldZ, this.cellSize)
    const coord = getRenderChunkCoord(worldBlock.x, worldBlock.z, this.chunkSize)

    if (!coordsEqual(coord, this.activeSlot.coord)) {
      this.switchToChunk(coord)
    }

    this.playerCoord = coord
    this.maybePrefetch(worldBlock, coord)
  }

  switchToChunk(coord) {
    if (this.standbySlot.isLoadedFor(coord)) {
      this.standbySlot.show()
      this.activeSlot.hide()
      this.activeIndex = 1 - this.activeIndex
      return
    }

    this.fillSlot(this.standbySlot, coord)
    this.standbySlot.show()
    this.activeSlot.hide()
    this.activeIndex = 1 - this.activeIndex
  }

  maybePrefetch(worldBlock, activeCoord) {
    const origin = getRenderChunkOrigin(activeCoord, this.chunkSize)
    const localCell = toLocalCell(origin, worldBlock.x, worldBlock.z)
    const prefetchCoord = getPrefetchChunkCoord(
      activeCoord,
      localCell,
      this.chunkSize,
      this.prefetchThreshold
    )

    if (coordsEqual(prefetchCoord, activeCoord)) {
      return
    }

    if (this.standbySlot.isLoadedFor(prefetchCoord)) {
      return
    }

    this.fillSlot(this.standbySlot, prefetchCoord)
    this.standbySlot.hide()
  }

  fillSlot(slot, coord) {
    const origin = getRenderChunkOrigin(coord, this.chunkSize)
    const terrainMap = this.terrainGenerator.generateChunk({
      origin,
      size: this.chunkSize,
      halo: this.halo
    })
    const placements = this.layeredTerrainBuilder.buildPlacements(terrainMap)

    slot.populate({
      coord,
      terrainMap,
      placements,
      colorResolver: this.brickColorResolver
    })
  }

  refreshAOPreview(showOverlays = true) {
    for (const slot of this.slots) {
      slot.updateInstanceColors()
      slot.setOverlaysVisible(showOverlays && slot.group.visible)
    }
  }

  getDebugMaterials() {
    return {
      legoMaterial: this.activeSlot.terrainRenderer.material,
      waterMaterial: this.activeSlot.waterRenderer?.material ?? null
    }
  }

  dispose() {
    for (const slot of this.slots) {
      slot.dispose()
    }
    this.slots.length = 0
  }
}
