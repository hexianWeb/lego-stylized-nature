import assert from 'node:assert/strict'
import test from 'node:test'
import { createAircraftState, normalizeAircraftConfig, stepAircraftMotion } from '../src/world/player/aircraftMotion.js'

const config = normalizeAircraftConfig()
const flat = () => 0
function fly(state, input, seconds, fps = 60, surface = flat) {
  for (let frame = 0; frame < Math.round(seconds * fps); frame++)
    stepAircraftMotion(state, frame ? { ...input, stunt: null } : input, config, 1 / fps, surface)
  return state
}

test('the cruise → boost → climb → release route agrees at 30, 60 and 120 Hz', () => {
  const route = (fps) => {
    const s = createAircraftState()
    fly(s, {}, 1, fps)
    assert.ok(Math.abs(s.position.x - config.cruiseSpeed) < 1e-6)
    fly(s, { boost: true }, 2, fps)
    assert.ok(s.speed > config.maxSpeed * 0.97)
    fly(s, { climb: 0.8, turn: 0.6 }, 1, fps)
    assert.ok(s.pitch > 0 && s.bank > 0 && s.position.y > config.height + 1)
    fly(s, {}, 4, fps)
    assert.ok(Math.abs(s.speed - config.cruiseSpeed) < 0.03)
    assert.ok(Math.abs(s.pitch) < 0.001 && Math.abs(s.bank) < 0.001)
    return s
  }
  const reference = route(120)
  assert.ok(route(30).position.distanceTo(reference.position) < 0.01)
  assert.ok(route(60).position.distanceTo(reference.position) < 0.01)
})

test('analog thrust reaches partial speed and ramps down more slowly than it ramps up', () => {
  const half = createAircraftState()
  const full = createAircraftState()
  fly(half, { throttle: 0.5 }, 2)
  fly(full, { boost: true }, 2)
  assert.ok(Math.abs(half.boost - 0.5) < 0.01)
  assert.ok(Math.abs(full.boost - 1) < 0.01)
  assert.ok(half.speed > config.cruiseSpeed && half.speed < full.speed)

  const fresh = fly(createAircraftState(), { throttle: 0.5 }, 0.2)
  const before = half.boost
  fly(half, {}, 0.2)
  assert.ok(before - half.boost < fresh.boost)
})

test('opposite turns mirror their tracks and banking does not cost cruise speed', () => {
  const left = fly(createAircraftState(), { turn: -1 }, 1)
  const right = fly(createAircraftState(), { turn: 1 }, 1)
  assert.ok(left.position.z < -1 && right.position.z > 1)
  assert.ok(Math.abs(right.position.z + left.position.z) < 1e-8)
  assert.ok(Math.abs(left.velocity.length() - config.cruiseSpeed) < 1e-8)
})

test('roll goes inverted once without changing course or altitude', () => {
  const s = createAircraftState()
  fly(s, { stunt: 'roll' }, config.rollSeconds / 2, 120)
  assert.ok(Math.abs(s.roll - Math.PI) < 0.05)
  fly(s, {}, 1)
  assert.equal(s.stunt, null)
  assert.equal(s.yaw, 0)
  assert.equal(s.roll, 0)
  assert.equal(s.position.y, config.height)
})

test('a roll follows the existing turn and keeps steering and thrust active', () => {
  const rolling = fly(createAircraftState(), { turn: -0.5 }, 0.4, 120)
  const control = fly(createAircraftState(), { turn: -0.5 }, 0.4, 120)
  const steer = { turn: 0.7, climb: 0.35, boost: true }
  fly(rolling, { ...steer, stunt: 'roll' }, config.rollSeconds / 2, 120)
  fly(control, steer, config.rollSeconds / 2, 120)

  assert.ok(Math.abs(rolling.roll - rolling.bank + Math.PI) < 0.06)
  assert.ok(rolling.position.distanceTo(control.position) < 1e-8)
  assert.ok(rolling.velocity.distanceTo(control.velocity) < 1e-8)
})

for (const [kind, sign] of [['backLoop', 1], ['frontLoop', -1]]) {
  test(`${kind} eases into its rotation and rejoins the incoming course further ahead`, () => {
    const s = createAircraftState()
    fly(s, { stunt: kind }, config.loopSeconds / 4, 120)
    assert.ok(Math.abs(s.pathPitch - sign * (Math.PI / 2 - 1)) < 0.04)
    fly(s, {}, config.loopSeconds / 4, 120)
    assert.ok((s.position.y - config.height) * sign > 3)
    assert.ok(s.velocity.x < 0)
    fly(s, {}, config.loopSeconds / 2, 120)
    assert.equal(s.stunt, null)
    assert.ok(s.position.x > 6 && s.position.x < 8)
    assert.ok(Math.abs(s.position.y - config.height) < 0.05)
    assert.ok(Math.abs(s.pathPitch) < 0.02 && s.velocity.x > 0)
  })
}

test('boosted full-stick loops return early when released before vertical and finish when released beyond it', () => {
  const open = normalizeAircraftConfig({ height: 30, ceiling: 80 })
  const dt = 1 / 120
  for (const [kind, sign] of [['backLoop', 1], ['frontLoop', -1]]) {
    const reachPitch = (target) => {
      const s = createAircraftState({ position: [0, open.height, 0] })
      for (let step = 0; step < 240 && s.pathPitch * sign < target; step++)
        stepAircraftMotion(s, { boost: true, climb: sign }, open, dt, flat)
      assert.ok(s.pathPitch * sign >= target)
      assert.equal(s.stunt?.kind, kind)
      assert.equal(s.stunt?.manual, true)
      return s
    }

    const early = reachPitch(Math.PI / 2 - 0.08)
    for (let step = 0; step < 480; step++) {
      stepAircraftMotion(early, {}, open, dt, flat)
      assert.ok(early.velocity.x >= 0)
    }
    assert.equal(early.stunt, null)
    assert.ok(Math.abs(early.pathPitch) < 0.02)

    const late = reachPitch(Math.PI / 2 + 0.12)
    let pastInverted = false
    for (let step = 0; step < 480; step++) {
      stepAircraftMotion(late, {}, open, dt, flat)
      if (late.velocity.x < 0 && late.velocity.y * sign < -1) pastInverted = true
    }
    assert.ok(pastInverted)
    assert.equal(late.stunt, null)
    assert.ok(Math.abs(late.pathPitch) < 0.02)
  }
})

test('look-ahead raises the aircraft before a side ridge even through a missing surface sample', () => {
  const base = 1
  const ridge = 2.4
  const surface = (x, z) => {
    if (x < 0.75) return base
    if (x < 1.8) return null
    return Math.abs(z) > 0.001 ? ridge : base
  }
  const start = base + config.clearance
  const s = createAircraftState({ position: [0, start, 0] })
  fly(s, {}, 0.25, 120, surface)
  assert.ok(s.position.x > 0.75 && s.position.x < 1.8)
  assert.equal(s.surfaceKnown, false)
  assert.equal(s.groundHeight, base)
  assert.ok(s.position.y > start + 0.05)
  assert.ok(s.position.y < ridge + config.clearance)
})

test('rising ground, streaming gaps and the ceiling protect flight during a dive or loop', () => {
  const s = createAircraftState({ position: [0, 2, 0] })
  fly(s, { stunt: 'frontLoop' }, 0.1, 60, () => 1)
  assert.equal(s.stunt, null)
  assert.equal(s.blocked, 'ground')
  fly(s, { climb: -1 }, 2, 30, x => x < 3 ? 2.4 : null)
  assert.equal(s.surfaceKnown, false)
  assert.equal(s.groundHeight, 2.4)
  assert.ok(s.position.y >= 2.4 + config.clearance)
  fly(s, { climb: 1 }, 2 * config.ceiling / config.cruiseSpeed)
  assert.ok(s.position.y > config.ceiling - 0.01 && s.position.y <= config.ceiling)
  fly(s, { stunt: 'backLoop' }, 0.05)
  assert.equal(s.blocked, 'ceiling')
})

test('a suspended frame cannot teleport the player or advance a stunt by wall time', () => {
  const s = createAircraftState()
  stepAircraftMotion(s, { stunt: 'roll' }, config, 32, flat)
  assert.ok(s.position.x < 1 && s.stunt?.elapsed <= 0.151)
  const before = s.position.clone()
  stepAircraftMotion(s, {}, config, 0, flat)
  assert.ok(s.position.equals(before))
})
