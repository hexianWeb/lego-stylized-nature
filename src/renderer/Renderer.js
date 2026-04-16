import * as THREE from 'three/webgpu'
import { pass } from 'three/tsl'

export default class Renderer {
    /**
     * @param {{ canvas: HTMLCanvasElement }} options
     */
    constructor({ canvas }) {
        this.instance = new THREE.WebGPURenderer({
            canvas,
            forceWebGL: false
        })
        /** @type {THREE.RenderPipeline | null} */
        this.renderPipeline = null
    }

    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Camera} camera
     */
    attachPipeline(scene, camera) {
        const scenePass = pass(scene, camera)
        this.renderPipeline = new THREE.RenderPipeline(this.instance, scenePass)
    }

    async init() {
        await this.instance.init()
    }

    /**
     * @param {{ width: number, height: number }} sizes
     */
    setSizeFromSizes(sizes) {
        this.instance.setSize(sizes.width, sizes.height)
        this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    }

    render() {
        this.renderPipeline.render()
    }
}
