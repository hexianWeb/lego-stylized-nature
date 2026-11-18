import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TrackballControls } from 'three/addons/controls/TrackballControls.js'
import * as THREE from 'three/webgpu'

const DEFAULT_TARGET = new THREE.Vector3(12.8, 0, 12.8)
const DEFAULT_VIEW_DIRECTION = new THREE.Vector3(27.2, 40, 27.2).normalize()

export default class WorldCamera {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../systems/Sizes.js').default} sizes
   */
  constructor(canvas, sizes) {
    this.sizes = sizes
    this.canvas = canvas

    this.fov = 22
    this._frustumHeight = 6.4

    const aspect = sizes.width / sizes.height
    this.instance = new THREE.PerspectiveCamera(
      this.fov,
      aspect,
      0.1,
      200,
    )

    this.controls = new OrbitControls(this.instance, canvas)
    this.controls.enableDamping = true
    this.controls.enableRotate = true
    this.controls.enablePan = false
    this.controls.enableZoom = false
    this.controls.minPolarAngle = 0
    this.controls.maxPolarAngle = Math.PI * 0.3
    this.controls.target.copy(DEFAULT_TARGET)

    this.trackballControls = new TrackballControls(this.instance, canvas)
    this.trackballControls.noRotate = true
    this.trackballControls.noPan = true
    this.trackballControls.staticMoving = false
    this.trackballControls.dynamicDampingFactor = 0.2
    this.trackballControls.target.copy(this.controls.target)

    this._applyFrustumDistance(DEFAULT_VIEW_DIRECTION)
    this.controls.update()
  }

  _getDistanceForFrustumHeight() {
    const halfFovRad = THREE.MathUtils.degToRad(this.fov * 0.5)
    return this._frustumHeight / (2 * Math.tan(halfFovRad))
  }

  _applyFrustumDistance(directionOverride = null) {
    const distance = this._getDistanceForFrustumHeight()
    const direction = directionOverride
      ? directionOverride.clone().normalize()
      : this.instance.position.clone().sub(this.controls.target)
    if (direction.lengthSq() > 1e-6) {
      direction.normalize()
    }
    else {
      direction.copy(DEFAULT_VIEW_DIRECTION)
    }

    this.instance.position.copy(this.controls.target).addScaledVector(direction, distance)
    if (this.trackballControls) {
      this.trackballControls.minDistance = distance / 3
      this.trackballControls.maxDistance = distance * 2
    }
    this._syncFocusDistance()
  }

  _syncFocusDistance() {
    if (this.instance?.userData && this.controls?.target) {
      this.instance.userData.focusDistance = this.instance.position.distanceTo(this.controls.target)
    }
  }

  _syncTrackballTarget() {
    this.trackballControls?.target?.copy(this.controls.target)
  }

  lookAt(target) {
    this.controls.target.copy(target)
    this._syncTrackballTarget()
    this.controls.update()
    this._syncFocusDistance()
  }

  resetView(target) {
    this.controls.reset()
    this.trackballControls.reset()
    this.controls.target.copy(target)
    this._frustumHeight = 6.4
    this._applyFrustumDistance(DEFAULT_VIEW_DIRECTION)
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
    this._syncFocusDistance()
  }

  resize() {
    const aspect = this.sizes.width / this.sizes.height
    this.instance.aspect = aspect
    this.instance.updateProjectionMatrix()
    this.trackballControls.handleResize()
  }

  update() {
    this.controls.update()
    this._syncTrackballTarget()
    this.trackballControls.update()
    this._syncFocusDistance()
  }

  /**
   * @param {import('../utils/debug.js').default} debug
   */
  debuggerInit(debug) {
    const folder = debug.addFolder({ title: 'Camera', expanded: false })
    if (!folder) {
      return
    }
    folder.addBinding(this, 'fov', { min: 10, max: 55, step: 1, label: 'FOV' }).on('change', () => {
      this.instance.fov = this.fov
      this.instance.updateProjectionMatrix()
      this._applyFrustumDistance()
    })
    folder.addBinding(this, '_frustumHeight', { min: 4, max: 60, step: 0.5, label: 'Frustum H' }).on('change', () => {
      this._applyFrustumDistance()
    })
  }

  dispose() {
    this.controls.dispose()
    this.trackballControls.dispose()
  }
}
