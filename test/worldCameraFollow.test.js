import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import WorldCamera from '../src/world/camera.js'
import { createAircraftState } from '../src/world/player/aircraftMotion.js'

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

test('chase looks up and down with body pitch while keeping the horizon level', () => {
  const camera = new WorldCamera({ width: 1280, height: 720 })
  const state = createAircraftState({ position: [12, 8, 9] })
  const direction = new THREE.Vector3()
  const projection = new THREE.Vector3()
  for (const [pitch, boost] of [[0, 0], [0.6, 0], [-0.6, 0], [1.4, 1]]) {
    state.pitch = pitch
    state.roll = 0.7
    state.boost = boost
    camera.followFlight(state, 'chase', 0)
    camera.instance.getWorldDirection(direction)

    const elevation = Math.asin(direction.y)
    assert.ok(Math.abs(elevation - (THREE.MathUtils.degToRad(-12) + 0.9 * Math.sin(pitch))) < 1e-8)
    assert.ok(camera.instance.position.x < state.position.x)
    assert.ok(Math.abs(new THREE.Vector3(1, 0, 0).applyQuaternion(camera.instance.quaternion).y) < 1e-8)
    const screenY = (1 - projection.copy(state.position).project(camera.instance).y) / 2
    assert.ok(Math.abs(screenY - (0.64 - 0.03 * boost)) < 1e-8)
  }
})

test('chase keeps ground clearance at its own position when a climb lowers the camera', () => {
  const camera = new WorldCamera({ width: 1280, height: 720 })
  const state = createAircraftState({ position: [12, 3, 9] })
  state.pitch = 0.9
  const surface = 2.7
  camera.followFlight(state, 'chase', 0, () => null)
  assert.ok(camera.instance.position.y < surface + 0.28)

  const samples = []
  camera.followFlight(state, 'chase', 0, (x, z) => {
    samples.push({ x, z })
    return surface
  })
  const { x, y, z } = camera.instance.position
  assert.ok(y >= surface + 0.28 - 1e-8)
  assert.ok(samples.some(sample => Math.hypot(sample.x - x, sample.z - z) < 1e-8))
  assert.ok(x < state.position.x)
})

test('chase heading trails a turn across the angle wrap and settles along the shorter arc', () => {
  const camera = new WorldCamera({ width: 1280, height: 720 })
  const start = Math.PI - 0.2
  const state = createAircraftState({ yaw: start })
  const direction = new THREE.Vector3()
  const yawDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from))
  const heading = () => {
    camera.instance.getWorldDirection(direction)
    return Math.atan2(direction.z, direction.x)
  }
  camera.followFlight(state, 'chase', 0)
  assert.ok(Math.abs(yawDelta(start, heading())) < 1e-8)

  state.yaw = -Math.PI + 0.2
  camera.followFlight(state, 'chase', 0.1)
  assert.ok(Math.abs(yawDelta(start, heading()) - 0.4 * (1 - Math.exp(-3.4 * 0.1))) < 1e-8)
  for (let i = 0; i < 9; i++) camera.followFlight(state, 'chase', 0.1)
  assert.ok(Math.abs(yawDelta(heading(), state.yaw) - 0.4 * Math.exp(-3.4)) < 1e-8)
})
