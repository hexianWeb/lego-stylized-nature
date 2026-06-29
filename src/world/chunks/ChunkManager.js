import TerrainBrickRenderer from '../bricks/TerrainBrickRenderer.js'
import WaterBrickRenderer from '../bricks/WaterBrickRenderer.js'
import LavaBrickRenderer from '../bricks/LavaBrickRenderer.js'
import HeightfieldAO from '../bricks/HeightfieldAO.js'
import PrefabPlacer from '../prefabs/PrefabPlacer.js'
import {
  getChunkWindowCoords,
  getPlayerPrefabWindowCoords,
  getRenderChunkCoord,
  getRenderChunkKey,
  getRenderChunkOrigin,
  getWorldBlockFromPosition
} from './chunkCoordinates.js'
import ChunkRenderSlot from './ChunkRenderSlot.js'

export default class ChunkManager {
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
    lavaNoiseTexture = null,
    createSlot = null
  }) {
    this.config = config
    this.terrainGenerator = terrainGenerator
    this.layeredTerrainBuilder = layeredTerrainBuilder
    this.brickColorResolver = brickColorResolver
    this.brickGeometry = brickGeometry
    this.parentGroup = parentGroup
    this.biomeRegistry = biomeRegistry
    this.prefabRegistry = prefabRegistry
    this.waterNoiseTexture = waterNoiseTexture
    this.lavaConfig = lavaConfig
    this.lavaNoiseTexture = lavaNoiseTexture
    this.createSlotOverride = createSlot

    const chunkConfig = config.chunks ?? {}
    this.chunkSize = chunkConfig.size ?? 64
    this.halo = chunkConfig.halo ?? 1
    this.windowRadius = chunkConfig.windowRadius ?? 1
    this.maxPendingBuildsPerFrame = chunkConfig.maxPendingBuildsPerFrame ?? 1
    this.maxPrefabBuildsPerFrame = chunkConfig.maxPrefabBuildsPerFrame ?? 1
    this.visibilityPadding = chunkConfig.visibilityPadding ?? 0
    this.debugSpacing = chunkConfig.debugSpacing ?? 0
    this.cellSize = config.terrain.cellSize

    const slotCount = (this.windowRadius * 2 + 1) ** 2
    this.slots = Array.from({ length: slotCount }, (_, index) => this.createSlot(index))
    this.freeSlots = [...this.slots]
    this.activeSlots = new Map()
    this.pendingQueue = []
    this.pendingKeys = new Set()
    this.pendingPrefabBuildQueue = []
    this.pendingPrefabBuildKeys = new Set()
    this.centerCoord = null
    this.bootstrapped = false

    for (const slot of this.slots) {
      slot.hide()
      this.parentGroup.add(slot.group)
    }
  }

  resetLoadedState() {
    for (const slot of this.slots) {
      slot.hide()
      slot.setPrefabsVisible?.(false)
    }

    this.activeSlots.clear()
    this.pendingQueue.length = 0
    this.pendingKeys.clear()
    this.pendingPrefabBuildQueue.length = 0
    this.pendingPrefabBuildKeys.clear()
    this.freeSlots = [...this.slots]
    this.centerCoord = null
    this.bootstrapped = false
  }

  createSlot(index) {
    if (this.createSlotOverride) {
      return this.createSlotOverride(index)
    }

    const prefabsEnabled = this.config.placement?.enablePrefabs !== false
    const prefabPlacer = prefabsEnabled && this.prefabRegistry && this.biomeRegistry
      ? new PrefabPlacer({
        config: this.config,
        biomeRegistry: this.biomeRegistry,
        prefabRegistry: this.prefabRegistry
      })
      : null

    const waterEnabled = this.config.water?.enableWater !== false
    return new ChunkRenderSlot({
      index,
      chunkSize: this.chunkSize,
      cellSize: this.cellSize,
      terrainRenderer: new TerrainBrickRenderer({
        config: this.config,
        brickGeometry: this.brickGeometry
      }),
      heightfieldAO: new HeightfieldAO({ config: this.config }),
      prefabPlacer,
      waterRenderer: waterEnabled
        ? new WaterBrickRenderer({
          config: this.config,
          brickGeometry: this.brickGeometry,
          waterNoiseTexture: this.waterNoiseTexture
        })
        : null,
      lavaRenderer: new LavaBrickRenderer({
        config: this.config,
        brickGeometry: this.brickGeometry,
        lavaConfig: this.lavaConfig,
        lavaNoiseTexture: this.lavaNoiseTexture
      })
    })
  }

  bootstrap(worldX, worldZ, camera = null) {
    this.resetLoadedState()

    const worldBlock = this.getStableWorldBlockFromPosition(worldX, worldZ)
    const centerCoord = getRenderChunkCoord(worldBlock.x, worldBlock.z, this.chunkSize)

    this.centerCoord = centerCoord
    this.bootstrapped = true
    this.loadCoordNow(centerCoord)
    this.queuePendingCoords(getChunkWindowCoords(centerCoord, this.windowRadius))
    this.updateVisibility(worldBlock)
  }

  getStableWorldBlockFromPosition(worldX, worldZ) {
    const worldBlock = getWorldBlockFromPosition(worldX, worldZ, this.cellSize)

    return {
      x: this.snapNearIntegerBlock(worldX, worldBlock.x),
      z: this.snapNearIntegerBlock(worldZ, worldBlock.z)
    }
  }

  snapNearIntegerBlock(worldPosition, fallbackBlock) {
    const scaled = worldPosition / this.cellSize
    const rounded = Math.round(scaled)

    return Math.abs(scaled - rounded) < 1e-9 ? rounded : fallbackBlock
  }

  update(worldX, worldZ, camera = null) {
    if (!this.bootstrapped) {
      this.bootstrap(worldX, worldZ, camera)
      return
    }

    const worldBlock = this.getStableWorldBlockFromPosition(worldX, worldZ)
    const nextCenterCoord = getRenderChunkCoord(worldBlock.x, worldBlock.z, this.chunkSize)

    if (!this.coordsEqual(this.centerCoord, nextCenterCoord)) {
      this.reconcileRequiredWindow(nextCenterCoord)
    }

    this.buildPendingChunks()
    this.updateVisibility(worldBlock)
  }

  coordsEqual(a, b) {
    return a !== null && b !== null && a.x === b.x && a.z === b.z
  }

  reconcileRequiredWindow(nextCenterCoord) {
    this.centerCoord = { ...nextCenterCoord }

    const requiredCoords = getChunkWindowCoords(nextCenterCoord, this.windowRadius)
    const requiredKeys = new Set(requiredCoords.map((coord) => getRenderChunkKey(coord)))

    for (const [key, slot] of this.activeSlots) {
      if (requiredKeys.has(key)) {
        continue
      }

      slot.hide()
      slot.setPrefabsVisible?.(false)
      this.removePendingPrefabBuild(key)
      this.activeSlots.delete(key)
      this.freeSlots.push(slot)
    }

    this.pendingQueue = this.pendingQueue.filter((coord) => {
      const key = getRenderChunkKey(coord)
      return requiredKeys.has(key) && !this.activeSlots.has(key)
    })
    this.pendingKeys = new Set(this.pendingQueue.map((coord) => getRenderChunkKey(coord)))

    const centerKey = getRenderChunkKey(nextCenterCoord)
    if (!this.activeSlots.has(centerKey)) {
      this.loadCoordNow(nextCenterCoord)
    }

    this.queuePendingCoords(requiredCoords)
  }

  queuePendingCoords(coords) {
    for (const coord of coords) {
      const key = getRenderChunkKey(coord)
      if (this.activeSlots.has(key) || this.pendingKeys.has(key)) {
        continue
      }

      this.pendingQueue.push({ ...coord })
      this.pendingKeys.add(key)
    }
  }

  removePendingCoord(coord) {
    const key = getRenderChunkKey(coord)
    if (!this.pendingKeys.has(key)) {
      return
    }

    this.pendingQueue = this.pendingQueue.filter((pendingCoord) => getRenderChunkKey(pendingCoord) !== key)
    this.pendingKeys.delete(key)
  }

  removePendingPrefabBuild(key) {
    if (!this.pendingPrefabBuildKeys.has(key)) {
      return
    }

    this.pendingPrefabBuildQueue = this.pendingPrefabBuildQueue.filter((pendingKey) => pendingKey !== key)
    this.pendingPrefabBuildKeys.delete(key)
  }

  buildPendingChunks() {
    let built = 0

    while (built < this.maxPendingBuildsPerFrame && this.pendingQueue.length > 0) {
      const coord = this.pendingQueue.shift()
      this.pendingKeys.delete(getRenderChunkKey(coord))
      if (this.loadCoordNow(coord)) {
        built++
      }
    }
  }

  buildPendingPrefabs(desiredPrefabKeys) {
    this.pendingPrefabBuildQueue = this.pendingPrefabBuildQueue.filter((key) => {
      const keep = desiredPrefabKeys.has(key) && this.activeSlots.has(key)
      if (!keep) {
        this.pendingPrefabBuildKeys.delete(key)
      }
      return keep
    })

    let built = 0
    while (built < this.maxPrefabBuildsPerFrame && this.pendingPrefabBuildQueue.length > 0) {
      const key = this.pendingPrefabBuildQueue.shift()
      this.pendingPrefabBuildKeys.delete(key)

      if (!desiredPrefabKeys.has(key)) {
        continue
      }

      const slot = this.activeSlots.get(key)
      if (!slot) {
        continue
      }

      slot.ensurePrefabsBuilt?.()
      slot.setPrefabsVisible?.(true)
      built++
    }
  }

  loadCoordNow(coord) {
    this.removePendingCoord(coord)

    const key = getRenderChunkKey(coord)
    const activeSlot = this.activeSlots.get(key)
    if (activeSlot) {
      return activeSlot
    }

    const slot = this.freeSlots.shift()
    if (!slot) {
      throw new Error(`[ChunkManager] No free slot available for chunk ${key}`)
    }

    this.fillSlot(slot, coord)
    this.activeSlots.set(key, slot)
    return slot
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
      colorResolver: this.brickColorResolver,
      debugSpacing: this.debugSpacing
    })
  }

  setDebugSpacing(spacing) {
    this.debugSpacing = spacing
    this.config.chunks.debugSpacing = spacing

    for (const slot of this.slots) {
      slot.updateWorldPosition(spacing)
    }
  }

  updateVisibility(worldBlock) {
    const prefabActiveKeys = new Set(
      getPlayerPrefabWindowCoords(worldBlock, this.chunkSize).map((coord) => getRenderChunkKey(coord))
    )

    for (const [key, slot] of this.activeSlots) {
      slot.show()

      if (prefabActiveKeys.has(key)) {
        if (slot.prefabsBuiltForKey === key) {
          slot.setPrefabsVisible?.(true)
        } else if (!this.pendingPrefabBuildKeys.has(key)) {
          slot.setPrefabsVisible?.(false)
          this.pendingPrefabBuildQueue.push(key)
          this.pendingPrefabBuildKeys.add(key)
        }
        continue
      }

      slot.setPrefabsVisible?.(false)
      this.removePendingPrefabBuild(key)
    }

    this.buildPendingPrefabs(prefabActiveKeys)
  }

  refreshAOPreview(showOverlays = true) {
    for (const slot of this.slots) {
      slot.updateInstanceColors()
      slot.setOverlaysVisible(showOverlays && slot.group.visible)
    }
  }

  getDebugMaterials() {
    const slot = this.activeSlots.values().next().value ?? this.slots[0]

    return {
      legoMaterial: slot?.terrainRenderer?.material ?? null,
      waterMaterial: slot?.waterRenderer?.material ?? null
    }
  }

  dispose() {
    for (const slot of this.slots) {
      slot.dispose()
      slot.group.parent?.remove(slot.group)
    }

    this.slots.length = 0
    this.freeSlots.length = 0
    this.activeSlots.clear()
    this.pendingQueue.length = 0
    this.pendingKeys.clear()
    this.pendingPrefabBuildQueue.length = 0
    this.pendingPrefabBuildKeys.clear()
  }
}
