import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TrackballControls } from 'three/addons/controls/TrackballControls.js'

export default class WorldCamera {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {import('../systems/Sizes.js').default} sizes
     */
    constructor(canvas, sizes) {
        this.sizes = sizes
        this.canvas = canvas

        this._frustumHeight = 15/2

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
        this.controls.enableRotate = true
        this.controls.enablePan = false
        this.controls.enableZoom = false
        this.controls.minPolarAngle = 0
        this.controls.maxPolarAngle = Math.PI / 4

        this.trackballControls = new TrackballControls(this.instance, canvas)
        this.trackballControls.noRotate = true
        this.trackballControls.noPan = true
        this.trackballControls.staticMoving = false
        this.trackballControls.dynamicDampingFactor = 0.2
        this.trackballControls.minZoom = 0.5
        this.trackballControls.maxZoom = 2
        this.trackballControls.target.copy(this.controls.target)
    }

    _syncTrackballTarget() {
        this.trackballControls.target.copy(this.controls.target)
    }

    lookAt(target) {
        this.controls.target.copy(target)
        this._syncTrackballTarget()
        this.controls.update()
    }

    followTarget(target, delta, smoothing = 0) {
        const previousTarget = this.controls.target.clone()
        const nextTarget = target.clone()

        if (smoothing > 0 && delta > 0) {
            const alpha = 1 - Math.exp(-smoothing * delta)
            nextTarget.lerpVectors(previousTarget, target, alpha)
        }

        const movement = nextTarget.sub(previousTarget)
        this.controls.target.copy(previousTarget).add(movement)
        this.instance.position.add(movement)
        this._syncTrackballTarget()
        this.controls.update()
    }

    resize() {
        const aspect = this.sizes.width / this.sizes.height
        this.instance.left = -this._frustumHeight * aspect * 0.5
        this.instance.right = this._frustumHeight * aspect * 0.5
        this.instance.top = this._frustumHeight * 0.5
        this.instance.bottom = -this._frustumHeight * 0.5
        this.instance.updateProjectionMatrix()
        this.trackballControls.handleResize()
    }

    update() {
        this.controls.update()
        this._syncTrackballTarget()
        this.trackballControls.update()
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
        this.trackballControls.dispose()
    }
}
