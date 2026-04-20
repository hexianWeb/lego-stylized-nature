import * as THREE from 'three/webgpu'
import Debug from '../utils/debug.js'
import WorldCamera from '../world/camera.js'
import Environment from '../world/environment.js'
import World from '../world/world.js'
import Sizes from '../systems/Sizes.js'
import Time from '../systems/Time.js'
import Renderer from '../renderer/Renderer.js'

export default class Experience {
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this.canvas = canvas

        this.debug = new Debug()
        this.sizes = new Sizes()
        this.time = new Time()
        this.renderer = new Renderer({ canvas })

        this.scene = new THREE.Scene()
        this.environment = new Environment(this.scene)

        this.worldCamera = new WorldCamera(canvas, this.sizes)
        this.scene.add(this.worldCamera.instance)

        this.world = new World(this)

        /** @type {(() => void) | null} */
        this._unsubscribeResize = null
    }

    async init() {
        this.renderer.attachPipeline(this.scene, this.worldCamera.instance)
        await this.renderer.init()

        this.time.connectDocument(document)

        this._unsubscribeResize = this.sizes.onResize(() => {
            this.resize()
        })

        this.renderer.instance.setClearColor(this.environment.fogColor.value)
        this.resize()

        if (this.debug.active) {
            this.environment.debuggerInit(this.debug)
            this.worldCamera.debuggerInit(this.debug)
            this.world.debuggerInit(this.debug)
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
        this.renderer.render()
    }

    dispose() {
        this.renderer.instance.setAnimationLoop(null)
        this._unsubscribeResize?.()
        this._unsubscribeResize = null

        this.world.dispose()
        this.worldCamera.dispose()
        this.debug.dispose()
        this.sizes.dispose()
        this.time.dispose()

        if (typeof this.renderer.instance.dispose === 'function') {
            this.renderer.instance.dispose()
        }
    }
}
