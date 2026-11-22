import * as THREE from 'three/webgpu'
import { createAOPanel } from '../debug/panels/AOPanel.js'
import { createBiomePanel } from '../debug/panels/BiomePanel.js'
import { createChunksPanel } from '../debug/panels/ChunksPanel.js'
import { createMaterialPanel } from '../debug/panels/MaterialPanel.js'
import { createPlacementPanel } from '../debug/panels/PlacementPanel.js'
import { createTerrainColorPanel } from '../debug/panels/TerrainColorPanel.js'
import { createTerrainPanel } from '../debug/panels/TerrainPanel.js'
import BiomeBlender from './biomes/BiomeBlender.js'
import BiomeMaskGenerator from './biomes/BiomeMaskGenerator.js'
import BiomeRegistry from './biomes/BiomeRegistry.js'
import BrickColorResolver from './bricks/BrickColorResolver.js'
import { extractBrickGeometry } from './bricks/BrickGeometry.js'
import BrickLOD from './bricks/BrickLOD.js'
import HeightfieldAO from './bricks/HeightfieldAO.js'
import LavaBrickRenderer from './bricks/LavaBrickRenderer.js'
import TerrainBrickRenderer from './bricks/TerrainBrickRenderer.js'
import { isTerrainPreview } from './bricks/terrainColorScheme.js'
import WaterBrickRenderer from './bricks/WaterBrickRenderer.js'
import ChunkBuildWorkerPool from './chunks/ChunkBuildWorkerPool.js'
import ChunkManager from './chunks/ChunkManager.js'
import ForestTrial, { forestTrialSpawn, getForestTrialConfig } from './levels/ForestTrial.js'
import PlayerAircraft from './player/PlayerAircraft.js'
import { createAircraftTrainingRange } from './player/aircraftTrainingRange.js'
import { warmupPrefabPipelines } from './prefabs/PrefabPipelineWarmup.js'
import PrefabPlacer from './prefabs/PrefabPlacer.js'
import PrefabRegistry from './prefabs/PrefabRegistry.js'
import LayeredTerrainBuilder from './terrain/LayeredTerrainBuilder.js'
import TerrainGenerator from './terrain/TerrainGenerator.js'
import { worldConfig } from './WorldConfig.js'
import WorldMaterials from './WorldMaterials.js'

export default class World {
  /**
   * @param {import('../app/Experience.js').default} experience
   */
  constructor(experience, forestTrial = null) {
    this.experience = experience
    this.scene = experience.scene
    this.group = new THREE.Group()
    this.group.name = 'World'
    this.scene.add(this.group)

    this.children = []
    this.forestTrialOptions = forestTrial
    this.config = forestTrial ? getForestTrialConfig(worldConfig, forestTrial.mode) : worldConfig
    this.terrainMap = null
    this.terrainPlacements = []

    this.brickGeometry = null
    this.brickLOD = null
    this.materials = null
    this.biomeRegistry = null
    this.biomeBlender = null
    this.biomeMaskGenerator = null
    this.terrainGenerator = null
    this.layeredTerrainBuilder = null
    this.brickColorResolver = null
    this.heightfieldAO = null
    this.terrainBrickRenderer = null
    this.waterBrickRenderer = null
    this.lavaBrickRenderer = null
    this.prefabPlacer = null
    this.prefabRegistry = null
    this.prefabShadowBounds = null
    this.playerAircraft = null
    this.aircraftTrainingRange = null
    this.terrainChunkManager = null
    this.prefabWarmup = null
    this.disposed = false
  }

  addSystem(system) {
    this.children.push(system)
    if (system.group) {
      this.group.add(system.group)
    }
  }

  get aircraftWeapons() { return this.aircraftTrainingRange?.weapons }
  get aircraftWeaponTargets() { return this.aircraftTrainingRange?.targets }
  get aircraftWeaponFeedback() { return this.aircraftTrainingRange?.feedback }
  get aircraftCombatStatus() { return this.aircraftTrainingRange?.combatStatus }

  build() {
    const resources = this.experience.resources

    if (!this.brickGeometry) {
      this.brickGeometry = extractBrickGeometry(resources.items.brick2x2Model, this.config.terrain.cellSize)
    }

    if (!this.brickGeometry) {
      console.warn('[World] Missing brick geometry; terrain render skipped.')
      return
    }

    this.brickLOD ??= new BrickLOD(this.brickGeometry, this.config.terrain.brickLOD)

    if (!this.terrainGenerator) {
      this.biomeRegistry = new BiomeRegistry()
      this.biomeBlender = new BiomeBlender(this.biomeRegistry)
      this.biomeMaskGenerator = new BiomeMaskGenerator(this.config)
      this.terrainGenerator = new TerrainGenerator({
        config: this.config,
        biomeMaskGenerator: this.biomeMaskGenerator,
        biomeRegistry: this.biomeRegistry,
      })
      this.layeredTerrainBuilder = new LayeredTerrainBuilder({ config: this.config })
      this.brickColorResolver = new BrickColorResolver({
        biomeRegistry: this.biomeRegistry,
        biomeBlender: this.biomeBlender,
        config: this.config,
      })
      this.heightfieldAO = new HeightfieldAO({ config: this.config })

      const useChunkTerrain = this.config.chunks?.enabled === true

      this.materials = new WorldMaterials({
        config: this.config,
        waterNoiseTexture: resources.items.waterNoiseTexture,
        lavaConfig: this.biomeRegistry.get('volcano').lava,
        studLayout: this.brickLOD.studLayout,
      })

      const prefabRegistry = new PrefabRegistry(resources)
      this.prefabRegistry = prefabRegistry
      if (useChunkTerrain)
        this.measurePrefabShadowBounds()

      if (useChunkTerrain) {
        const preparation = this.experience.renderer?.prefabPreparation
        this.terrainChunkManager = new ChunkManager({
          config: this.config,
          terrainGenerator: this.terrainGenerator,
          layeredTerrainBuilder: this.layeredTerrainBuilder,
          brickColorResolver: this.brickColorResolver,
          brickGeometry: this.brickGeometry,
          parentGroup: this.group,
          biomeRegistry: this.biomeRegistry,
          prefabRegistry,
          materials: this.materials,
          buildWorkers: ChunkBuildWorkerPool.create(this.config.chunks),
          prepareAhead: preparation?.metrics.enabled === true,
          isTerrainReady: preparation?.isObjectReady,
        })
      }
      else {
        this.terrainBrickRenderer = new TerrainBrickRenderer({
          config: this.config,
          brickGeometry: this.brickGeometry,
          materials: this.materials,
        })
        this.addSystem(this.terrainBrickRenderer)
      }

      if (!useChunkTerrain) {
        const waterEnabled = this.config.water?.enableWater !== false
        if (waterEnabled) {
          this.waterBrickRenderer = new WaterBrickRenderer({
            config: this.config,
            brickGeometry: this.brickGeometry,
            materials: this.materials,
          })
          this.addSystem(this.waterBrickRenderer)
        }
        this.lavaBrickRenderer = new LavaBrickRenderer({
          config: this.config,
          brickGeometry: this.brickGeometry,
          materials: this.materials,
        })
        this.addSystem(this.lavaBrickRenderer)

        this.prefabPlacer = new PrefabPlacer({
          config: this.config,
          biomeRegistry: this.biomeRegistry,
          prefabRegistry,
          materials: this.materials,
        })
        this.addSystem(this.prefabPlacer)
      }

      this.playerAircraft = new PlayerAircraft(this.experience, {
        config: this.config,
        sampleSurface: (x, z) => this.sampleSurface(x, z),
        spawn: this.forestTrialOptions ? forestTrialSpawn : null,
        weaponsEnabled: !this.forestTrialOptions,
      })
      this.addSystem(this.playerAircraft)
      if (this.forestTrialOptions && this.playerAircraft.enabled) {
        this.forestTrial = new ForestTrial(this, this.forestTrialOptions)
      }
      if (!this.forestTrialOptions && this.playerAircraft.enabled) {
        this.aircraftTrainingRange = createAircraftTrainingRange({
          sampleSurface: (x, z) => this.sampleSurface(x, z),
          playAudio: cue => this.experience.audio?.play(cue),
          missileScene: resources.items.playerMissileModel?.scene,
          enemyMissileScene: resources.items.enemyMissileModel?.scene,
          enemyScene: resources.items.enemyFleetModel?.scene,
          mountParent: this.playerAircraft.visualRoot,
        })
        this.group.add(this.aircraftTrainingRange.group)
      }
    }

    this.regenerate()
  }

  regenerate() {
    if (!this.terrainGenerator) {
      return
    }

    const useChunkTerrain = Boolean(this.terrainChunkManager)
    if (!useChunkTerrain && !this.waterBrickRenderer && !this.lavaBrickRenderer) {
      return
    }

    const { width, depth, cellSize, maxHeight, layerHeight } = this.config.terrain
    const playerPosition = this.playerAircraft?.state?.position
    const centerX = playerPosition?.x ?? width * cellSize * 0.5
    const centerZ = playerPosition?.z ?? depth * cellSize * 0.5
    const halfExtent = Math.max(width, depth) * cellSize * 0.55

    if (this.playerAircraft?.enabled && this.playerAircraft.cameraFollow?.enabled) {
      this.playerAircraft.syncCamera(0)
    }
    else {
      this.experience.worldCamera.lookAt(new THREE.Vector3(centerX, 0, centerZ))
    }
    this.experience.environment.configureShadows({
      halfExtent,
      maxHeight: maxHeight * layerHeight + 8,
    })

    if (useChunkTerrain) {
      this.terrainMap = null
      this.terrainPlacements = []
      this.terrainChunkManager.bootstrap(
        centerX,
        centerZ,
        this.experience.worldCamera.instance,
      )
      this.playerAircraft?.snapToSurface?.()
      this.aircraftTrainingRange?.reset(this.playerAircraft.state)
      this.refreshAOPreview()
      return
    }

    this.terrainMap = this.terrainGenerator.generate()
    this.terrainPlacements = this.layeredTerrainBuilder.buildPlacements(this.terrainMap)
    this.heightfieldAO.build(this.terrainMap, this.terrainPlacements)

    this.terrainBrickRenderer.build(
      this.terrainPlacements,
      this.brickColorResolver,
      this.heightfieldAO,
    )
    this.waterBrickRenderer?.build(this.terrainMap)
    this.lavaBrickRenderer.build(this.terrainMap)
    this.prefabPlacer?.build(this.terrainMap)
    this.playerAircraft?.snapToSurface?.()
    this.aircraftTrainingRange?.reset(this.playerAircraft.state)

    this.refreshAOPreview()
  }

  /** World Y at the top of the rendered surface brick; null while its chunk is pending. */
  sampleSurface(worldX, worldZ) {
    const { cellSize, layerHeight, waterLevel } = this.config.terrain
    let map = this.terrainMap
    let x = worldX
    let z = worldZ
    if (this.terrainChunkManager) {
      const { size, debugSpacing = 0 } = this.config.chunks
      const pitch = size * cellSize + debugSpacing
      const cx = Math.floor(x / pitch)
      const cz = Math.floor(z / pitch)
      map = this.terrainChunkManager.activeSlots.get(`${cx}:${cz}`)?.terrainMap
      x -= cx * debugSpacing
      z -= cz * debugSpacing
    }
    if (!map) return null
    const halo = map.halo ?? 0
    const col = Math.floor(x / cellSize + 1e-9) - map.origin.x + halo
    const row = Math.floor(z / cellSize + 1e-9) - map.origin.z + halo
    if (col < halo || row < halo || col >= map.heightField.width - halo || row >= map.heightField.depth - halo) return null
    const cell = map.getSurfaceCell(col, row)
    if (!cell) return null
    const layer = cell.isLava ? cell.lavaHeight ?? cell.height
      : cell.isWater && this.config.water?.enableWater !== false ? waterLevel : cell.height
    return layer * layerHeight + (this.brickGeometry?.boundingBox?.max.y ?? layerHeight)
  }

  refreshAOPreview() {
    if (this.config.terrain.ao?.previewGrayscale && this.terrainMap && this.heightfieldAO) {
      this.heightfieldAO.build(this.terrainMap, this.terrainPlacements)
    }

    this.refreshTerrainColors()
  }

  refreshTerrainColors() {
    const preview = isTerrainPreview(this.config)
    this.brickColorResolver?.invalidatePalettes?.()
    this.terrainBrickRenderer?.updateInstanceColors()
    this.terrainChunkManager?.refreshAOPreview(!preview)

    const useChunkTerrain = this.config.chunks?.enabled === true
    if (this.waterBrickRenderer?.group) {
      this.waterBrickRenderer.group.visible = !preview && !useChunkTerrain
    }
    if (this.lavaBrickRenderer?.group) {
      this.lavaBrickRenderer.group.visible = !preview && !useChunkTerrain
    }
    if (this.prefabPlacer?.group) {
      this.prefabPlacer.group.visible = !preview && !useChunkTerrain
        && (this.config.placement?.enablePrefabs !== false
          || this.config.placement?.enableTrees !== false)
    }
    if (this.playerAircraft?.group) {
      this.playerAircraft.group.visible = !preview
    }
    if (this.aircraftTrainingRange) this.aircraftTrainingRange.group.visible = !preview
  }

  getTerrainColorHistogram() {
    const histogram = Array.from({ length: 10 }).fill(0)
    const slots = this.terrainChunkManager?.activeSlots?.values()
    const renderers = slots
      ? Array.from(slots, slot => slot.terrainRenderer)
      : [this.terrainBrickRenderer]
    for (const renderer of renderers) {
      renderer?.colorHistogram?.forEach((count, i) => { histogram[i] += count })
    }
    return histogram
  }

  /**
   * @param {import('../debug/Debug.js').default} debug
   */
  debuggerInit(debug) {
    if (!debug.active) {
      return
    }

    const onRegenerate = () => this.regenerate()
    const onAOPreviewChange = () => {
      if (this.config.terrain.ao?.previewGrayscale && this.config.terrain.color) {
        this.config.terrain.color.preview = 'final'
      }
      this.refreshAOPreview()
      debug.ui.refresh()
    }
    const onPlacementVisibilityChange = () => {
      const enabled = this.config.placement.enablePrefabs !== false
        || this.config.placement.enableTrees !== false
      if (this.terrainChunkManager) {
        this.terrainChunkManager.syncPlacementVisibility()
      }
      else if (this.prefabPlacer) {
        this.prefabPlacer.syncVariantGroupVisibility()
        this.prefabPlacer.group.visible = enabled
          && !isTerrainPreview(this.config)
      }
    }

    createTerrainPanel(debug, this.config, onRegenerate)
    createTerrainColorPanel(debug, this.config, this.biomeRegistry, () => this.refreshTerrainColors(), () => this.getTerrainColorHistogram())
    createAOPanel(debug, this.config, onRegenerate, onAOPreviewChange)
    createBiomePanel(debug, this.config, onRegenerate)
    createPlacementPanel(debug, this.config, onRegenerate, onPlacementVisibilityChange)
    createMaterialPanel(debug, this.config, this.materials, onRegenerate)

    if (this.terrainChunkManager) {
      createChunksPanel(debug, this.config, this.terrainChunkManager)
    }

    for (const child of this.children) {
      child.debuggerInit?.(debug)
    }
  }

  update(timestamp) {
    const flightPose = this.forestTrial?.getFlightPose(timestamp)
    for (const child of this.children) {
      if (child === this.playerAircraft) {
        if (!child.enabled || child.paused) continue
        const realDelta = this.experience.time.getDelta()
        const range = this.aircraftTrainingRange
        const flightDelta = range ? range.beginFrame(realDelta) : realDelta
        const input = child.update(flightPose, flightDelta)
        if (input && range) range.update(flightDelta, child, input, realDelta)
      }
      else child.update?.()
    }

    if (this.terrainChunkManager && this.playerAircraft?.enabled) {
      const { x, z } = this.playerAircraft.state.position
      const chunkWorldSize = this.config.chunks.size * this.config.terrain.cellSize
      this.experience.environment.followPlayerShadow?.(
        this.playerAircraft.state.position,
        { halfExtent: chunkWorldSize, envelope: this.getPrefabShadowEnvelope() },
      )
      this.terrainChunkManager.update(
        x,
        z,
        this.experience.worldCamera.instance,
        this.experience.time.getDelta(),
      )
    }
    else if (this.terrainChunkManager) {
      this.terrainChunkManager.updateTransitions(this.experience.time.getDelta())
    }
    this.brickLOD?.update(
      this.group,
      this.experience.worldCamera.instance,
      this.experience.renderer?.instance,
    )
    this.forestTrial?.update()
  }

  measurePrefabShadowBounds() {
    const bounds = { horizontal: 0, minY: 0, maxY: 0 }
    const box = new THREE.Box3()
    for (const [id, entry] of Object.entries(this.prefabRegistry?.manifest ?? {})) {
      for (let index = 0; index < (entry.variants?.length ?? 0); index++) {
        const scene = this.prefabRegistry.getVariantAsset(id, index)?.scene
        if (!scene)
          continue
        box.setFromObject(scene)
        if (box.isEmpty())
          continue
        bounds.horizontal = Math.max(bounds.horizontal, Math.hypot(
          Math.max(Math.abs(box.min.x), Math.abs(box.max.x)),
          Math.max(Math.abs(box.min.z), Math.abs(box.max.z)),
        ))
        bounds.minY = Math.min(bounds.minY, box.min.y)
        bounds.maxY = Math.max(bounds.maxY, box.max.y)
      }
    }
    this.prefabShadowBounds = bounds
  }

  getPrefabShadowEnvelope() {
    if ((this.config.chunks?.debugSpacing ?? 0) !== 0)
      return undefined
    const bounds = this.prefabShadowBounds ?? { horizontal: 0, minY: 0, maxY: 0 }
    const chunkWorldSize = this.config.chunks.size * this.config.terrain.cellSize
    const windowRadius = this.config.chunks.windowRadius ?? 1
    const { maxHeight, waterLevel, layerHeight } = this.config.terrain
    return {
      radius: (windowRadius + 1) * chunkWorldSize + bounds.horizontal,
      minY: Math.min(0, layerHeight + bounds.minY),
      maxY: (Math.max(maxHeight, waterLevel) + 1) * layerHeight + bounds.maxY,
    }
  }

  async warmupPrefabPipelines(renderer, camera, renderFrame) {
    this.prefabWarmup?.dispose()
    const warmup = await warmupPrefabPipelines({
      renderer,
      scene: this.scene,
      camera,
      config: this.config,
      prefabRegistry: this.prefabRegistry,
      materials: this.materials,
      renderFrame,
      retainPipelines: true,
    })
    if (this.disposed)
      warmup.dispose?.()
    else this.prefabWarmup = warmup
    return warmup
  }

  dispose() {
    if (this.disposed)
      return
    this.disposed = true
    this.experience.renderer?.releaseSceneObjects?.(this.group)
    this.forestTrial?.dispose()
    this.aircraftTrainingRange?.dispose()
    this.aircraftTrainingRange = null
    this.prefabWarmup?.dispose()
    this.prefabWarmup = null
    for (const child of this.children) {
      child.dispose?.()
    }
    this.terrainChunkManager?.dispose()
    this.terrainChunkManager = null
    this.prefabRegistry?.dispose?.()
    this.materials?.dispose()
    this.materials = null
    this.brickLOD?.dispose()
    this.brickLOD = null
    this.brickGeometry?.dispose()
    this.brickGeometry = null
    this.terrainMap = null
    this.terrainPlacements = []
    this.terrainGenerator = null
    this.heightfieldAO = null
    this.brickColorResolver = null
    this.layeredTerrainBuilder = null
    this.biomeMaskGenerator = null
    this.biomeBlender = null
    this.biomeRegistry = null
    this.terrainBrickRenderer = null
    this.waterBrickRenderer = null
    this.lavaBrickRenderer = null
    this.prefabPlacer = null
    this.playerAircraft = null
    this.prefabRegistry = null
    this.children.length = 0
    this.group.clear()
    this.scene.remove(this.group)
  }
}
