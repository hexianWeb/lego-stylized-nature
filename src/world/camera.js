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

        this._frustumHeight = 42

        const aspect = sizes.width / sizes.height
        this.instance = new THREE.OrthographicCamera(
            -this._frustumHeight * aspect * 0.5,
            this._frustumHeight * aspect * 0.5,
            this._frustumHeight * 0.5,
            -this._frustumHeight * 0.5,
            0.1,
            200
        )
        this.instance.position.set(40, 40, 40)

        this.controls = new OrbitControls(this.instance, canvas)
        this.controls.enableDamping = true
        this.controls.maxPolarAngle = Math.PI / 2
        this.controls.minZoom = 0.5
        this.controls.maxZoom = 6
    }

    lookAt(target) {
        this.controls.target.copy(target)
        this.controls.update()
    }

    resize() {
        const aspect = this.sizes.width / this.sizes.height
        this.instance.left = -this._frustumHeight * aspect * 0.5
        this.instance.right = this._frustumHeight * aspect * 0.5
        this.instance.top = this._frustumHeight * 0.5
        this.instance.bottom = -this._frustumHeight * 0.5
        this.instance.updateProjectionMatrix()
    }

    update() {
        this.controls.update()
    }

    /**
     * @param {import('../utils/debug.js').default} debug
     */
    debuggerInit(debug) {
        const folder = debug.addFolder({ title: 'Camera', expanded: false })
        if (!folder) {
            return
        }
        folder.addBinding(this, '_frustumHeight', { min: 4, max: 60, step: 1, label: 'Frustum H' }).on('change', () => {
            this.instance.updateProjectionMatrix()
            this.resize()
        })
    }

    dispose() {
        this.controls.dispose()
    }
}
