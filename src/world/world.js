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
import LandmarkRenderer, { createLandmarkAssets } from './landmarks/LandmarkRenderer.js'
import { warmupLandmarkPipelines } from './landmarks/LandmarkPipelineWarmup.js'
import { getLandmarkSettings } from './landmarks/landmarkConfig.js'
import PlayerAircraft from './player/PlayerAircraft.js'
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
  constructor(experience) {
    this.experience = experience
    this.scene = experience.scene
    this.group = new THREE.Group()
    this.group.name = 'World'
    this.scene.add(this.group)

    this.children = []
    this.config = worldConfig
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
    this.terrainChunkManager = null
    this.prefabWarmup = null
    this.landmarkAssets = null
    this.landmarkRenderer = null
    this.disposed = false
  }

  addSystem(system) {
    this.children.push(system)
    if (system.group) {
      this.group.add(system.group)
    }
  }

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
    this.brickGeometry.computeBoundingBox()
    this.config.landmarks.terrainTopOffset = this.brickGeometry.boundingBox.max.y

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
      this.landmarkAssets = getLandmarkSettings(this.config).enabled ? createLandmarkAssets(resources) : null

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
          landmarkAssets: this.landmarkAssets,
          buildWorkers: ChunkBuildWorkerPool.create(this.config.chunks),
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
        if (this.landmarkAssets) {
          this.landmarkRenderer = new LandmarkRenderer({ config: this.config, assets: this.landmarkAssets })
          this.group.add(this.landmarkRenderer.group)
        }
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

      this.playerAircraft = new PlayerAircraft(this.experience, { config: this.config })
      this.addSystem(this.playerAircraft)
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

    this.experience.worldCamera.lookAt(new THREE.Vector3(centerX, 0, centerZ))
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
    this.landmarkRenderer?.build(this.terrainMap)

    this.refreshAOPreview()
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
    this.landmarkRenderer?.setVisible(!preview)
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

  update() {
    for (const child of this.children) {
      child.update?.()
    }
    this.landmarkRenderer?.update(this.experience.time.getDelta(), true)

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
      maxY: (Math.max(maxHeight, waterLevel) + 1) * layerHeight
        + Math.max(bounds.maxY, getLandmarkSettings(this.config).enabled ? getLandmarkSettings(this.config).targetHeight : 0),
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
    if (!this.disposed && this.landmarkAssets) {
      await warmupLandmarkPipelines({
        renderer,
        scene: this.scene,
        camera,
        slots: this.terrainChunkManager?.slots ?? [{ landmarkRenderer: this.landmarkRenderer, group: this.group }],
        renderFrame: async () => {
          await renderFrame?.()
          await this.experience.renderer.prepareVisiblePrefabs?.()
        },
      })
    }
    return warmup
  }

  dispose() {
    if (this.disposed)
      return
    this.disposed = true
    this.experience.renderer?.releaseSceneObjects?.(this.group)
    this.prefabWarmup?.dispose()
    this.prefabWarmup = null
    for (const child of this.children) {
      child.dispose?.()
    }
    this.terrainChunkManager?.dispose()
    this.terrainChunkManager = null
    this.landmarkRenderer?.dispose()
    this.landmarkRenderer = null
    this.landmarkAssets?.dispose()
    this.landmarkAssets = null
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
