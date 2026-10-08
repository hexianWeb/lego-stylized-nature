import * as THREE from 'three/webgpu'
import Debug from '../debug/Debug.js'
import Resources from '../utils/Resources.js'
import WorldCamera from '../world/camera.js'
import Environment from '../world/environment.js'
import World from '../world/world.js'
import Sizes from '../systems/Sizes.js'
import Time from '../systems/Time.js'
import Renderer from '../renderer/Renderer.js'
import { worldConfig } from '../world/WorldConfig.js'
import { createPostProcessingPanel } from '../debug/panels/PostProcessingPanel.js'
import { createPerformancePanel } from '../debug/panels/PerformancePanel.js'

export default class Experience {
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this.canvas = canvas

        this.debug = new Debug()
        this.sizes = new Sizes()
        this.time = new Time()
        this.renderer = new Renderer({
            canvas,
            postProcessing: worldConfig.postProcessing,
            trackTimestamp: this.debug.active
        })

        this.scene = new THREE.Scene()
        this.environment = new Environment(this.scene)

        this.worldCamera = new WorldCamera(canvas, this.sizes)
        this.scene.add(this.worldCamera.instance)

        this.resources = new Resources()
        this.world = new World(this)

        /** @type {(() => void) | null} */
        this._unsubscribeResize = null
        this.performance = {
            frameMs: 0,
            cpuMs: 0,
            gpuMs: 0,
            gpuTiming: 'unavailable',
            drawCalls: 0,
            triangles: 0,
            geometries: 0,
            textures: 0,
            waterInstances: 0,
            chunkBuildMs: 0,
            prefabBuildMs: 0
        }
        this.initTimings = {}
        this._gpuTimingPending = false
        this.disposed = false
    }

    async init() {
        if (this.disposed) {
            throw new Error('[Experience] Already disposed')
        }
        const started = performance.now()
        this.renderer.attachPipeline(this.scene, this.worldCamera.instance)
        await this.renderer.init()
        const rendererReady = performance.now()
        this.initTimings.rendererMs = rendererReady - started
        await this.resources.ready
        const resourcesReady = performance.now()
        this.initTimings.resourcesWaitMs = resourcesReady - rendererReady
        this.resources.assertRequired()
        this.environment.applyEnvironmentMap(
            this.renderer.instance,
            this.resources.items.studioEnvMap
        )
        this.resources.release('studioEnvMap')
        const environmentReady = performance.now()
        this.initTimings.environmentMs = environmentReady - resourcesReady
        this.world.build()
        const worldReady = performance.now()
        this.initTimings.worldMs = worldReady - environmentReady

        this.time.connectDocument(document)

        this._unsubscribeResize = this.sizes.onResize(() => {
            this.resize()
        })

        this.renderer.instance.setClearColor(this.environment.clearColor)
        this.resize()
        await this.world.warmupPrefabPipelines(
            this.renderer.instance,
            this.worldCamera.instance,
            () => this.renderer.render()
        )
        this.initTimings.warmupMs = performance.now() - worldReady
        this.initTimings.totalMs = performance.now() - started
        if (this.disposed) {
            throw new Error('[Experience] Disposed during initialization')
        }

        if (this.debug.active) {
            createPerformancePanel(this.debug, this)
            this.environment.debuggerInit(this.debug)
            this.worldCamera.debuggerInit(this.debug)
            this.world.debuggerInit(this.debug)
            if (this.renderer.postProcessingEnabled) {
                createPostProcessingPanel(
                    this.debug,
                    worldConfig,
                    this.renderer.postProcessingController
                )
            }
        }
    }

    resize() {
        this.worldCamera.resize()
        this.renderer.setSizeFromSizes(this.sizes)
    }

    start() {
        this.renderer.instance.setAnimationLoop((timestamp) => {
            this.update(timestamp)
        })
    }

    /**
     * @param {number} timestamp
     */
    update(timestamp) {
        const started = this.debug.active ? performance.now() : 0
        this.time.update(timestamp)
        this.worldCamera.update()
        this.world.update()
        this.renderer.updatePostProcessingTime(this.time.getElapsed())
        this.renderer.render()
        if (this.debug.active) {
            this.performance.frameMs = this.time.getDelta() * 1000
            this.performance.cpuMs = performance.now() - started
            this.updatePerformanceMetrics()
        }
    }

    updatePerformanceMetrics() {
        const renderer = this.renderer.instance
        const manager = this.world.terrainChunkManager
        Object.assign(this.performance, {
            drawCalls: renderer.info.render.drawCalls,
            triangles: renderer.info.render.triangles,
            geometries: renderer.info.memory.geometries,
            textures: renderer.info.memory.textures,
            waterInstances: manager
                ? manager.slots.reduce((count, slot) => count + (slot.waterRenderer?.instanceCount ?? 0), 0)
                : this.world.waterBrickRenderer?.instanceCount ?? 0,
            chunkBuildMs: manager?.buildTimings?.totalMs ?? 0,
            prefabBuildMs: manager
                ? Math.max(0, ...manager.slots.map((slot) => slot.prefabBuildMs ?? 0))
                : 0
        })

        if (!renderer.backend.trackTimestamp || this._gpuTimingPending) {
            return
        }
        this._gpuTimingPending = true
        renderer.resolveTimestampsAsync().then((duration) => {
            if (this.disposed) {
                return
            }
            this.performance.gpuMs = duration
            this.performance.gpuTiming = 'available'
        }).catch(() => {
            this.performance.gpuTiming = 'unavailable'
        }).finally(() => {
            this._gpuTimingPending = false
        })
    }

    getPerformanceSnapshot() {
        const manager = this.world.terrainChunkManager
        return {
            ...this.performance,
            viewport: [this.sizes.width, this.sizes.height],
            dpr: window.devicePixelRatio,
            init: { ...this.initTimings },
            chunk: { ...manager?.buildTimings },
            memory: { ...this.renderer.instance.info.memory },
            loadedChunks: manager?.activeSlots.size ?? 0,
            waterMeshes: manager
                ? manager.slots.reduce((count, slot) => count + (slot.waterRenderer?.pages.length ?? 0), 0)
                : this.world.waterBrickRenderer?.pages.length ?? 0,
            terrainMaterials: manager
                ? new Set(manager.slots.map((slot) => slot.terrainRenderer.material)).size
                : this.world.terrainBrickRenderer ? 1 : 0,
            rawHDRRetained: Boolean(this.resources.items.studioEnvMap),
            playerPosition: this.world.playerAircraft?.state.position.toArray() ?? null,
            chunkCenter: manager?.centerCoord ?? null,
            waterMaterials: manager
                ? new Set(manager.slots.map((slot) => slot.waterRenderer?.material)).size
                : this.world.waterBrickRenderer ? 1 : 0
        }
    }

    dispose() {
        if (this.disposed) {
            return
        }
        this.disposed = true
        if (this.renderer.initialized) {
            this.renderer.instance.setAnimationLoop(null)
        }
        this._unsubscribeResize?.()
        this._unsubscribeResize = null

        this.world.dispose()
        this.environment.dispose()
        this.worldCamera.dispose()
        this.debug.dispose()
        this.sizes.dispose()
        this.time.dispose()
        this.resources.dispose()
        this.renderer.dispose()
    }
}
