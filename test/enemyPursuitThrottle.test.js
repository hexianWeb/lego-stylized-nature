import assert from 'node:assert/strict'
import test from 'node:test'
import { advanceEnemyAircraft } from '../src/world/player/aircraftEnemyMotion.js'
import { createAircraftState, normalizeAircraftConfig } from '../src/world/player/aircraftMotion.js'
import { createAircraftTrainingRange } from '../src/world/player/aircraftTrainingRange.js'

test('pursuit gains on a distant jet, eases off close behind and responds to its actual airspeed', (t) => {
  const flatGround = () => 0
  const { cruiseSpeed, maxSpeed } = normalizeAircraftConfig()
  const player = createAircraftState({ position: [0, 8, 0], yaw: Math.PI / 2 })
  const range = createAircraftTrainingRange({ sampleSurface: flatGround, playAudio() {} })
  t.after(() => range.dispose())
  range.reset(player)
  const [enemy] = range.targets

  // Hold the same relative bearing and separation long enough for each throttle change to settle.
  function settlingSpeed(separation, airspeed, climb = 0) {
    player.velocity.set(0, climb, airspeed)
    for (let frame = 0; frame < 180; frame++) {
      player.position.copy(enemy.position)
      player.position.z += separation
      advanceEnemyAircraft(enemy, player, cruiseSpeed, 1 / 60, flatGround)
    }
    return Math.hypot(enemy.velocity.x, enemy.velocity.z)
  }
  for (const airspeed of [cruiseSpeed, maxSpeed]) {
    const far = settlingSpeed(16.5, airspeed)
    const middle = settlingSpeed(9, airspeed)
    const near = settlingSpeed(3.6, airspeed)
    assert.ok(far > 1.75 * airspeed && far < 2 * airspeed)
    assert.ok(middle > 1.05 * airspeed && middle < 1.2 * airspeed)
    assert.ok(near > 0.85 * airspeed && near < airspeed)
  }
  const nearAtCruise = settlingSpeed(3.6, cruiseSpeed)
  assert.ok(nearAtCruise < cruiseSpeed, 'the pursuer eases off again after boost ends')
  const verticalPass = settlingSpeed(3.6, 0, maxSpeed)
  assert.ok(verticalPass > 0 && verticalPass < nearAtCruise, 'a vertical climb does not call for a horizontal sprint')
})
