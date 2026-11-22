import assert from 'node:assert/strict'
import test from 'node:test'
import { Group, Vector3 } from 'three/webgpu'
import { advanceEnemyAircraft } from '../src/world/player/aircraftEnemyMotion.js'
import { createAircraftState, normalizeAircraftConfig } from '../src/world/player/aircraftMotion.js'
import { createAircraftTrainingRange } from '../src/world/player/aircraftTrainingRange.js'

const dt = 1 / 60
const forward = new Vector3(1, 0, 0)
const flatGround = () => 0

function encounter(t, sampleSurface = flatGround) {
  const state = createAircraftState({ position: [0, 8, 0] })
  const player = { state, group: new Group(), motionConfig: normalizeAircraftConfig() }
  const range = createAircraftTrainingRange({ sampleSurface, playAudio() {} })
  t.after(() => range.dispose())
  range.reset(state)
  const [enemy, ...others] = range.targets
  const bearing = new Vector3()
  function tick(target, missile = false) {
    if (target) bearing.subVectors(target.position, state.position).normalize()
    else bearing.set(0, 1, 0)
    player.group.quaternion.setFromUnitVectors(forward, bearing)
    range.update(dt, player, { missile })
  }
  return { range, player, enemy, others, tick }
}

test('an incomplete lock and an unguided missile leave the flight undisturbed', (t) => {
  const { range, enemy, tick } = encounter(t)
  for (let i = 0; i < 20; i++) tick(enemy)
  assert.equal(range.weapons.lockTarget, enemy)
  assert.ok(range.weapons.lockProgress > 0 && !range.weapons.locked)
  assert.ok(range.targets.every(target => !target.evading))
  tick(enemy, true)
  assert.equal(range.weapons.missiles[0].target, null)
  assert.ok(range.targets.every(target => !target.evading))
  for (let i = 0; i < 8; i++) {
    tick(null)
    assert.ok(range.targets.every(target => !target.evading))
  }
})

test('only the locked aircraft evades, and a guided missile sustains evasion after lock loss', (t) => {
  // A ridge between the two aircraft intercepts the missile, leaving the evader alive.
  const { range, enemy, others, tick } = encounter(t, x => x >= 6 && x <= 9 ? 14 : 0)
  function acquire() {
    for (let i = 0; i < 90 && !range.weapons.locked; i++) tick(enemy)
    assert.equal(range.weapons.lockTarget, enemy)
    assert.ok(range.weapons.locked)
    assert.equal(enemy.evading, true)
    assert.ok(others.every(target => !target.evading))
  }
  acquire()
  tick(null)
  assert.equal(range.weapons.locked, false)
  assert.equal(enemy.evading, false)

  acquire()
  tick(enemy, true)
  const missile = range.weapons.missiles[0]
  assert.equal(missile.target, enemy)
  for (let i = 0; i < 40 && !missile.powered; i++) tick(null)
  assert.equal(range.weapons.locked, false)
  assert.ok(missile.powered && range.weapons.missiles.includes(missile))
  assert.equal(enemy.evading, true)
  assert.ok(others.every(target => !target.evading))
  for (let i = 0; i < 120 && range.weapons.missiles.length; i++) tick(null)
  assert.equal(range.weapons.missiles.length, 0)
  assert.equal(enemy.health, enemy.maxHealth)
  assert.equal(enemy.evading, false)
})

test('a missile and a new lock can threaten two different aircraft independently', (t) => {
  const { range, enemy, others: [patroller, bystander], tick } = encounter(t)
  enemy.position.set(28, 8, 0)
  patroller.position.set(0, 8, 28)
  bystander.position.set(-20, 8, 15)
  for (let i = 0; i < 90 && !range.weapons.locked; i++) tick(enemy)
  assert.equal(range.weapons.lockTarget, enemy)
  tick(enemy, true)
  const missile = range.weapons.missiles[0]
  assert.equal(missile.target, enemy)
  tick(patroller)
  assert.equal(range.weapons.locked, false)
  assert.equal(enemy.evading, true)
  assert.equal(patroller.evading, false)
  for (let i = 0; i < 90 && !range.weapons.locked; i++) tick(patroller)
  assert.ok(range.weapons.locked && range.weapons.lockTarget === patroller)
  assert.ok(range.weapons.missiles.includes(missile) && missile.target === enemy)
  assert.equal(patroller.attacking, false)
  assert.deepEqual([enemy.evading, patroller.evading, bystander.evading], [true, true, false])
  tick(null)
  assert.deepEqual([enemy.evading, patroller.evading, bystander.evading], [true, false, false])
})

test('under threat a straight pursuit banks and turns both ways, then settles back onto course', (t) => {
  const { player, enemy } = encounter(t)
  enemy.yaw = 0
  player.state.velocity.set(0, 0, 0)
  function step(threatened) {
    // Keep the desired intercept heading due east so any alternating turn comes from evasion.
    player.state.position.copy(enemy.position)
    player.state.position.x += 14
    enemy.evading = threatened
    advanceEnemyAircraft(enemy, player.state, player.motionConfig.cruiseSpeed, dt, flatGround)
  }
  let bankedLeft = false
  let bankedRight = false
  for (let i = 0; i < 8 / dt; i++) {
    step(true)
    if (enemy.yawRate < -0.1 && enemy.roll < -0.05 && enemy.velocity.z < -0.1) bankedLeft = true
    if (enemy.yawRate > 0.1 && enemy.roll > 0.05 && enemy.velocity.z > 0.1) bankedRight = true
  }
  assert.ok(bankedLeft && bankedRight)
  for (let i = 0; i < 4 / dt; i++) step(false)
  assert.ok(Math.abs(enemy.yawRate) < 0.05 && Math.abs(enemy.yaw) < 0.05)
})
