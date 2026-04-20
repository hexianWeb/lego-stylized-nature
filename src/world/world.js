import * as THREE from 'three/webgpu'
import { sin, positionLocal, time, vec2, vec3, vec4, uv, uniform } from 'three/tsl'

export default class World {
    /**
     * @param {import('../app/Experience.js').default} experience
     */
    constructor(experience) {
        this.experience = experience
        this.scene = experience.scene

        this.axesHelper = new THREE.AxesHelper(5)
        this.scene.add(this.axesHelper)

        this.box = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.2, 0.2),
            new THREE.MeshBasicMaterial({
                color: 'red'
            })
        )
        this.scene.add(this.box)

        this.tweakParams = {
            timeFrequency: 0.5,
            positionFrequency: 2,
            intensityFrequency: 0.5
        }
        this.timeFrequency = uniform(this.tweakParams.timeFrequency)
        this.positionFrequency = uniform(this.tweakParams.positionFrequency)
        this.intensityFrequency = uniform(this.tweakParams.intensityFrequency)

        const oscillation = sin(time.mul(this.timeFrequency).add(positionLocal.y.mul(this.positionFrequency))).mul(this.intensityFrequency)
        this.material = new THREE.MeshBasicNodeMaterial()
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
    }

    /**
     * @param {import('../utils/debug.js').default} debug
     */
    debuggerInit(debug) {
        if (!debug.active) {
            return
        }
        const folder = debug.addFolder({
            title: 'Demo',
            expanded: true
        })
        if (!folder) {
            return
        }
        folder.addBinding(this.tweakParams, 'timeFrequency', { min: 0, max: 5, label: 'timeFrequency' }).on('change', () => {
            this.timeFrequency.value = this.tweakParams.timeFrequency
        })
        folder.addBinding(this.tweakParams, 'positionFrequency', { min: 0, max: 5, label: 'positionFrequency' }).on('change', () => {
            this.positionFrequency.value = this.tweakParams.positionFrequency
        })
        folder.addBinding(this.tweakParams, 'intensityFrequency', { min: 0, max: 5, label: 'intensityFrequency' }).on('change', () => {
            this.intensityFrequency.value = this.tweakParams.intensityFrequency
        })
    }

    update() {}

    dispose() {
        this.torusKnot.geometry.dispose()
        this.material.dispose()

        this.box.geometry.dispose()
        this.box.material.dispose()

        this.axesHelper.geometry.dispose()
        this.axesHelper.material.dispose()
    }
}
