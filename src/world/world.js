import * as THREE from 'three/webgpu'
import { worldConfig } from './WorldConfig.js'
import BiomeRegistry from './biomes/BiomeRegistry.js'
import BiomeBlender from './biomes/BiomeBlender.js'
import BiomeMaskGenerator from './biomes/BiomeMaskGenerator.js'
import BiomeCenterSystem from './biomes/BiomeCenterSystem.js'
import TerrainGenerator from './terrain/TerrainGenerator.js'
import LayeredTerrainBuilder from './terrain/LayeredTerrainBuilder.js'
import { extractBrickGeometry } from './bricks/BrickGeometry.js'
import BrickColorResolver from './bricks/BrickColorResolver.js'
import HeightfieldAO from './bricks/HeightfieldAO.js'
import TerrainBrickRenderer from './bricks/TerrainBrickRenderer.js'
import WaterBrickRenderer from './bricks/WaterBrickRenderer.js'
import LavaBrickRenderer from './bricks/LavaBrickRenderer.js'
import PrefabRegistry from './prefabs/PrefabRegistry.js'
import PrefabPlacer from './prefabs/PrefabPlacer.js'
import PlayerAircraft from './player/PlayerAircraft.js'
import ChunkManager from './chunks/ChunkManager.js'
import BiomeRadarHUD, { BIOME_RADAR_HUD_UPDATE_EVENT } from '../ui/BiomeRadarHUD.js'
import ControlGuideHUD from '../ui/ControlGuideHUD.js'
import { eventBus } from '../utils/event-bus.js'
import { createTerrainPanel } from '../debug/panels/TerrainPanel.js'
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
        this.playerAircraft = null
        this.biomeCenterSystem = null
        this.terrainChunkManager = null
        this.biomeRadarHUD = null
        this._lastBiomeRadarHUDUpdate = null
        this.controlGuideHUD = null
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

        if (!this.terrainBrickRenderer) {
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

            this.terrainBrickRenderer = new TerrainBrickRenderer({
                config: this.config,
                brickGeometry: this.brickGeometry
            })

            const prefabRegistry = new PrefabRegistry(resources)

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
                    waterNoiseTexture: resources.items.waterNoiseTexture,
                    lavaConfig: this.biomeRegistry.get('volcano').lava,
                    lavaNoiseTexture: resources.items.lavaNoiseTexture
                })
                this.terrainBrickRenderer.group.visible = false
            } else {
                this.addSystem(this.terrainBrickRenderer)
            }

            if (!useChunkTerrain) {
                const waterEnabled = this.config.water?.enableWater !== false
                if (waterEnabled) {
                    this.waterBrickRenderer = new WaterBrickRenderer({
                        config: this.config,
                        brickGeometry: this.brickGeometry,
                        waterNoiseTexture: resources.items.waterNoiseTexture
                    })
                    this.addSystem(this.waterBrickRenderer)
                }
                this.lavaBrickRenderer = new LavaBrickRenderer({
                    config: this.config,
                    brickGeometry: this.brickGeometry,
                    lavaConfig: this.biomeRegistry.get('volcano').lava,
                    lavaNoiseTexture: resources.items.lavaNoiseTexture
                })
                this.addSystem(this.lavaBrickRenderer)

                if (this.config.placement?.enablePrefabs !== false) {
                    this.prefabPlacer = new PrefabPlacer({
                        config: this.config,
                        biomeRegistry: this.biomeRegistry,
                        prefabRegistry
                    })
                    this.addSystem(this.prefabPlacer)
                }
            }

            this.playerAircraft = new PlayerAircraft(this.experience, { config: this.config })
            this.addSystem(this.playerAircraft)

            if (!this.biomeCenterSystem && this.config.biomeCenters?.enabled !== false) {
                this.biomeCenterSystem = new BiomeCenterSystem({
                    config: this.config,
                    resources,
                    terrainGenerator: this.terrainGenerator
                })
                this.biomeCenterSystem.build()
                this.addSystem(this.biomeCenterSystem)
            }

            if (!this.biomeRadarHUD && this.config.ui?.biomeRadar?.enabled !== false) {
                this.biomeRadarHUD = new BiomeRadarHUD({ config: this.config })
            }

            if (!this.controlGuideHUD && this.config.ui?.controlGuide?.enabled !== false) {
                this.controlGuideHUD = new ControlGuideHUD({ config: this.config })
            }
        }

        this.regenerate()
    }

    regenerate() {
        if (!this.terrainGenerator || !this.terrainBrickRenderer) {
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
            centerX,
            centerZ,
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
        this.heightfieldAO.build(this.terrainMap)

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
        const preview = this.config.terrain.ao?.previewGrayscale === true

        if (preview && this.terrainMap && this.heightfieldAO) {
            this.heightfieldAO.build(this.terrainMap)
        }

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
        }
        if (this.playerAircraft?.group) {
            this.playerAircraft.group.visible = !preview
        }
    }

    /**
     * @param {import('../debug/Debug.js').default} debug
     */
    debuggerInit(debug) {
        if (!debug.active) {
            return
        }

        const onRegenerate = () => this.regenerate()
        const onAOPreviewChange = () => this.refreshAOPreview()

        createTerrainPanel(debug, this.config, onRegenerate)
        createAOPanel(debug, this.config, onRegenerate, onAOPreviewChange)
        createBiomePanel(debug, this.config, onRegenerate)
        createPlacementPanel(debug, this.config, onRegenerate)
        createMaterialPanel(debug, this.config, {
            legoMaterial: this.terrainChunkManager?.getDebugMaterials().legoMaterial
                ?? this.terrainBrickRenderer?.material,
            waterMaterial: this.terrainChunkManager?.getDebugMaterials().waterMaterial
                ?? this.waterBrickRenderer?.material
        }, onRegenerate)

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

        if (this.biomeRadarHUD && this.playerAircraft?.enabled) {
            this.emitBiomeRadarHUDUpdateIfNeeded()
            this.biomeRadarHUD.update(this.experience.time.getDelta())
        }

        if (this.biomeCenterSystem && this.playerAircraft?.enabled) {
            this.biomeCenterSystem.update(this.playerAircraft.state.position)
        }

        if (this.terrainChunkManager && this.playerAircraft?.enabled) {
            const { x, z } = this.playerAircraft.state.position
            const chunkWorldSize = this.config.chunks.size * this.config.terrain.cellSize
            const maxHeight = this.config.terrain.maxHeight * this.config.terrain.layerHeight + 8

            this.experience.environment.followPlayerShadow?.(
                this.playerAircraft.state.position,
                {
                    halfExtent: chunkWorldSize,
                    maxHeight
                }
            )
            this.terrainChunkManager.update(x, z, this.experience.worldCamera.instance)
        }
    }

    emitBiomeRadarHUDUpdateIfNeeded() {
        const state = this.playerAircraft?.state

        if (!state) {
            return
        }

        const thresholds = this.config.ui?.biomeRadar?.updateThreshold ?? {}
        const positionThreshold = Number.isFinite(thresholds.position) ? thresholds.position : 0.02
        const yawThreshold = Number.isFinite(thresholds.yaw) ? thresholds.yaw : 0.01
        const payload = {
            position: {
                x: state.position.x,
                z: state.position.z
            },
            yaw: state.yaw
        }

        if (!this._lastBiomeRadarHUDUpdate || this.hasBiomeRadarHUDUpdateChanged(payload, {
            positionThreshold,
            yawThreshold
        })) {
            eventBus.emit(BIOME_RADAR_HUD_UPDATE_EVENT, payload)
            this._lastBiomeRadarHUDUpdate = payload
        }
    }

    hasBiomeRadarHUDUpdateChanged(payload, { positionThreshold, yawThreshold }) {
        const previous = this._lastBiomeRadarHUDUpdate

        if (!previous) {
            return true
        }

        const dx = payload.position.x - previous.position.x
        const dz = payload.position.z - previous.position.z
        const positionDelta = Math.sqrt(dx * dx + dz * dz)
        const yawDelta = Math.abs(Math.atan2(
            Math.sin(payload.yaw - previous.yaw),
            Math.cos(payload.yaw - previous.yaw)
        ))

        return positionDelta > positionThreshold || yawDelta > yawThreshold
    }

    dispose() {
        for (const child of this.children) {
            child.dispose?.()
        }
        this.terrainChunkManager?.dispose()
        this.biomeRadarHUD?.dispose()
        this.controlGuideHUD?.dispose()
        this.terrainChunkManager = null
        this.biomeCenterSystem = null
        this.biomeRadarHUD = null
        this.controlGuideHUD = null
        this.children.length = 0
        this.scene.remove(this.group)
    }
}
