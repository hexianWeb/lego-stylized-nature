import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import WorldCamera from '../src/world/camera.js'

test('followTarget smoothly moves camera and target together without rotating the view', () => {
  const camera = new WorldCamera({ width: 1280, height: 720 })
  camera.resetView(new THREE.Vector3(10, 0, 10))
  const before = camera.instance.position.clone()
  const rotation = camera.instance.quaternion.clone()
  const distance = camera.instance.userData.focusDistance

  camera.followTarget(new THREE.Vector3(14, 0, 10), 0.1, 10)

  assert.ok(camera.target.x > 10 && camera.target.x < 14)
  assert.equal(camera.target.z, 10)
  assert.ok(Math.abs(camera.instance.position.x - before.x - (camera.target.x - 10)) < 1e-9)
  assert.equal(camera.instance.position.z, before.z)
  assert.ok(camera.instance.quaternion.equals(rotation))
  assert.equal(camera.instance.userData.focusDistance, distance)
})

test('followTarget snaps when smoothing is zero or less', () => {
  const camera = new WorldCamera({ width: 1280, height: 720 })
  camera.resetView(new THREE.Vector3(10, 0, 10))
  const before = camera.instance.position.clone()

  camera.followTarget(new THREE.Vector3(14, 0, 12), 0.1, 0)

  assert.deepEqual(camera.target.toArray(), [14, 0, 12])
  assert.deepEqual(camera.instance.position.toArray(), before.add(new THREE.Vector3(4, 0, 2)).toArray())
})

test('portrait resizing backs the camera out without rotating it or moving its target', () => {
  const sizes = { width: 1280, height: 720 }
  const camera = new WorldCamera(sizes)
  const position = camera.instance.position.clone()
  const rotation = camera.instance.quaternion.clone()
  const target = camera.target.clone()
  const distance = camera.instance.userData.focusDistance

  Object.assign(sizes, { width: 360, height: 800 })
  camera.resize()
  assert.ok(camera.instance.userData.focusDistance > distance)
  assert.ok(camera.target.equals(target))
  assert.ok(camera.instance.quaternion.equals(rotation))
  assert.ok(Math.abs(camera.instance.position.distanceTo(target) - camera.instance.userData.focusDistance) < 1e-9)

  Object.assign(sizes, { width: 1280, height: 720 })
  camera.resize()
  assert.ok(camera.instance.position.distanceTo(position) < 1e-9)
})
