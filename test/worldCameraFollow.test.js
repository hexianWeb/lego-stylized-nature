import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import WorldCamera from '../src/world/camera.js'

test('followTarget moves camera and controls target by the same delta', () => {
  const camera = Object.create(WorldCamera.prototype)
  camera.instance = new THREE.OrthographicCamera()
  camera.instance.position.set(40, 40, 40)
  let updateCount = 0
  camera.controls = {
    target: new THREE.Vector3(10, 0, 10),
    update() {
      updateCount += 1
    }
  }

  camera.followTarget(new THREE.Vector3(14, 0, 10), 0.1, 10)

  assert.equal(camera.controls.target.x > 10, true)
  assert.equal(camera.controls.target.x < 14, true)
  assert.equal(camera.controls.target.z, 10)
  assert.equal(camera.instance.position.x, 40 + (camera.controls.target.x - 10))
  assert.equal(camera.instance.position.z, 40)
  assert.equal(updateCount, 1)
})

test('followTarget snaps when smoothing is zero or less', () => {
  const camera = Object.create(WorldCamera.prototype)
  camera.instance = new THREE.OrthographicCamera()
  camera.instance.position.set(40, 40, 40)
  camera.controls = {
    target: new THREE.Vector3(10, 0, 10),
    update() {}
  }

  camera.followTarget(new THREE.Vector3(14, 0, 12), 0.1, 0)

  assert.equal(camera.controls.target.x, 14)
  assert.equal(camera.controls.target.z, 12)
  assert.equal(camera.instance.position.x, 44)
  assert.equal(camera.instance.position.z, 42)
})
