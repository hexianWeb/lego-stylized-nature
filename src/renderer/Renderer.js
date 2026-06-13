import * as THREE from 'three/webgpu'
import { pass, renderOutput, Fn, float, screenUV, smoothstep } from 'three/tsl'
import { smaa } from 'three/addons/tsl/display/SMAANode.js'

// dist is scaled so screen corners sit near 1.0 (~sqrt(2)/2 * 1.42)
const VIGNETTE_INNER = 0.22
const VIGNETTE_OUTER = 0.92
const VIGNETTE_AMOUNT = 0.2

const applyVignette = Fn(() => {
    const dist = screenUV.sub(0.5).length().mul(1.42)
    const mask = smoothstep(VIGNETTE_INNER, VIGNETTE_OUTER, dist)
    return float(1.0).sub(mask.mul(VIGNETTE_AMOUNT))
})

export default class Renderer {
    /**
     * @param {{ canvas: HTMLCanvasElement }} options
     */
    constructor({ canvas }) {
        this.instance = new THREE.WebGPURenderer({
            canvas,
            forceWebGL: false
        })
        this.instance.outputColorSpace = THREE.SRGBColorSpace
        this.instance.toneMapping = THREE.CineonToneMapping
        this.instance.toneMappingExposure = 1.0
        /** @type {THREE.RenderPipeline | null} */
        this.renderPipeline = null
    }

    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Camera} camera
     */
    attachPipeline(scene, camera) {
        const scenePass = pass(scene, camera)
        const color = renderOutput(scenePass)
        const vignetted = color.mul(applyVignette())
        const output = smaa(vignetted)

        this.renderPipeline = new THREE.RenderPipeline(this.instance)
        this.renderPipeline.outputColorTransform = false
        this.renderPipeline.outputNode = output
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