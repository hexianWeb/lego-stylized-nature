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

test('the cruise → boost → climb → release route is repeatable at 30 and 120 Hz', () => {
  const route = (fps) => {
    const s = createAircraftState()
    fly(s, {}, 1, fps)
    assert.ok(Math.abs(s.position.x - config.cruiseSpeed) < 1e-6)
    fly(s, { boost: true }, 2, fps)
    assert.ok(s.speed > config.maxSpeed * 0.97)
    fly(s, { climb: 0.8, turn: 0.6 }, 1, fps)
    assert.ok(s.pitch > 0 && s.bank > 0 && s.position.y > config.height + 1)
    fly(s, {}, 2, fps)
    assert.ok(Math.abs(s.speed - config.cruiseSpeed) < 0.03)
    assert.ok(Math.abs(s.pitch) < 0.001 && Math.abs(s.bank) < 0.001)
    return s
  }
  assert.ok(route(30).position.distanceTo(route(120).position) < 0.01)
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

for (const [kind, sign] of [['backLoop', 1], ['frontLoop', -1]]) {
  test(`${kind} flies a vertical circle and rejoins the incoming course`, () => {
    const s = createAircraftState()
    fly(s, { stunt: kind }, config.loopSeconds / 2, 120)
    assert.ok((s.position.y - config.height) * sign > 2)
    assert.ok(s.velocity.x < 0)
    fly(s, {}, config.loopSeconds / 2, 120)
    assert.equal(s.stunt, null)
    assert.ok(Math.hypot(s.position.x, s.position.y - config.height) < 1e-6)
    assert.ok(Math.abs(s.pitch) < 0.001 && s.velocity.x > 0)
  })
}

test('holding boost and full stick triggers one loop until the stick is released', () => {
  const s = createAircraftState()
  const input = { boost: true, climb: 1 }
  fly(s, input, 0.5)
  assert.equal(s.stunt?.kind, 'backLoop')
  fly(s, input, 2)
  assert.equal(s.stunt, null)
  assert.equal(s.gestureUsed, true)
  fly(s, {}, 0.2)
  assert.equal(s.gestureUsed, false)
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
  fly(s, { climb: 1 }, 10)
  assert.ok(s.position.y <= config.ceiling)
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
