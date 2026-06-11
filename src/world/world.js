import * as THREE from 'three/webgpu'
import { worldConfig } from './WorldConfig.js'
import BiomeRegistry from './biomes/BiomeRegistry.js'
import BiomeBlender from './biomes/BiomeBlender.js'
import BiomeMaskGenerator from './biomes/BiomeMaskGenerator.js'
import TerrainGenerator from './terrain/TerrainGenerator.js'
import LayeredTerrainBuilder from './terrain/LayeredTerrainBuilder.js'
import { extractBrickGeometry } from './bricks/BrickGeometry.js'
import BrickColorResolver from './bricks/BrickColorResolver.js'
import TerrainBrickRenderer from './bricks/TerrainBrickRenderer.js'

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
    }

    addSystem(system) {
        this.children.push(system)
        if (system.group) {
            this.group.add(system.group)
        }
    }

    build() {
        const resources = this.experience.resources
        const brickGeometry = extractBrickGeometry(resources.items.brick2x2Model, this.config.terrain.cellSize)

        const biomeRegistry = new BiomeRegistry()
        const biomeBlender = new BiomeBlender(biomeRegistry)
        const biomeMaskGenerator = new BiomeMaskGenerator(this.config)
        const terrainGenerator = new TerrainGenerator({
            config: this.config,
            biomeMaskGenerator,
            biomeBlender
        })
        const layeredTerrainBuilder = new LayeredTerrainBuilder({ config: this.config })

        this.terrainMap = terrainGenerator.generate()
        this.terrainPlacements = layeredTerrainBuilder.buildPlacements(this.terrainMap)

        const { width, depth, cellSize } = this.config.terrain
        this.experience.worldCamera.lookAt(new THREE.Vector3(width * cellSize / 2, 0, depth * cellSize / 2))

        if (!brickGeometry) {
            console.warn('[World] Missing brick geometry; terrain render skipped.')
            return
        }

        const brickColorResolver = new BrickColorResolver({
            biomeRegistry,
            biomeBlender,
            config: this.config
        })
        const terrainBrickRenderer = new TerrainBrickRenderer({
            config: this.config,
            brickGeometry
        })
        terrainBrickRenderer.build(this.terrainPlacements, brickColorResolver)
        this.addSystem(terrainBrickRenderer)
    }

    /**
     * @param {import('../utils/debug.js').default} debug
     */
    debuggerInit(debug) {
        for (const child of this.children) {
            child.debuggerInit?.(debug)
        }
    }

    update() {
        for (const child of this.children) {
            child.update?.()
        }
    }

    dispose() {
        for (const child of this.children) {
            child.dispose?.()
        }
        this.children.length = 0
        this.scene.remove(this.group)
    }
}
