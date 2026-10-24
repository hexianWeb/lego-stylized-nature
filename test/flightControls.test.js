import assert from 'node:assert/strict'
import test from 'node:test'
import AircraftInput from '../src/world/player/AircraftInput.js'
import PlayerAircraft from '../src/world/player/PlayerAircraft.js'

test('touch and keyboard presses release independently and blur clears both sources', () => {
  const target = new EventTarget()
  const input = new AircraftInput(target)
  input.attach()
  input.handleKeyDown({ code: 'KeyW' })
  input.setVirtualKey('KeyW', true)
  input.handleKeyUp({ code: 'KeyW' })
  assert.equal(input.getKeys().KeyW, true)
  input.setVirtualKey('KeyW', false)
  assert.equal(input.getKeys().KeyW, false)
  input.handleKeyDown({ code: 'ArrowUp' })
  input.setVirtualKey('KeyA', true)
  target.dispatchEvent(new Event('blur'))
  assert.ok(Object.values(input.getKeys()).every(value => value === false))
  input.setVirtualKey('Space', true)
  assert.equal(input.getKeys().Space, undefined)
  input.dispose()
})

function createPlayer() {
  const experience = { renderer: {} }
  const player = new PlayerAircraft(experience, {
    inputTarget: new EventTarget(),
    config: { terrain: { width: 128, depth: 128, cellSize: 0.2 }, player: { aircraft: { enabled: false, height: 5.5 } } },
  })
  player.enabled = true
  return player
}

test('pause freezes motion, drops held input and safely reconnects on resume', () => {
  const player = createPlayer()
  player.input.attach()
  player.input.setVirtualKey('KeyW', true)
  player.state.velocity.set(4, 0, 0)
  const before = player.state.position.clone()
  player.setPaused(true)
  player.update()
  assert.ok(player.state.position.equals(before))
  assert.equal(player.input.isAttached, false)
  assert.equal(player.input.getKeys().KeyW, false)
  player.setPaused(false)
  assert.equal(player.input.isAttached, true)
  assert.equal(player.input.getKeys().KeyW, false)
  player.dispose()
})

test('returning home clears motion and trails while preserving an explicit pause', () => {
  const player = createPlayer()
  let cleared = 0
  player.wingAirflow = { clear() { cleared++ }, dispose() {} }
  player.state.position.set(-100, 5.5, 280)
  player.state.velocity.set(4, 0, 2)
  player.state.yaw = 2
  player.state.angularVelocity = 1
  player.setPaused(true)
  player.reset()
  assert.deepEqual(player.state.position.toArray(), [12.8, 5.5, 12.8])
  assert.deepEqual(player.group.position.toArray(), [12.8, 5.5, 12.8])
  assert.equal(player.state.velocity.length(), 0)
  assert.equal(player.state.yaw, 0)
  assert.equal(player.state.angularVelocity, 0)
  assert.equal(player.paused, true)
  assert.equal(cleared, 1)
  player.dispose()
})
