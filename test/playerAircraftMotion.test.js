import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createAircraftState,
  normalizeAircraftConfig,
  resolveAircraftInput,
  resolveAircraftFeedback,
  stepAircraftMotion
} from '../src/world/player/aircraftMotion.js'

function flyFor(state, input, config, seconds, fps = 60) {
  for (let i = 0; i < Math.round(seconds * fps); i++)
    stepAircraftMotion(state, input, config, 1 / fps)
}

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
  for (const key of ['KeyW', 'ArrowUp'])
    assert.deepEqual(resolveAircraftInput({ [key]: true }), { thrustInput: 1, turnInput: 0 })
  for (const key of ['KeyS', 'ArrowDown'])
    assert.deepEqual(resolveAircraftInput({ [key]: true }), { thrustInput: -1, turnInput: 0 })
  for (const key of ['KeyA', 'ArrowLeft'])
    assert.deepEqual(resolveAircraftInput({ [key]: true }), { thrustInput: 0, turnInput: -1 })
  for (const key of ['KeyD', 'ArrowRight'])
    assert.deepEqual(resolveAircraftInput({ [key]: true }), { thrustInput: 0, turnInput: 1 })
  assert.deepEqual(resolveAircraftInput({ KeyW: true, KeyS: true, KeyA: true, KeyD: true }), { thrustInput: 0, turnInput: 0 })
})

test('directional flight takes the shortest angle across the yaw seam', () => {
  const config = normalizeAircraftConfig()
  const yaw = Math.PI - 0.1
  const targetYaw = -Math.PI + 0.1
  const state = createAircraftState({ yaw, velocity: [4 * Math.cos(yaw), 0, 4 * Math.sin(yaw)] })
  const input = { targetYaw, thrustInput: 0.5 }
  stepAircraftMotion(state, input, config, 0.05)
  assert.ok(state.yaw > yaw && state.yaw < Math.PI)
  assert.ok(state.velocity.z > 0)
  flyFor(state, input, config, 2)
  assert.ok(Math.abs(state.yaw - (targetYaw + 2 * Math.PI)) < 0.01)
  assert.ok(state.velocity.x < 0 && state.velocity.z < 0)
})

test('a right-angle command banks into a curve before settling on the new course', () => {
  const config = normalizeAircraftConfig()
  const state = createAircraftState({ velocity: [config.maxSpeed, 0, 0] })
  const right = { targetYaw: Math.PI / 2, thrustInput: 1 }
  flyFor(state, right, config, 0.5)
  const course = Math.atan2(state.velocity.z, state.velocity.x)
  assert.ok(course > 0.1 && course < Math.PI / 4)
  assert.ok(state.yaw > course && state.yaw < right.targetYaw)
  assert.ok(state.position.x > state.position.z && state.position.z > 0)
  assert.ok(resolveAircraftFeedback(state, right).turnInput > 0.5)

  flyFor(state, right, config, 2.5)
  assert.ok(state.velocity.z > config.maxSpeed * 0.99 && Math.abs(state.velocity.x) < 0.1)
  assert.ok(Math.abs(resolveAircraftFeedback(state, right).turnInput) < 0.05)
})

test('higher airspeed widens the arc and the same turn is consistent at 30 and 120 Hz', () => {
  const config = normalizeAircraftConfig()
  const turn = (speed, fps) => {
    const state = createAircraftState({ velocity: [speed, 0, 0] })
    flyFor(state, { targetYaw: Math.PI / 2, thrustInput: speed / config.maxSpeed }, config, 1, fps)
    return state
  }
  const slow = turn(2, 30)
  const fast = turn(8, 30)
  const highRefresh = turn(8, 120)
  const course = state => Math.atan2(state.velocity.z, state.velocity.x)
  assert.ok(course(slow) - course(fast) > 0.15)
  assert.ok(Math.abs(course(fast) - course(highRefresh)) < 0.03)
  assert.ok(fast.position.distanceTo(highRefresh.position) < 0.2)
})

test('release mid-turn rolls out and coasts without completing the abandoned turn', () => {
  const config = normalizeAircraftConfig()
  const state = createAircraftState({ velocity: [config.maxSpeed, 0, 0] })
  const turn = { targetYaw: Math.PI / 2, thrustInput: 1 }
  flyFor(state, turn, config, 0.4)
  const rate = state.angularVelocity
  const yaw = state.yaw
  const neutral = { ...turn, thrustInput: 0 }
  stepAircraftMotion(state, neutral, config, 0.05)
  assert.ok(state.angularVelocity > 0 && state.angularVelocity < rate)
  flyFor(state, neutral, config, 2)
  assert.equal(state.velocity.length(), 0)
  assert.equal(state.angularVelocity, 0)
  assert.ok(state.yaw > yaw && state.yaw < Math.PI / 4)
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

test('A steers the aircraft left and D steers it right', () => {
  const config = normalizeAircraftConfig({
    turnTorque: 3,
    turnIdleBoost: 1,
    angularDrag: 0,
    maxAngularSpeed: 100,
    maxDelta: 1
  })
  const left = createAircraftState()
  const right = createAircraftState()

  stepAircraftMotion(left, resolveAircraftInput({ KeyA: true }), config, 0.2)
  stepAircraftMotion(right, resolveAircraftInput({ KeyD: true }), config, 0.2)
  const forward = resolveAircraftInput({ KeyW: true })
  stepAircraftMotion(left, forward, config, 0.2)
  stepAircraftMotion(right, forward, config, 0.2)

  // From the starting heading (+X), aircraft-left is -Z and right is +Z.
  assert.ok(left.velocity.z < 0)
  assert.ok(right.velocity.z > 0)
})

test('partial thrust blends turn boost without changing the full-thrust endpoints', () => {
  const config = normalizeAircraftConfig({ turnTorque: 1, angularDrag: 0, maxDelta: 1 })
  const turnRate = thrustInput => stepAircraftMotion(createAircraftState(), { turnInput: 1, thrustInput }, config, 1).angularVelocity
  assert.deepEqual([-1, -0.5, 0, 0.5, 1].map(turnRate), [1, 1.25, 1.5, 1.75, 2])
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
    turnThrustBoost: 1,
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
