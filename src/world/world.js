import * as THREE from 'three/webgpu'
import { worldConfig } from './WorldConfig.js'
import WorldMaterials from './WorldMaterials.js'
import BiomeRegistry from './biomes/BiomeRegistry.js'
import BiomeBlender from './biomes/BiomeBlender.js'
import BiomeMaskGenerator from './biomes/BiomeMaskGenerator.js'
import TerrainGenerator from './terrain/TerrainGenerator.js'
import LayeredTerrainBuilder from './terrain/LayeredTerrainBuilder.js'
import { extractBrickGeometry } from './bricks/BrickGeometry.js'
import BrickColorResolver from './bricks/BrickColorResolver.js'
import { isTerrainPreview } from './bricks/terrainColorScheme.js'
import HeightfieldAO from './bricks/HeightfieldAO.js'
import TerrainBrickRenderer from './bricks/TerrainBrickRenderer.js'
import WaterBrickRenderer from './bricks/WaterBrickRenderer.js'
import LavaBrickRenderer from './bricks/LavaBrickRenderer.js'
import PrefabRegistry from './prefabs/PrefabRegistry.js'
import PrefabPlacer from './prefabs/PrefabPlacer.js'
import { warmupPrefabPipelines } from './prefabs/PrefabPipelineWarmup.js'
import PlayerAircraft from './player/PlayerAircraft.js'
import ChunkManager from './chunks/ChunkManager.js'
import { createTerrainPanel } from '../debug/panels/TerrainPanel.js'
import { createTerrainColorPanel } from '../debug/panels/TerrainColorPanel.js'
import { createAOPanel } from '../debug/panels/AOPanel.js'
import { createBiomePanel } from '../debug/panels/BiomePanel.js'
import { createPlacementPanel } from '../debug/panels/PlacementPanel.js'
import { createMaterialPanel } from '../debug/panels/MaterialPanel.js'
import { createChunksPanel } from '../debug/panels/ChunksPanel.js'

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
        this.playerAircraft = null
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

    build() {
        const resources = this.experience.resources

        if (!this.brickGeometry) {
            this.brickGeometry = extractBrickGeometry(resources.items.brick2x2Model, this.config.terrain.cellSize)
        }

        if (!this.brickGeometry) {
            console.warn('[World] Missing brick geometry; terrain render skipped.')
            return
        }

        if (!this.terrainGenerator) {
            this.biomeRegistry = new BiomeRegistry()
            this.biomeBlender = new BiomeBlender(this.biomeRegistry)
            this.biomeMaskGenerator = new BiomeMaskGenerator(this.config)
            this.terrainGenerator = new TerrainGenerator({
                config: this.config,
                biomeMaskGenerator: this.biomeMaskGenerator,
                biomeBlender: this.biomeBlender,
                biomeRegistry: this.biomeRegistry
            })
            this.layeredTerrainBuilder = new LayeredTerrainBuilder({ config: this.config })
            this.brickColorResolver = new BrickColorResolver({
                biomeRegistry: this.biomeRegistry,
                biomeBlender: this.biomeBlender,
                config: this.config
            })
            this.heightfieldAO = new HeightfieldAO({ config: this.config })

            const useChunkTerrain = this.config.chunks?.enabled === true

            this.materials = new WorldMaterials({
                config: this.config,
                waterNoiseTexture: resources.items.waterNoiseTexture,
                lavaConfig: this.biomeRegistry.get('volcano').lava
            })

            const prefabRegistry = new PrefabRegistry(resources)
            this.prefabRegistry = prefabRegistry

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
                    materials: this.materials
                })
            } else {
                this.terrainBrickRenderer = new TerrainBrickRenderer({
                    config: this.config,
                    brickGeometry: this.brickGeometry,
                    materials: this.materials
                })
                this.addSystem(this.terrainBrickRenderer)
            }

            if (!useChunkTerrain) {
                const waterEnabled = this.config.water?.enableWater !== false
                if (waterEnabled) {
                    this.waterBrickRenderer = new WaterBrickRenderer({
                        config: this.config,
                        brickGeometry: this.brickGeometry,
                        materials: this.materials
                    })
                    this.addSystem(this.waterBrickRenderer)
                }
                this.lavaBrickRenderer = new LavaBrickRenderer({
                    config: this.config,
                    brickGeometry: this.brickGeometry,
                    materials: this.materials
                })
                this.addSystem(this.lavaBrickRenderer)

                this.prefabPlacer = new PrefabPlacer({
                    config: this.config,
                    biomeRegistry: this.biomeRegistry,
                    prefabRegistry,
                    materials: this.materials
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
            maxHeight: maxHeight * layerHeight + 8
        })

        if (useChunkTerrain) {
            this.terrainMap = null
            this.terrainPlacements = []
            this.terrainChunkManager.bootstrap(
                centerX,
                centerZ,
                this.experience.worldCamera.instance
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
            this.heightfieldAO
        )
        this.waterBrickRenderer?.build(this.terrainMap)
        this.lavaBrickRenderer.build(this.terrainMap)
        this.prefabPlacer?.build(this.terrainMap)

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
    }

    getTerrainColorHistogram() {
        const histogram = Array(10).fill(0)
        const slots = this.terrainChunkManager?.activeSlots?.values()
        const renderers = slots
            ? Array.from(slots, (slot) => slot.terrainRenderer)
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
            } else if (this.prefabPlacer) {
                this.prefabPlacer.syncVariantGroupVisibility()
                this.prefabPlacer.group.visible = enabled
                    && !isTerrainPreview(this.config)
            }
        }

        createTerrainPanel(debug, this.config, onRegenerate)
        createTerrainColorPanel(debug, this.config, this.biomeRegistry,
            () => this.refreshTerrainColors(), () => this.getTerrainColorHistogram())
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

        if (this.terrainChunkManager && this.playerAircraft?.enabled) {
            const { x, z } = this.playerAircraft.state.position
            const chunkWorldSize = this.config.chunks.size * this.config.terrain.cellSize
            this.experience.environment.followPlayerShadow?.(
                this.playerAircraft.state.position,
                { halfExtent: chunkWorldSize }
            )
            this.terrainChunkManager.update(x, z, this.experience.worldCamera.instance)
        }
    }

    async warmupPrefabPipelines(renderer, camera, renderFrame) {
        this.prefabWarmup?.dispose()
        const warmup = await warmupPrefabPipelines({
            renderer,
            scene: this.scene,
            camera,
            prefabRegistry: this.prefabRegistry,
            materials: this.materials,
            renderFrame,
            retainPipelines: true
        })
        if (this.disposed) warmup.dispose?.()
        else this.prefabWarmup = warmup
        return warmup
    }

    dispose() {
        if (this.disposed) return
        this.disposed = true
        this.experience.renderer?.releaseSceneObjects?.(this.group)
        this.prefabWarmup?.dispose()
        this.prefabWarmup = null
        for (const child of this.children) {
            child.dispose?.()
        }
        this.terrainChunkManager?.dispose()
        this.terrainChunkManager = null
        this.materials?.dispose()
        this.materials = null
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
