import assert from 'node:assert/strict'
import test from 'node:test'
import { Group, Vector3 } from 'three/webgpu'
import { FLIGHT_POSE_ORDER } from '../src/world/camera.js'
import { createAircraftIncomingMissile, MISSILE_ROLL_WINDOW } from '../src/world/player/aircraftIncomingMissile.js'
import { createAircraftState, normalizeAircraftConfig, stepAircraftMotion } from '../src/world/player/aircraftMotion.js'
import { createAircraftTrainingRange } from '../src/world/player/aircraftTrainingRange.js'

const flatGround = () => 0
const config = normalizeAircraftConfig()

function createRangeFlight(t, hz) {
  const cues = []
  const range = createAircraftTrainingRange({ sampleSurface: flatGround, playAudio: cue => cues.push(cue) })
  t.after(() => range.dispose())
  const state = createAircraftState({ position: [0, 8, 0] })
  const player = { state, group: new Group(), motionConfig: config }
  range.reset(state)
  function tick(input = {}) {
    const realDelta = 1 / hz
    const dt = range.beginFrame(realDelta)
    const controls = { boost: true, ...input }
    stepAircraftMotion(state, controls, config, dt, flatGround)
    player.group.position.copy(state.position)
    player.group.rotation.set(state.roll, -state.yaw, state.pitch, FLIGHT_POSE_ORDER)
    range.update(dt, player, controls, realDelta)
  }
  return { range, cues, tick }
}

test('only an aligned attacker at missile range can consume the shared launch, including across the cooldown', () => {
  const inbound = createAircraftIncomingMissile()
  const player = createAircraftState({ position: [0, 8, 0] })
  const jet = (x, props = {}) => ({
    position: new Vector3(x, 8, 0), yaw: 0, pitch: 0, radius: 0.8,
    health: 5, attacking: true, alerted: true, extending: false, ...props,
  })
  const invalid = [jet(-20, { health: 0 }), jet(-20, { attacking: false }), jet(-20, { alerted: false }),
    jet(-20, { extending: true }), jet(-20, { yaw: 0.9 }), jet(-5), jet(-40)]
  const dt = 1 / 30
  const tick = targets => inbound.update(dt, player, targets, config.cruiseSpeed, flatGround)
  for (let frame = 0; frame < 20 / dt; frame++) assert.equal(tick(invalid).length, 0)

  const attackers = [jet(-20), jet(-22)]
  const first = tick(attackers)
  assert.equal(first.length, 1)
  assert.equal(first[0].type, 'enemyMissile')
  const original = inbound.missile
  assert.ok(attackers.includes(original.attacker))
  assert.ok(inbound.warning.timeToImpact > MISSILE_ROLL_WINDOW * 2)
  assert.ok(Math.abs(Math.abs(inbound.warning.bearing) - Math.PI) < 1e-6)
  let hit = false
  let secondLaunch = null
  for (let frame = 1; frame <= 22 / dt; frame++) {
    const events = tick(attackers)
    if (events.some(event => event.type === 'enemyMissileHit')) hit = true
    if (events.some(event => event.type === 'enemyMissile')) {
      assert.ok(hit && frame * dt >= 11 - dt)
      secondLaunch = inbound.missile
      break
    }
    if (!hit) assert.equal(inbound.missile, original)
    else assert.equal(inbound.warning, null)
  }
  assert.ok(secondLaunch && secondLaunch !== original)
  inbound.reset()
  assert.equal(inbound.missile, null)
  assert.equal(inbound.warning, null)
  assert.equal(tick(attackers).length, 0)
})

test('terrain intercepts an incoming missile and clears its warning', () => {
  const inbound = createAircraftIncomingMissile()
  const player = createAircraftState({ position: [0, 8, 0] })
  const enemy = { position: new Vector3(-20, 8, 0), yaw: 0, health: 5, alerted: true, attacking: true }
  const events = []
  for (let i = 0; i < 120; i++) {
    events.push(...inbound.update(0.1, player, [enemy], config.cruiseSpeed, x => x > -12 && x < -11 ? 15 : 0))
    if (events.some(e => e.type === 'enemyMissileExpired')) break
  }
  assert.deepEqual(events.map(e => e.type), ['enemyMissile', 'enemyMissileExpired'])
  assert.equal(inbound.warning, null)
})

for (const hz of [30, 60, 120]) {
  test(`a roll prompted by the HUD evades the same incoming missile that hits straight or early flight at ${hz} Hz`, (t) => {
    function fly(rollAt) {
      const { range, cues, tick } = createRangeFlight(t, hz)
      let rolled = false
      let launchETA
      for (let i = 0; i < 30 * hz; i++) {
        const warning = range.combatStatus.incomingMissile
        const roll = !rolled && warning && warning.timeToImpact <= rollAt
        if (roll) rolled = true
        const hullBefore = range.combatStatus.hull
        tick({ stunt: roll ? 'roll' : null })
        if (range.combatStatus.incomingMissile) launchETA ??= range.combatStatus.incomingMissile.timeToImpact
        if (launchETA !== undefined && !range.combatStatus.incomingMissile) {
          assert.equal(cues.filter(cue => cue === 'incomingMissile').length, 1)
          return { launchETA, rolled, text: range.feedback.text, hull: range.combatStatus.hull, hullBefore }
        }
      }
      assert.fail('expected a live missile encounter in the default formation')
    }
    const straight = fly(-1)
    const early = fly(1.1)
    const onCue = fly(MISSILE_ROLL_WINDOW)
    assert.equal(straight.launchETA, early.launchETA)
    assert.equal(straight.launchETA, onCue.launchETA)
    assert.equal(early.rolled && onCue.rolled, true)
    for (const result of [straight, early]) {
      assert.equal(result.text, '导弹击中机体')
      assert.equal(result.hull, Math.max(0, result.hullBefore - 4))
    }
    assert.equal(onCue.text, '已甩脱来弹')
    assert.equal(onCue.hull, onCue.hullBefore)
  })
}

function evadeFirstMissile(t) {
  const { range, tick } = createRangeFlight(t, 60)
  const status = range.combatStatus
  let attacker
  let rolled = false
  for (let i = 0; i < 60 * 30 && !status.counterReady; i++) {
    const roll = !rolled && status.incomingMissile?.timeToImpact <= MISSILE_ROLL_WINDOW
    tick({ stunt: roll ? 'roll' : null })
    if (roll) rolled = true
    if (!attacker && status.incomingMissile) {
      const launch = range.group.getObjectByName('IncomingMissile').position
      const atLaunch = range.targets.filter(jet => jet.position.distanceTo(launch) < jet.radius + 0.2)
      assert.equal(atLaunch.length, 1, 'only the launching jet is at the incoming missile origin')
      attacker = atLaunch[0]
    }
  }
  assert.ok(rolled && status.counterReady && status.slowMotion)
  assert.equal(status.counterTarget, attacker)
  return { range, tick, status, attacker }
}

for (const afterSlowMotion of [false, true]) {
  const timing = afterSlowMotion ? 'during the grace period' : 'during slow motion'
  test(`a single missile press ${timing} sends exactly three counter missiles to the attacker`, (t) => {
    const { range, tick, status, attacker } = evadeFirstMissile(t)
    if (afterSlowMotion) {
      for (let frame = 0; frame < 180 && status.slowMotion; frame++) tick()
      assert.equal(status.slowMotion, false)
      for (let frame = 0; frame < 6; frame++) tick()
      assert.equal(status.counterReady, true)
    }
    assert.equal(range.weapons.missiles.length, 0)
    const ammo = range.weapons.missilesLeft
    tick({ missile: true })
    assert.equal(range.weapons.missiles.length, 1)
    assert.equal(status.counterReady, false)
    const seen = new Set(range.weapons.missiles)
    for (let frame = 0; frame < 30; frame++) {
      tick()
      for (const missile of range.weapons.missiles) seen.add(missile)
    }
    assert.equal(seen.size, 3)
    for (const missile of seen) {
      assert.equal(missile.counter, true)
      assert.equal(missile.target, attacker)
    }
    assert.equal(range.weapons.missilesLeft, ammo)
  })
}

test('an unused counter expires and the next missile press spends one regular missile', (t) => {
  const { range, tick, status } = evadeFirstMissile(t)
  const ammo = range.weapons.missilesLeft
  for (let frame = 0; frame < 180 && status.counterReady; frame++) tick()
  assert.equal(status.counterReady, false)
  assert.equal(status.slowMotion, false)
  assert.equal(range.weapons.missiles.length, 0)
  tick({ missile: true })
  assert.equal(range.weapons.missiles.length, 1)
  assert.equal(range.weapons.missiles[0].counter, false)
  assert.equal(range.weapons.missilesLeft, ammo - 1)
  for (let frame = 0; frame < 30; frame++) {
    tick()
    assert.ok(range.weapons.missiles.every(missile => !missile.counter))
  }
})
