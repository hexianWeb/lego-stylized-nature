import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createAircraftState,
  normalizeAircraftConfig,
  resolveAircraftInput,
  stepAircraftMotion
} from '../src/world/player/aircraftMotion.js'

test('normalizes invalid numeric config to conservative defaults', () => {
  const config = normalizeAircraftConfig({
    height: -1,
    scale: 0,
    thrust: Number.NaN,
    reverseThrust: -3,
    turnTorque: 0,
    linearDrag: -1,
    angularDrag: Number.POSITIVE_INFINITY,
    maxSpeed: -2,
    maxAngularSpeed: 0
  })

  assert.equal(config.height, 2.5)
  assert.equal(config.scale, 1)
  assert.equal(config.thrust, 14)
  assert.equal(config.reverseThrust, 7)
  assert.equal(config.turnTorque, 5)
  assert.equal(config.linearDrag, 2.2)
  assert.equal(config.angularDrag, 4)
  assert.equal(config.maxSpeed, 8)
  assert.equal(config.maxAngularSpeed, 2.8)
})

test('resolves keyboard state to thrust and turn input', () => {
  assert.deepEqual(resolveAircraftInput({ KeyW: true }), { thrustInput: 1, turnInput: 0 })
  assert.deepEqual(resolveAircraftInput({ KeyS: true }), { thrustInput: -1, turnInput: 0 })
  assert.deepEqual(resolveAircraftInput({ KeyA: true }), { thrustInput: 0, turnInput: 1 })
  assert.deepEqual(resolveAircraftInput({ KeyD: true }), { thrustInput: 0, turnInput: -1 })
  assert.deepEqual(resolveAircraftInput({ KeyW: true, KeyS: true, KeyA: true, KeyD: true }), { thrustInput: 0, turnInput: 0 })
})

test('forward thrust accelerates along current yaw', () => {
  const config = normalizeAircraftConfig({ thrust: 10, linearDrag: 0, maxSpeed: 100 })
  const state = createAircraftState({ yaw: 0 })

  stepAircraftMotion(state, { thrustInput: 1, turnInput: 0 }, config, 0.5)

  assert.equal(state.velocity.x > 0, true)
  assert.equal(Math.abs(state.velocity.z) < 0.000001, true)
  assert.equal(state.position.x > 0, true)
})

test('reverse thrust is weaker than forward thrust', () => {
  const config = normalizeAircraftConfig({ thrust: 10, reverseThrust: 4, linearDrag: 0, maxSpeed: 100, maxDelta: 1 })
  const forward = createAircraftState()
  const reverse = createAircraftState()

  stepAircraftMotion(forward, { thrustInput: 1, turnInput: 0 }, config, 1)
  stepAircraftMotion(reverse, { thrustInput: -1, turnInput: 0 }, config, 1)

  assert.equal(forward.velocity.length(), 10)
  assert.equal(reverse.velocity.length(), 4)
  assert.equal(reverse.velocity.x < 0, true)
})

test('left and right turn inputs change angular velocity in opposite directions', () => {
  const config = normalizeAircraftConfig({ turnTorque: 3, angularDrag: 0, maxAngularSpeed: 100, maxDelta: 1 })
  const left = createAircraftState()
  const right = createAircraftState()

  stepAircraftMotion(left, { thrustInput: 0, turnInput: 1 }, config, 1)
  stepAircraftMotion(right, { thrustInput: 0, turnInput: -1 }, config, 1)

  assert.equal(left.angularVelocity, 3)
  assert.equal(right.angularVelocity, -3)
})

test('linear and angular drag reduce velocity over time', () => {
  const config = normalizeAircraftConfig({ linearDrag: 2, angularDrag: 2, maxDelta: 1 })
  const state = createAircraftState({
    velocity: [10, 0, 0],
    angularVelocity: 4
  })

  stepAircraftMotion(state, { thrustInput: 0, turnInput: 0 }, config, 0.25)

  assert.equal(state.velocity.length() < 10, true)
  assert.equal(Math.abs(state.angularVelocity) < 4, true)
})

test('speed and angular velocity are clamped', () => {
  const config = normalizeAircraftConfig({
    thrust: 100,
    turnTorque: 100,
    linearDrag: 0,
    angularDrag: 0,
    maxSpeed: 5,
    maxAngularSpeed: 2,
    maxDelta: 1
  })
  const state = createAircraftState()

  stepAircraftMotion(state, { thrustInput: 1, turnInput: 1 }, config, 1)

  assert.equal(state.velocity.length(), 5)
  assert.equal(state.angularVelocity, 2)
})

test('position is not clamped to terrain bounds', () => {
  const config = normalizeAircraftConfig({ thrust: 100, linearDrag: 0, maxSpeed: 1000, maxDelta: 1 })
  const state = createAircraftState({ position: [10000, 2.5, 10000] })

  stepAircraftMotion(state, { thrustInput: 1, turnInput: 0 }, config, 1)

  assert.equal(state.position.x > 10000, true)
  assert.equal(state.position.z, 10000)
})

test('large deltas are capped for stable tab resume behavior', () => {
  const config = normalizeAircraftConfig({ thrust: 10, linearDrag: 0, maxSpeed: 100 })
  const state = createAircraftState()

  stepAircraftMotion(state, { thrustInput: 1, turnInput: 0 }, config, 10)

  assert.equal(state.velocity.x, 0.5)
})
