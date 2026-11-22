import assert from 'node:assert/strict'
import test from 'node:test'
import { Group } from 'three/webgpu'
import { createAircraftState, normalizeAircraftConfig } from '../src/world/player/aircraftMotion.js'
import { createAircraftTrainingRange } from '../src/world/player/aircraftTrainingRange.js'

const dt = 1 / 30

function encounter(t) {
  const state = createAircraftState({ position: [0, 8, 0] })
  const player = { state, group: new Group(), motionConfig: normalizeAircraftConfig() }
  const range = createAircraftTrainingRange({ sampleSurface: () => 0, playAudio() {} })
  t.after(() => range.dispose())
  range.reset(state)
  for (const target of range.targets) {
    target.course = Math.PI / 2
    target.yaw = target.course
  }
  function tick(distance = 31) {
    // Stay within join range but beyond both weapons so the long rotation
    // scenario isn't interrupted by player defeat.
    range.targets.forEach((target, i) => target.position.set(-distance, 8, (i - 1) * 0.5))
    range.update(dt, player, {})
    return range.targets.filter(target => target.health > 0 && target.attacking)
  }
  return { range, state, tick }
}

test('three nearby aircraft take turns attacking while the others keep flying their patrol', (t) => {
  const { range, tick } = encounter(t)
  const original = [...range.targets]
  const turns = new Map(original.map(target => [target, 0]))
  let previous = []
  let maxActive = 0
  let sawPatrol = false
  for (let frame = 0; frame < 75 / dt; frame++) {
    const active = tick()
    assert.ok(active.length <= 2)
    assert.equal(range.combatStatus.pursuers, active.filter(target => target.alerted && !target.extending).length)
    for (const target of active) {
      if (!previous.includes(target)) turns.set(target, turns.get(target) + 1)
    }
    for (const target of original) {
      if (target.attacking) continue
      assert.equal(target.firing, false)
      // The player is in the +X direction; a patroller on its assigned +Z course
      // flies across that line. Measure its velocity to check the patrol is moving.
      if (target.velocity.z > 1 && Math.abs(target.velocity.x) < target.velocity.z) sawPatrol = true
    }
    maxActive = Math.max(maxActive, active.length)
    previous = active
  }
  assert.equal(maxActive, 2)
  assert.ok(sawPatrol)
  for (const [target, count] of turns) assert.ok(count >= 2, `aircraft ${target.id} should return for another turn`)
})

test('patrol cannot shoot, a defeated attacker releases its slot, and reset starts a fresh rotation', (t) => {
  const { range, state, tick } = encounter(t)
  let attackers = []
  for (let frame = 0; frame < 30 / dt && attackers.length !== 2; frame++) attackers = tick()
  assert.equal(attackers.length, 2)
  for (const target of range.targets) {
    target.yaw = target.pitch = target.roll = target.yawRate = 0
  }
  const ready = tick(7)
  const fired = range.weapons.shots.filter(shot => shot.enemy)
  assert.ok(fired.length > 0, 'attackers should fire when presented with a clear shot')
  assert.ok(fired.every(shot => ready.includes(shot.attacker)))
  const downed = ready[0]
  downed.health = 0
  let survivors = tick()
  assert.equal(downed.attacking, false)
  assert.equal(downed.firing, false)
  for (let frame = 0; frame < 30 / dt && survivors.length < 2; frame++) survivors = tick()
  assert.equal(survivors.length, 2)
  assert.ok(survivors.every(target => target !== downed))

  const oldTargets = [...range.targets]
  range.reset(state)
  assert.ok(range.targets.every(target => !oldTargets.includes(target) && target.health === target.maxHealth))
  assert.equal(range.combatStatus.pursuers, 0)
  assert.equal(range.weapons.shots.length, 0)
  let fresh = []
  for (let frame = 0; frame < 30 / dt && fresh.length < 2; frame++) fresh = tick()
  assert.equal(fresh.length, 2)
})
