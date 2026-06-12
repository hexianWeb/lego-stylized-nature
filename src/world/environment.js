import * as THREE from 'three/webgpu'
import { color, fog, rangeFogFactor, uniform } from 'three/tsl'

export default class Environment {
    /**
     * @param {THREE.Scene} scene
     */
    constructor(scene) {
        this.scene = scene

        this.ambientLight = new THREE.AmbientLight(0xffffff, 1.2)
        this.scene.add(this.ambientLight)

        this.directionalLight = new THREE.DirectionalLight(0xffffff, 2)
        this.directionalLight.position.set(12, 18, 8)
        this.scene.add(this.directionalLight)

        this.fogColor = uniform(color('#ffffff'))
        this.fogRange = { near: 80, far: 140 }
        this._rebuildFog()
    }

    _rebuildFog() {
        this.scene.fogNode = fog(this.fogColor, rangeFogFactor(this.fogRange.near, this.fogRange.far))
    }

    /**
     * @param {import('../utils/debug.js').default} debug
     */
    debuggerInit(debug) {
        if (!debug.active) {
            return
        }
        const folder = debug.addFolder({
            title: 'Environment',
            expanded: false
        })
        if (!folder) {
            return
        }
        folder.addBinding(this.fogRange, 'near', { min: 0.1, max: 50, step: 0.1, label: 'fog near' }).on('change', () => {
            this._rebuildFog()
        })
        folder.addBinding(this.fogRange, 'far', { min: 0.1, max: 80, step: 0.1, label: 'fog far' }).on('change', () => {
            this._rebuildFog()
        })
    }

    dispose() {
        this.scene.remove(this.ambientLight)
        this.scene.remove(this.directionalLight)
    }
}
