import * as THREE from 'three/webgpu'
import { color, fog, rangeFogFactor, uniform } from 'three/tsl'

export default class Environment {
    /**
     * @param {THREE.Scene} scene
     */
    constructor(scene) {
        this.scene = scene
        this.envMap = null

        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.2)
        this.scene.add(this.ambientLight)

        this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.0)
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
     * @param {THREE.WebGPURenderer} renderer
     * @param {THREE.Texture | null} equirectTexture
     */
    applyEnvironmentMap(renderer, equirectTexture) {
        if (!equirectTexture) {
            console.warn('[Environment] Missing HDR texture; scene.environment skipped.')
            return
        }

        this.envMap?.dispose()
        this.envMap = null

        equirectTexture.mapping = THREE.EquirectangularReflectionMapping

        const pmremGenerator = new THREE.PMREMGenerator(renderer)
        pmremGenerator.compileEquirectangularShader()
        this.envMap = pmremGenerator.fromEquirectangular(equirectTexture).texture
        pmremGenerator.dispose()

        this.scene.environment = this.envMap
        this.scene.environmentIntensity = 0.4
        this.scene.background = this.envMap
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
        this.scene.environment = null
        this.envMap?.dispose()
        this.envMap = null
        this.scene.remove(this.ambientLight)
        this.scene.remove(this.directionalLight)
    }
}
