import HeightfieldAO from '../bricks/HeightfieldAO.js'
import LavaBrickRenderer from '../bricks/LavaBrickRenderer.js'
import TerrainBrickRenderer from '../bricks/TerrainBrickRenderer.js'
import WaterBrickRenderer from '../bricks/WaterBrickRenderer.js'
import PrefabPlacer from '../prefabs/PrefabPlacer.js'
import { unpackChunkBuild } from './chunkBuildData.js'
import {
  getChunkBounds,
  getChunkWindowCoords,
  getRenderChunkCoord,
  getRenderChunkKey,
  getRenderChunkOrigin,
  getWorldBlockFromPosition,
} from './chunkCoordinates.js'
import ChunkRenderSlot from './ChunkRenderSlot.js'
import { CHUNK_TRANSITION_DEFAULTS } from './ChunkColumnTransition.js'
import VoxelTerrainPlaceholder from './VoxelTerrainPlaceholder.js'
import VoxelClouds from './VoxelClouds.js'

export default class ChunkManager {
  constructor({
    config,
    terrainGenerator,
    layeredTerrainBuilder,
    brickColorResolver,
    brickGeometry,
    materials,
    parentGroup,
    biomeRegistry = null,
    prefabRegistry = null,
    createSlot = null,
    buildWorkers = null,
    prepareAhead = false,
    isTerrainReady = null,
    releaseSceneObjects = null,
  }) {
    this.config = config
    this.terrainGenerator = terrainGenerator
    this.layeredTerrainBuilder = layeredTerrainBuilder
    this.brickColorResolver = brickColorResolver
    this.brickGeometry = brickGeometry
    this.materials = materials
    this.parentGroup = parentGroup
    this.biomeRegistry = biomeRegistry
    this.prefabRegistry = prefabRegistry
    this.createSlotOverride = createSlot
    this.buildWorkers = buildWorkers
    this.prepareAhead = prepareAhead
    this.isTerrainReady = isTerrainReady

    const chunkConfig = config.chunks ?? {}
    this.chunkSize = chunkConfig.size ?? 64
    this.halo = chunkConfig.halo ?? 1
    this.windowRadius = chunkConfig.windowRadius ?? 1
    this.maxPendingBuildsPerFrame = chunkConfig.maxPendingBuildsPerFrame ?? 1
    this.maxPrefabBuildsPerFrame = chunkConfig.maxPrefabBuildsPerFrame ?? 1
    this.mainThreadBudgetMs = Number.isFinite(chunkConfig.mainThreadBudgetMs) && chunkConfig.mainThreadBudgetMs > 0
      ? chunkConfig.mainThreadBudgetMs
      : 4
    this.visibilityPadding = chunkConfig.visibilityPadding ?? 0
    this.debugSpacing = chunkConfig.debugSpacing ?? 0
    this.cellSize = config.terrain.cellSize
    this.buildTimings = { generationMs: 0, placementMs: 0, populateMs: 0, totalMs: 0, maxMs: 0, builds: 0 }
    this.transitionSettings = { ...CHUNK_TRANSITION_DEFAULTS, ...chunkConfig.transition }
    chunkConfig.transition = this.transitionSettings

    this.windowCapacity = (this.windowRadius * 2 + 1) ** 2
    this.stagingCapacity = Math.min(3, this.windowRadius * 2 + 1)
    this.slots = Array.from({ length: this.windowCapacity }, (_, index) => this.createSlot(index))
    this.freeSlots = [...this.slots]
    this.activeSlots = new Map()
    this.stagedSlots = new Map()
    this.stagedCoords = new Map()
    this.stagingCenter = null
    this.pendingQueue = []
    this.pendingKeys = new Set()
    this.pendingPrefabBuildQueue = []
    this.pendingPrefabBuildKeys = new Set()
    this.inFlightBuilds = new Map()
    this.completedBuilds = []
    this.buildEpoch = 0
    this.centerCoord = null
    this.schedulingPosition = null
    this.movementDirection = { x: 0, z: 0 }
    this.transitionDirection = { x: 0, z: 0 }
    this.bootstrapped = false

    const placeholderSettings = chunkConfig.placeholder ?? chunkConfig.distantTerrain
    this.terrainPlaceholder = placeholderSettings?.enabled === true
      ? new VoxelTerrainPlaceholder({
          config, parentGroup, releaseSceneObjects,
          biomeRegistry: biomeRegistry ?? terrainGenerator.biomeRegistry,
          biomeMaskGenerator: terrainGenerator.biomeMaskGenerator,
          colorResolver: brickColorResolver,
        })
      : null
    this.voxelClouds = this.terrainPlaceholder && chunkConfig.clouds?.enabled === true
      ? new VoxelClouds({ config, parentGroup, placeholder: this.terrainPlaceholder })
      : null

    for (const slot of this.slots) {
      slot.hide()
      this.parentGroup.add(slot.group)
    }
  }

  resetLoadedState() {
    this.terrainPlaceholder?.reset()
    this.voxelClouds?.reset()
    for (const slot of this.slots) {
      slot.hide()
      slot.endPreparation?.()
      slot.setPrefabsVisible?.(false)
      slot.resetTransition?.()
    }

    this.activeSlots.clear()
    this.stagedSlots.clear()
    this.stagedCoords.clear()
    this.stagingCenter = null
    this.pendingQueue.length = 0
    this.pendingKeys.clear()
    this.pendingPrefabBuildQueue.length = 0
    this.pendingPrefabBuildKeys.clear()
    this.inFlightBuilds.clear()
    this.completedBuilds.length = 0
    this.buildEpoch++
    this.freeSlots = [...this.slots]
    this.centerCoord = null
    this.schedulingPosition = null
    this.movementDirection = { x: 0, z: 0 }
    this.transitionDirection = { x: 0, z: 0 }
    this.bootstrapped = false
  }

  createSlot(index) {
    if (this.createSlotOverride) {
      return this.createSlotOverride(index)
    }

    const prefabPlacer = this.prefabRegistry && this.biomeRegistry
      ? new PrefabPlacer({
          config: this.config,
          biomeRegistry: this.biomeRegistry,
          prefabRegistry: this.prefabRegistry,
          materials: this.materials,
        })
      : null

    const waterEnabled = this.config.water?.enableWater !== false
    return new ChunkRenderSlot({
      index,
      chunkSize: this.chunkSize,
      cellSize: this.cellSize,
      terrainRenderer: new TerrainBrickRenderer({
        config: this.config,
        brickGeometry: this.brickGeometry,
        materials: this.materials,
      }),
      heightfieldAO: new HeightfieldAO({ config: this.config }),
      prefabPlacer,
      waterRenderer: waterEnabled
        ? new WaterBrickRenderer({
            config: this.config,
            brickGeometry: this.brickGeometry,
            materials: this.materials,
          })
        : null,
      lavaRenderer: new LavaBrickRenderer({
        config: this.config,
        brickGeometry: this.brickGeometry,
        materials: this.materials,
      }),
    })
  }

  bootstrap(worldX, worldZ, camera = null) {
    this.resetLoadedState()

    const worldBlock = this.getStableWorldBlockFromPosition(worldX, worldZ)
    const centerCoord = getRenderChunkCoord(worldBlock.x, worldBlock.z, this.chunkSize)

    this.updateSchedulingPosition(worldX, worldZ)
    this.centerCoord = centerCoord
    this.bootstrapped = true
    this.loadCoordNow(centerCoord)
    this.queuePendingCoords(getChunkWindowCoords(centerCoord, this.windowRadius))
    this.dispatchPendingBuilds()
    this.updateVisibility(worldBlock)
  }

  getStableWorldBlockFromPosition(worldX, worldZ) {
    const worldBlock = getWorldBlockFromPosition(worldX, worldZ, this.cellSize)

    return {
      x: this.snapNearIntegerBlock(worldX, worldBlock.x),
      z: this.snapNearIntegerBlock(worldZ, worldBlock.z),
    }
  }

  snapNearIntegerBlock(worldPosition, fallbackBlock) {
    const scaled = worldPosition / this.cellSize
    const rounded = Math.round(scaled)

    return Math.abs(scaled - rounded) < 1e-9 ? rounded : fallbackBlock
  }

  update(worldX, worldZ, camera = null, deltaSeconds = 1 / 60) {
    if (!this.bootstrapped) {
      this.bootstrap(worldX, worldZ, camera)
      return
    }

    const deadline = performance.now() + this.mainThreadBudgetMs
    this.updateTransitions(deltaSeconds)
    const worldBlock = this.getStableWorldBlockFromPosition(worldX, worldZ)
    const nextCenterCoord = getRenderChunkCoord(worldBlock.x, worldBlock.z, this.chunkSize)
    const previous = this.schedulingPosition
    this.updateSchedulingPosition(worldX, worldZ)

    let immediateBuilds = 0
    if (!this.coordsEqual(this.centerCoord, nextCenterCoord)) {
      immediateBuilds = this.reconcileRequiredWindow(nextCenterCoord)
    }
    if (previous && deltaSeconds > 0) {
      this.primeAhead((worldX - previous.x) / deltaSeconds, (worldZ - previous.z) / deltaSeconds)
    }

    const remainingBuilds = immediateBuilds > 0 && performance.now() >= deadline
      ? 0
      : Math.max(0, this.maxPendingBuildsPerFrame - immediateBuilds)
    this.buildPendingChunks(remainingBuilds, deadline)
    this.updateVisibility(worldBlock, { deadline })
  }

  updateSchedulingPosition(worldX, worldZ) {
    const previous = this.schedulingPosition
    const dx = previous ? worldX - previous.x : 0
    const dz = previous ? worldZ - previous.z : 0
    const distance = Math.hypot(dx, dz)
    this.movementDirection.x = distance > 0 ? dx / distance : 0
    this.movementDirection.z = distance > 0 ? dz / distance : 0
    if (distance > 1e-9) {
      this.transitionDirection = { ...this.movementDirection }
    }
    this.schedulingPosition = { x: worldX, z: worldZ }
  }

  primeAhead(velocityX, velocityZ) {
    if (!this.prepareAhead || !this.buildWorkers || !this.centerCoord || this.debugSpacing !== 0) return
    if (Math.hypot(velocityX, velocityZ) < 0.01) return

    const { x, z } = this.centerCoord
    const position = this.schedulingPosition
    const span = this.chunkSize * this.cellSize
    const timeToEdge = (index, offset, velocity) => Math.abs(velocity) < 0.01
      ? Infinity
      : Math.max(0, (((index + Number(velocity > 0)) * span) - offset) / velocity)
    const xTime = timeToEdge(x, position.x, velocityX)
    const zTime = timeToEdge(z, position.z, velocityZ)
    // Allow the foreground to spend a few seconds gradually preparing the next
    // edge, even when the player is approaching it at cruise speed.
    const leadSeconds = 2.7
    const target = Math.min(xTime, zTime) > leadSeconds ? null
      : xTime <= zTime ? { x: x + Math.sign(velocityX), z }
        : { x, z: z + Math.sign(velocityZ) }
    this.setStagingCenter(target)
  }

  setStagingCenter(coord) {
    if (this.stagingCenter === coord || this.coordsEqual(this.stagingCenter, coord)) return
    this.stagingCenter = coord
    const candidates = coord ? getChunkWindowCoords(coord, this.windowRadius)
      .filter(candidate => !this.isInWindow(candidate))
      .sort((a, b) => this.compareBuildCoords(a, b))
      .slice(0, this.stagingCapacity) : []
    this.stagedCoords = new Map(candidates.map(candidate => [getRenderChunkKey(candidate), candidate]))
    for (const [key, slot] of this.stagedSlots) {
      if (this.stagedCoords.has(key)) continue
      this.removePendingPrefabBuild(key)
      this.stagedSlots.delete(key)
      this.releaseSlot(slot)
    }
    this.trimPendingChunks()
    this.queuePendingCoords(candidates)
  }

  isInitialWindowReady() {
    if (!this.bootstrapped || this.activeSlots.size !== this.windowCapacity
      || this.stagedSlots.size !== this.stagedCoords.size) return false
    if (!this.placementEnabled()) return true
    for (const slots of [this.activeSlots, this.stagedSlots]) {
      for (const [key, slot] of slots) {
        if (slot.prefabPlacer && slot.prefabsBuiltForKey !== key) return false
      }
    }
    return true
  }

  getTransitionDirection(coord) {
    if (Math.hypot(this.transitionDirection.x, this.transitionDirection.z) > 0) {
      return this.transitionDirection
    }
    const position = this.schedulingPosition ?? { x: 0, z: 0 }
    const bounds = getChunkBounds(coord, this.chunkSize, this.cellSize)
    return {
      x: (bounds.minX + bounds.maxX) * 0.5 - position.x,
      z: (bounds.minZ + bounds.maxZ) * 0.5 - position.z,
    }
  }

  updateTransitions(deltaSeconds) {
    for (const slot of this.activeSlots.values()) {
      if (this.transitionSettings.enabled === false) {
        slot.resetTransition?.()
      }
      else {
        const mesh = slot.terrainRenderer?.mesh
        // Keep coarse cover until the first detailed draw can actually happen.
        if (slot.columnTransition?.active && slot.columnTransition.elapsed === 0
          && mesh?.count > 0 && this.isTerrainReady?.(mesh) === false) continue
        slot.updateTransition?.(deltaSeconds)
      }
    }
  }

  releaseSlot(slot) {
    slot.hide()
    slot.endPreparation?.()
    slot.setPrefabsVisible?.(false)
    slot.discardTransition?.()
    this.freeSlots.push(slot)
  }

  getBuildPriority(coord) {
    const position = this.schedulingPosition ?? { x: 0, z: 0 }
    const bounds = getChunkBounds(coord, this.chunkSize, this.cellSize)
    const spacingX = coord.x * this.debugSpacing
    const spacingZ = coord.z * this.debugSpacing
    const dx = Math.max(bounds.minX + spacingX - position.x, 0, position.x - bounds.maxX - spacingX)
    const dz = Math.max(bounds.minZ + spacingZ - position.z, 0, position.z - bounds.maxZ - spacingZ)
    const centerX = (bounds.minX + bounds.maxX) * 0.5 + spacingX - position.x
    const centerZ = (bounds.minZ + bounds.maxZ) * 0.5 + spacingZ - position.z

    return {
      distanceSquared: dx * dx + dz * dz,
      ahead: centerX * this.movementDirection.x + centerZ * this.movementDirection.z,
    }
  }

  compareBuildCoords(a, b) {
    const aIsCenter = this.coordsEqual(a, this.centerCoord)
    const bIsCenter = this.coordsEqual(b, this.centerCoord)
    if (aIsCenter !== bIsCenter) {
      return aIsCenter ? -1 : 1
    }
    const aIsActive = this.isInWindow(a)
    const bIsActive = this.isInWindow(b)
    if (aIsActive !== bIsActive) return aIsActive ? -1 : 1
    const aPriority = this.getBuildPriority(a)
    const bPriority = this.getBuildPriority(b)
    const distanceDifference = aPriority.distanceSquared - bPriority.distanceSquared
    if (Math.abs(distanceDifference) > 1e-9) {
      return distanceDifference
    }
    const directionDifference = bPriority.ahead - aPriority.ahead
    if (Math.abs(directionDifference) > 1e-9) {
      return directionDifference
    }
    return a.x - b.x || a.z - b.z
  }

  coordsEqual(a, b) {
    return a !== null && b !== null && a.x === b.x && a.z === b.z
  }

  reconcileRequiredWindow(nextCenterCoord) {
    this.centerCoord = { ...nextCenterCoord }

    const requiredCoords = getChunkWindowCoords(nextCenterCoord, this.windowRadius)
    const requiredKeys = new Set(requiredCoords.map(coord => getRenderChunkKey(coord)))

    for (const [key, slot] of this.activeSlots) {
      if (requiredKeys.has(key)) {
        continue
      }

      this.removePendingPrefabBuild(key)
      this.activeSlots.delete(key)
      this.releaseSlot(slot)
    }

    for (const coord of requiredCoords) {
      const key = getRenderChunkKey(coord)
      const slot = this.stagedSlots.get(key)
      if (!slot) continue
      this.stagedSlots.delete(key)
      slot.activatePrepared?.(this.getTransitionDirection(coord), this.transitionSettings)
      this.activeSlots.set(key, slot)
    }

    // The next prediction is relative to the new center. The old strip
    // can contain leftovers after a turn or a diagonal boundary crossing.
    this.setStagingCenter(null)
    this.trimPendingChunks()

    const centerKey = getRenderChunkKey(nextCenterCoord)
    let immediateBuilds = 0
    if (!this.activeSlots.has(centerKey) && !this.inFlightBuilds.has(centerKey)) {
      immediateBuilds = this.loadCoordNow(nextCenterCoord) ? 1 : 0
    }

    this.queuePendingCoords(requiredCoords)
    return immediateBuilds
  }

  queuePendingCoords(coords) {
    for (const coord of coords) {
      const key = getRenderChunkKey(coord)
      if (this.activeSlots.has(key) || this.stagedSlots.has(key) || this.pendingKeys.has(key) || this.inFlightBuilds.has(key)) {
        continue
      }

      this.pendingQueue.push({ ...coord })
      this.pendingKeys.add(key)
    }
  }

  trimPendingChunks() {
    this.pendingQueue = this.pendingQueue.filter((coord) => {
      const key = getRenderChunkKey(coord)
      return this.wantsChunk(coord, key) && !this.activeSlots.has(key) && !this.stagedSlots.has(key)
    })
    this.pendingKeys = new Set(this.pendingQueue.map(coord => getRenderChunkKey(coord)))
  }

  wantsChunk(coord, key) {
    return this.isInWindow(coord) || this.stagedCoords.has(key)
  }

  removePendingCoord(coord) {
    const key = getRenderChunkKey(coord)
    if (!this.pendingKeys.has(key)) {
      return
    }

    this.pendingQueue = this.pendingQueue.filter(pendingCoord => getRenderChunkKey(pendingCoord) !== key)
    this.pendingKeys.delete(key)
  }

  removePendingPrefabBuild(key) {
    if (!this.pendingPrefabBuildKeys.has(key)) {
      return
    }

    this.pendingPrefabBuildQueue = this.pendingPrefabBuildQueue.filter(pendingKey => pendingKey !== key)
    this.pendingPrefabBuildKeys.delete(key)
  }

  buildPendingChunks(limit = this.maxPendingBuildsPerFrame, deadline = Infinity) {
    if (this.buildWorkers) {
      const applied = this.applyCompletedBuilds(limit, deadline)
      this.dispatchPendingBuilds()
      return applied
    }

    this.pendingQueue.sort((a, b) => this.compareBuildCoords(a, b))
    let built = 0

    while (built < limit && this.pendingQueue.length > 0) {
      // A single population is atomic. Always allow progress, but do not stack
      // more populations (or prefabs below) onto a frame that used its budget.
      if (built > 0 && performance.now() >= deadline)
        break
      this.loadCoordNow(this.pendingQueue[0])
      built++
    }

    return built
  }

  dispatchPendingBuilds() {
    if (!this.buildWorkers?.hasIdleWorker() || this.pendingQueue.length === 0) {
      return
    }

    this.pendingQueue.sort((a, b) => this.compareBuildCoords(a, b))
    const epoch = this.buildEpoch
    const config = {
      seed: this.config.seed,
      terrain: this.config.terrain,
      biomes: this.config.biomes,
    }

    while (this.buildWorkers.hasIdleWorker() && this.pendingQueue.length > 0) {
      const coord = this.pendingQueue.shift()
      const key = getRenderChunkKey(coord)
      this.pendingKeys.delete(key)
      this.inFlightBuilds.set(key, coord)
      this.buildWorkers.run({
        epoch,
        config,
        origin: getRenderChunkOrigin(coord, this.chunkSize),
        size: this.chunkSize,
        halo: this.halo,
      }, (packed, error) => {
        if (epoch !== this.buildEpoch || !this.inFlightBuilds.has(key)) {
          return
        }
        if (error) {
          this.disableBuildWorkers(error)
          return
        }
        this.completedBuilds.push({ coord, packed })
      })
    }
  }

  applyCompletedBuilds(limit, deadline = Infinity) {
    this.completedBuilds.sort((a, b) => this.compareBuildCoords(a.coord, b.coord))
    let applied = 0

    while (applied < limit && this.completedBuilds.length > 0) {
      if ((applied > 0 || !this.isInWindow(this.completedBuilds[0].coord)) && performance.now() >= deadline)
        break
      const { coord, packed } = this.completedBuilds.shift()
      const key = getRenderChunkKey(coord)
      this.inFlightBuilds.delete(key)
      if (!this.wantsChunk(coord, key) || this.activeSlots.has(key) || this.stagedSlots.has(key)) {
        continue
      }
      this.loadCoordNow(coord, packed)
      applied++
    }

    return applied
  }

  disableBuildWorkers(error) {
    console.error('[ChunkManager] Chunk build worker failed; building chunks on the main thread.', error)
    this.buildWorkers?.terminate()
    this.buildWorkers = null
    this.completedBuilds.length = 0
    this.setStagingCenter(null)
    const coords = [...this.inFlightBuilds.values()].filter(coord => this.isInWindow(coord))
    this.inFlightBuilds.clear()
    this.queuePendingCoords(coords)
  }

  isInWindow(coord) {
    return this.centerCoord !== null
      && Math.abs(coord.x - this.centerCoord.x) <= this.windowRadius
      && Math.abs(coord.z - this.centerCoord.z) <= this.windowRadius
  }

  buildPendingPrefabs(desiredPrefabKeys, deadline = Infinity) {
    const getSlot = key => this.activeSlots.get(key) ?? this.stagedSlots.get(key)
    this.pendingPrefabBuildQueue = this.pendingPrefabBuildQueue.filter((key) => {
      const keep = desiredPrefabKeys.has(key) && getSlot(key)
      if (!keep) {
        this.pendingPrefabBuildKeys.delete(key)
      }
      return keep
    })
    this.pendingPrefabBuildQueue.sort((a, b) => this.compareBuildCoords(
      getSlot(a).coord,
      getSlot(b).coord,
    ))

    let built = 0
    while (built < this.maxPrefabBuildsPerFrame && this.pendingPrefabBuildQueue.length > 0) {
      if (performance.now() >= deadline)
        break
      const key = this.pendingPrefabBuildQueue.shift()
      this.pendingPrefabBuildKeys.delete(key)

      if (!desiredPrefabKeys.has(key)) {
        continue
      }

      const slot = getSlot(key)
      if (!slot) {
        continue
      }

      slot.ensurePrefabsBuilt?.()
      slot.setPrefabsVisible?.(true)
      slot.collectPreparationMeshes?.()
      built++
    }
  }

  loadCoordNow(coord, packedBuild = null) {
    const key = getRenderChunkKey(coord)
    const existing = this.activeSlots.get(key) ?? this.stagedSlots.get(key)
    if (existing) {
      this.removePendingCoord(coord)
      return existing
    }

    const staged = !this.isInWindow(coord) && this.stagedCoords.has(key)
    let slot = this.freeSlots.shift()
    const usesStagingCapacity = staged || (this.isInWindow(coord) && this.stagedSlots.size > 0)
    if (!slot && usesStagingCapacity && this.slots.length < this.windowCapacity + this.stagingCapacity) {
      slot = this.createSlot(this.slots.length)
      this.slots.push(slot)
      slot.hide()
      this.parentGroup.add(slot.group)
    }
    if (!slot) {
      throw new Error(`[ChunkManager] No free slot available for chunk ${key}`)
    }

    this.fillSlot(slot, coord, packedBuild)
    const direction = this.getTransitionDirection(coord)
    if (staged) {
      slot.beginPreparation?.(direction, this.transitionSettings)
      this.stagedSlots.set(key, slot)
    }
    else {
      if (this.transitionSettings.enabled !== false) slot.startLoading?.(direction, this.transitionSettings)
      this.activeSlots.set(key, slot)
    }
    this.removePendingCoord(coord)
    return slot
  }

  /**
   * With a worker-built `packedBuild`, only unpacking and instance upload run here;
   * `totalMs`/`maxMs` are main-thread time, generation/placement/workerAo timings come from the worker.
   */
  fillSlot(slot, coord, packedBuild = null) {
    const started = performance.now()
    let build
    let unpackMs = 0
    if (packedBuild) {
      build = unpackChunkBuild(packedBuild)
      unpackMs = performance.now() - started
    }
    else {
      build = this.buildChunkOnMainThread(coord)
    }
    const prepared = performance.now()

    slot.populate({
      coord,
      terrainMap: build.terrainMap,
      placements: build.placements,
      aoValues: build.aoValues,
      colorResolver: this.brickColorResolver,
      debugSpacing: this.debugSpacing,
    })
    const finished = performance.now()
    Object.assign(this.buildTimings, {
      generationMs: build.timings?.generationMs ?? 0,
      placementMs: build.timings?.placementMs ?? 0,
      unpackMs,
      populateMs: finished - prepared,
      ...slot.buildTimings,
      workerAoMs: build.timings?.aoMs ?? 0,
      inWorker: Boolean(packedBuild),
      totalMs: finished - started,
      maxMs: Math.max(this.buildTimings.maxMs, finished - started),
      builds: this.buildTimings.builds + 1,
    })
  }

  buildChunkOnMainThread(coord) {
    const started = performance.now()
    const terrainMap = this.terrainGenerator.generateChunk({
      origin: getRenderChunkOrigin(coord, this.chunkSize),
      size: this.chunkSize,
      halo: this.halo,
    })
    const generated = performance.now()
    const placements = this.layeredTerrainBuilder.buildPlacements(terrainMap)

    return {
      terrainMap,
      placements,
      aoValues: null,
      timings: {
        generationMs: generated - started,
        placementMs: performance.now() - generated,
      },
    }
  }

  setDebugSpacing(spacing) {
    this.debugSpacing = spacing
    this.config.chunks.debugSpacing = spacing
    if (spacing !== 0) this.setStagingCenter(null)

    for (const slot of this.slots) {
      slot.updateWorldPosition(spacing)
    }
  }

  setPrefabsEnabled(enabled) {
    this.config.placement.enablePrefabs = enabled
    this.syncPlacementVisibility()
  }

  syncPlacementVisibility() {
    const placementEnabled = this.placementEnabled()
    for (const slot of this.slots) {
      slot.prefabPlacer?.syncVariantGroupVisibility()
      if (!placementEnabled) {
        slot.setPrefabsVisible?.(false)
      }
    }
    if (!placementEnabled) {
      this.pendingPrefabBuildQueue.length = 0
      this.pendingPrefabBuildKeys.clear()
    }
  }

  placementEnabled() {
    return this.config.placement?.enablePrefabs !== false || this.config.placement?.enableTrees !== false
  }

  updateVisibility(worldBlock, { buildPrefabs = true, deadline = Infinity } = {}) {
    const placementEnabled = this.placementEnabled()
    const prefabActiveKeys = new Set([...this.activeSlots.keys(), ...this.stagedSlots.keys()])

    for (const slots of [this.activeSlots, this.stagedSlots]) {
      for (const [key, slot] of slots) {
        slot.show()
        if (!placementEnabled) {
          slot.setPrefabsVisible?.(false)
          continue
        }

        if (slot.prefabsBuiltForKey === key) {
          slot.setPrefabsVisible?.(true)
        }
        else if (!this.pendingPrefabBuildKeys.has(key)) {
          slot.setPrefabsVisible?.(false)
          this.pendingPrefabBuildQueue.push(key)
          this.pendingPrefabBuildKeys.add(key)
        }
      }
    }

    if (placementEnabled && buildPrefabs) {
      this.buildPendingPrefabs(prefabActiveKeys, deadline)
    }
    // Worker builds retain their coarse cover; both renderers share the same
    // column clock so placeholder boxes dissolve as detailed terrain rises.
    this.terrainPlaceholder?.update(this.centerCoord, this.activeSlots, deadline)
    this.voxelClouds?.update(this.centerCoord, this.activeSlots)
  }

  refreshAOPreview(showOverlays = true) {
    this.terrainPlaceholder?.refresh(showOverlays)
    this.voxelClouds?.refresh(showOverlays)
    for (const slot of this.slots) {
      slot.updateInstanceColors()
      slot.setOverlaysVisible(showOverlays && slot.group.visible)
    }
  }

  getDebugMaterials() {
    return {
      legoMaterial: this.materials?.legoMaterial ?? null,
      waterMaterial: this.materials?.waterMaterial ?? null,
    }
  }

  dispose() {
    this.terrainPlaceholder?.dispose()
    this.voxelClouds?.dispose()
    this.buildWorkers?.terminate()
    this.buildWorkers = null
    this.inFlightBuilds.clear()
    this.completedBuilds.length = 0
    for (const slot of this.slots) {
      slot.dispose()
      slot.group.parent?.remove(slot.group)
    }

    this.slots.length = 0
    this.freeSlots.length = 0
    this.activeSlots.clear()
    this.stagedSlots.clear()
    this.stagedCoords.clear()
    this.pendingQueue.length = 0
    this.pendingKeys.clear()
    this.pendingPrefabBuildQueue.length = 0
    this.pendingPrefabBuildKeys.clear()
  }
}
