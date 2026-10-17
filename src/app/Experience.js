import * as THREE from 'three/webgpu'
import Debug from '../debug/Debug.js'
import Resources from '../utils/Resources.js'
import WorldCamera from '../world/camera.js'
import Environment from '../world/environment.js'
import World from '../world/world.js'
import Sizes from '../systems/Sizes.js'
import Time from '../systems/Time.js'
import Renderer from '../renderer/Renderer.js'
import { WebGLFallbackRenderer } from '../renderer/WebGLFallbackRenderer.js'
import { worldConfig } from '../world/WorldConfig.js'
import { createPostProcessingPanel } from '../debug/panels/PostProcessingPanel.js'
import { Sandbox } from '../sandbox/Sandbox.js'

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
            postProcessing: worldConfig.postProcessing
        })

        this.scene = new THREE.Scene()
        this.environment = new Environment(this.scene)

        this.worldCamera = new WorldCamera(canvas, this.sizes)
        this.scene.add(this.worldCamera.instance)

        this.resources = new Resources()
        this.world = new World(this)
        this.sandbox = new Sandbox({ experience: this })

        /** @type {(() => void) | null} */
        this._unsubscribeResize = null
    }

    async init() {
        this.renderer.attachPipeline(this.scene, this.worldCamera.instance)
        let useWebGL = false
        try {
            await this.renderer.init()
        } catch (err) {
            console.warn('[Experience] WebGPU init failed, falling back to WebGL:', err)
            try { this.renderer.dispose?.() } catch (e) { /* ignore */ }
            try {
                this.renderer = new WebGLFallbackRenderer({ canvas: this.canvas })
                this.renderer.attachPipeline(this.scene, this.worldCamera.instance)
                useWebGL = true
                if (typeof window !== 'undefined') {
                    window.__sandbox_use_webgl = true
                }
            } catch (webglErr) {
                console.warn('[Experience] WebGL fallback failed, switching to 2D SSR mode:', webglErr)
                if (typeof window !== 'undefined') {
                    window.__sandbox_2d_only = true
                }
                // Renderer is a no-op stub; the 2D grid renders below.
                this.renderer = {
                    instance: { setClearColor: () => {}, setSize: () => {}, setPixelRatio: () => {}, dispose: () => {} },
                    attachPipeline: () => {},
                    render: () => {},
                    setSizeFromSizes: () => {},
                    postProcessingController: { setTiltShiftEnabled: () => {}, setSpeedLinesEnabled: () => {} },
                    kind: 'ssr-2d',
                    dispose: () => {}
                }
            }
        }
        await this.resources.ready
        if (!useWebGL && this.resources.items.studioEnvMap) {
            this.environment.applyEnvironmentMap(
                this.renderer.instance,
                this.resources.items.studioEnvMap
            )
        } else {
            this.environment.applyRoomEnvironment(this.renderer.instance)
        }
        this.world.build()
        await this.sandbox.init()

        this.time.connectDocument(document)

        this._unsubscribeResize = this.sizes.onResize(() => {
            this.resize()
        })

        if (this.renderer.instance?.setClearColor && this.environment.fogColor) {
            this.renderer.instance.setClearColor(this.environment.fogColor.value)
        }
        this.resize()
        if (!useWebGL) {
            await this.world.warmupPrefabPipelines(
                this.renderer.instance,
                this.worldCamera.instance
            )
        }

        if (this.debug.active && !useWebGL) {
            this.environment.debuggerInit(this.debug)
            this.worldCamera.debuggerInit(this.debug)
            this.world.debuggerInit(this.debug)
            createPostProcessingPanel(
                this.debug,
                worldConfig,
                this.renderer.postProcessingController
            )
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
        this.time.update(timestamp)
        this.worldCamera.update()
        this.world.update()
        this.sandbox.update()
        this.renderer.updatePostProcessingTime(this.time.getElapsed())
        this.renderer.render()
    }

    dispose() {
        this.renderer.instance.setAnimationLoop(null)
        this._unsubscribeResize?.()
        this._unsubscribeResize = null

        this.world.dispose()
        this.sandbox.dispose()
        this.environment.dispose()
        this.worldCamera.dispose()
        this.debug.dispose()
        this.sizes.dispose()
        this.time.dispose()
        this.renderer.dispose()

        if (typeof this.renderer.instance.dispose === 'function') {
            this.renderer.instance.dispose()
        }
    }
}
