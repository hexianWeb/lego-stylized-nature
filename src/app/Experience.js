import { Pane } from 'tweakpane'
import * as THREE from 'three/webgpu'
import { sin, positionLocal, time, vec2, vec3, vec4, uv, uniform, color, fog, rangeFogFactor } from 'three/tsl'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import Sizes from '../systems/Sizes.js'
import Time from '../systems/Time.js'
import Renderer from '../renderer/Renderer.js'

export default class Experience {
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this.canvas = canvas

        this.sizes = new Sizes()
        this.time = new Time()
        this.renderer = new Renderer({ canvas })

        this.scene = new THREE.Scene()
        this.fogColor = uniform(color('#ffffff'))
        this.scene.fogNode = fog(this.fogColor, rangeFogFactor(10, 15))

        this.camera = new THREE.PerspectiveCamera(25, this.sizes.width / this.sizes.height, 0.1, 100)
        this.camera.position.set(6, 3, 10)
        this.scene.add(this.camera)

        this.controls = new OrbitControls(this.camera, this.canvas)
        this.controls.enableDamping = true

        this.material = new THREE.MeshBasicNodeMaterial()
        this.tweakParams = {
            timeFrequency: 0.5,
            positionFrequency: 2,
            intensityFrequency: 0.5
        }
        this.timeFrequency = uniform(this.tweakParams.timeFrequency)
        this.positionFrequency = uniform(this.tweakParams.positionFrequency)
        this.intensityFrequency = uniform(this.tweakParams.intensityFrequency)

        this.pane = new Pane({ title: 'Debug' })
        this.pane.addBinding(this.tweakParams, 'timeFrequency', { min: 0, max: 5, label: 'timeFrequency' }).on('change', () => {
            this.timeFrequency.value = this.tweakParams.timeFrequency
        })
        this.pane.addBinding(this.tweakParams, 'positionFrequency', { min: 0, max: 5, label: 'positionFrequency' }).on('change', () => {
            this.positionFrequency.value = this.tweakParams.positionFrequency
        })
        this.pane.addBinding(this.tweakParams, 'intensityFrequency', { min: 0, max: 5, label: 'intensityFrequency' }).on('change', () => {
            this.intensityFrequency.value = this.tweakParams.intensityFrequency
        })

        const oscillation = sin(time.mul(this.timeFrequency).add(positionLocal.y.mul(this.positionFrequency))).mul(this.intensityFrequency)
        this.material.positionNode = vec3(
            positionLocal.x.add(oscillation),
            positionLocal.y,
            positionLocal.z
        )
        this.material.colorNode = vec4(
            uv().mul(vec2(32, 8)).fract(),
            1,
            1
        )

        this.torusKnot = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.35, 128, 32), this.material)
        this.scene.add(this.torusKnot)

        /** @type {(() => void) | null} */
        this._unsubscribeResize = null
    }

    async init() {
        this.renderer.attachPipeline(this.scene, this.camera)
        await this.renderer.init()

        this.time.connectDocument(document)

        this._unsubscribeResize = this.sizes.onResize(() => {
            this.resize()
        })

        this.renderer.instance.setClearColor(this.fogColor.value)
        this.resize()
    }

    resize() {
        this.camera.aspect = this.sizes.width / this.sizes.height
        this.camera.updateProjectionMatrix()
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
        this.controls.update()
        this.renderer.render()
    }

    dispose() {
        this.renderer.instance.setAnimationLoop(null)
        this._unsubscribeResize?.()
        this._unsubscribeResize = null

        this.controls.dispose()
        this.pane.dispose()
        this.sizes.dispose()
        this.time.dispose()

        this.torusKnot.geometry.dispose()
        this.material.dispose()

        if (typeof this.renderer.instance.dispose === 'function') {
            this.renderer.instance.dispose()
        }
    }
}
