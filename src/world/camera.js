import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export default class WorldCamera {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {import('../systems/Sizes.js').default} sizes
     */
    constructor(canvas, sizes) {
        this.sizes = sizes
        this.canvas = canvas

        this.instance = new THREE.PerspectiveCamera(25, sizes.width / sizes.height, 0.1, 100)
        this.instance.position.set(6, 3, 10)

        this.controls = new OrbitControls(this.instance, canvas)
        this.controls.enableDamping = true

        this._debugFov = { fov: this.instance.fov }
    }

    resize() {
        this.instance.aspect = this.sizes.width / this.sizes.height
        this.instance.updateProjectionMatrix()
    }

    update() {
        this.controls.update()
    }

    /**
     * @param {import('../utils/debug.js').default} debug
     */
    debuggerInit(debug) {
        if (!debug.active) {
            return
        }
        const folder = debug.addFolder({
            title: 'Camera',
            expanded: false
        })
        if (!folder) {
            return
        }
        folder.addBinding(this._debugFov, 'fov', { min: 10, max: 90, step: 1, label: 'FOV' }).on('change', () => {
            this.instance.fov = this._debugFov.fov
            this.instance.updateProjectionMatrix()
        })
    }

    dispose() {
        this.controls.dispose()
    }
}
