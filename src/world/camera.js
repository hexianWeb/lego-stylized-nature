import * as THREE from 'three/webgpu'

const DEFAULT_TARGET = new THREE.Vector3(12.8, 0, 12.8)
const DEFAULT_VIEW_DIRECTION = new THREE.Vector3(27.2, 40, 27.2).normalize()
const DEFAULT_FRUSTUM_HEIGHT = 6.4
const MIN_FRAMING_ASPECT = 0.8

export default class WorldCamera {
  /**
   * @param {import('../systems/Sizes.js').default} sizes
   */
  constructor(sizes) {
    this.sizes = sizes
    this.fov = 22
    this.target = new THREE.Vector3()
    this._offset = new THREE.Vector3()

    const aspect = sizes.width / sizes.height
    this.instance = new THREE.PerspectiveCamera(
      this.fov,
      aspect,
      0.1,
      200,
    )

    this.resetView(DEFAULT_TARGET)
  }

  _framingScale() {
    // Preserve some room to see where the aircraft is heading in portrait.
    return Math.max(1, MIN_FRAMING_ASPECT / this.instance.aspect)
  }

  _getDistanceForFrustumHeight() {
    const halfFovRad = THREE.MathUtils.degToRad(this.fov * 0.5)
    return this._frustumHeight * this._framingScale() / (2 * Math.tan(halfFovRad))
  }

  _applyFrustumDistance(direction = this._offset.subVectors(this.instance.position, this.target)) {
    if (direction.lengthSq() <= 1e-6) direction = DEFAULT_VIEW_DIRECTION
    const distance = this._getDistanceForFrustumHeight()
    this.instance.position.copy(this.target).addScaledVector(direction, distance / direction.length())
    this.lookAt(this.target)
  }

  lookAt(target) {
    this.target.copy(target)
    this.instance.lookAt(this.target)
    this.instance.userData.focusDistance = this.instance.position.distanceTo(this.target)
  }

  resetView(target) {
    this.target.copy(target)
    this._frustumHeight = DEFAULT_FRUSTUM_HEIGHT
    this._applyFrustumDistance(DEFAULT_VIEW_DIRECTION)
  }

  screenDirectionToYaw(position, right, up) {
    const { position: eye, quaternion } = this.instance
    const direction = this._offset.set(right, up, 0).applyQuaternion(quaternion)
    // Shift the screen-plane vector along the view ray to keep flight at the
    // same altitude. This corrects tilt and perspective even off-center.
    const height = eye.y - position.y
    const rayScale = Math.abs(height) > 1e-6 ? direction.y / height : 0
    return Math.atan2(
      direction.z + (position.z - eye.z) * rayScale,
      direction.x + (position.x - eye.x) * rayScale,
    )
  }

  followTarget(target, delta, smoothing = 0) {
    const alpha = smoothing > 0 && delta > 0 ? 1 - Math.exp(-smoothing * delta) : 1
    const movement = this._offset.subVectors(target, this.target).multiplyScalar(alpha)
    this.target.add(movement)
    // Translating both by the same amount preserves the camera's fixed angle.
    this.instance.position.add(movement)
  }

  resize() {
    const previousScale = this._framingScale()
    this.instance.aspect = this.sizes.width / this.sizes.height
    this.instance.updateProjectionMatrix()
    const scale = this._framingScale() / previousScale
    if (scale !== 1) {
      const offset = this._offset.subVectors(this.instance.position, this.target)
      this.instance.position.copy(this.target).addScaledVector(offset, scale)
      this.instance.userData.focusDistance = offset.length() * scale
    }
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
    this.instance.removeFromParent()
  }
}
