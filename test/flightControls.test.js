import assert from 'node:assert/strict'
import test from 'node:test'
import FlightJoystick, { resolveJoystickDrag } from '../src/ui/FlightJoystick.js'
import WorldCamera from '../src/world/camera.js'
import AircraftInput from '../src/world/player/AircraftInput.js'
import PlayerAircraft from '../src/world/player/PlayerAircraft.js'

test('joystick and keyboard release independently and blur clears both sources', () => {
  const target = new EventTarget()
  const input = new AircraftInput(target)
  input.attach()
  input.handleKeyDown({ code: 'KeyW' })
  input.setJoystick(0.3, 0.5)
  input.handleKeyUp({ code: 'KeyW' })
  assert.equal(input.getKeys().KeyW, false)
  assert.deepEqual(input.getJoystick(), { x: 0.3, y: 0.5 })
  input.handleKeyDown({ code: 'KeyA' })
  input.setJoystick(0, 0)
  assert.equal(input.getKeys().KeyA, true)
  input.setJoystick(0.7, -0.2)
  target.dispatchEvent(new Event('blur'))
  assert.ok(Object.values(input.getKeys()).every(value => value === false))
  assert.deepEqual(input.getJoystick(), { x: 0, y: 0 })
  input.setJoystick(2, Number.NaN)
  assert.deepEqual(input.getJoystick(), { x: 1, y: 0 })
  input.dispose()
})

test('joystick ignores small jitters, ramps up and clamps diagonal movement in a circle', () => {
  assert.deepEqual(resolveJoystickDrag(0, 4, 40), { offsetX: 0, offsetY: 4, x: 0, y: 0 })
  const half = resolveJoystickDrag(20, 0, 40)
  assert.ok(half.x > 0 && half.x < 0.5)
  assert.equal(resolveJoystickDrag(0, 50, 40).y, -1)
  assert.equal(resolveJoystickDrag(-50, 0, 40).x, -1)

  const diagonal = resolveJoystickDrag(400, -400, 40)
  assert.ok(Math.abs(Math.hypot(diagonal.offsetX, diagonal.offsetY) - 40) < 1e-9)
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-9)
  assert.ok(diagonal.x > 0 && diagonal.y > 0)
})

function createJoystick() {
  const element = new EventTarget()
  const classes = new Set()
  const styles = new Map()
  let captured = null
  let axes = [0, 0]
  Object.assign(element, {
    hidden: true,
    getBoundingClientRect: () => ({ width: 120, height: 120 }),
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    style: { setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) },
    setPointerCapture: id => { captured = id },
    hasPointerCapture: id => captured === id,
    releasePointerCapture: () => { captured = null },
  })
  const joystick = new FlightJoystick(element, (x, y) => { axes = [x, y] })
  const send = (type, pointerId, clientX = 0, clientY = 0) => {
    const event = new Event(type, { cancelable: true })
    element.dispatchEvent(Object.assign(event, { pointerId, clientX, clientY, button: 0 }))
    return event
  }
  return { joystick, element, send, classes, styles, axes: () => axes }
}

test('a single finger owns the stick and release, cancellation or hiding always clears it', () => {
  const { joystick, element, send, classes, styles, axes } = createJoystick()
  assert.equal(send('pointerdown', 1).defaultPrevented, false)
  joystick.setEnabled(true)
  for (const end of ['pointerup', 'pointercancel', 'lostpointercapture', 'hide']) {
    assert.equal(send('pointerdown', 1, 20, 40).defaultPrevented, true)
    assert.deepEqual(axes(), [0, 0]) // an off-center grab starts neutral
    assert.ok(element.hasPointerCapture(1))
    send('pointerdown', 2)
    send('pointermove', 2, -100, 100)
    send('pointerup', 2)
    assert.deepEqual(axes(), [0, 0])
    assert.ok(element.hasPointerCapture(1))
    send('pointermove', 1, 20, -30)
    assert.deepEqual(axes(), [0, 1])
    assert.ok(styles.has('--stick-y'))
    if (end === 'hide') joystick.setEnabled(false)
    else send(end, 1)
    send('pointermove', 1, 20, -30)
    assert.deepEqual(axes(), [0, 0])
    assert.equal(element.hasPointerCapture(1), false)
    assert.equal(classes.has('is-dragging'), false)
    assert.equal(styles.size, 0)
  }
  assert.equal(element.hidden, true)
})

function createPlayer(sizes = { width: 390, height: 844 }) {
  const experience = {
    renderer: {},
    time: { getDelta: () => 0.05, getElapsed: () => 1 },
    worldCamera: new WorldCamera(sizes),
  }
  const player = new PlayerAircraft(experience, {
    inputTarget: new EventTarget(),
    config: { terrain: { width: 128, depth: 128, cellSize: 0.2 }, player: { aircraft: { enabled: false, height: 5.5 } } },
  })
  player.enabled = true
  experience.worldCamera.resetView(player.state.position)
  return player
}

test('joystick acquires all eight screen directions even with a different nose direction or camera lag', () => {
  const directions = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
  for (const sizes of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const player = createPlayer(sizes)
    const rig = player.experience.worldCamera
    const camera = rig.instance
    player.cameraFollow.enabled = true
    for (const [x, y] of directions) {
      player.reset()
      rig.resetView(player.state.position)
      player.state.position.x -= 0.8
      player.state.position.z += 1.1
      player.state.yaw = 1.9
      player.state.velocity.set(-2, 0, 3)
      player.input.setJoystick(x, y)
      for (let i = 0; i < 100; i++) player.update()
      const before = player.state.position.clone()
      player.update()
      camera.updateMatrixWorld()
      before.project(camera)
      const after = player.state.position.clone().project(camera)
      // Correct the NDC aspect before comparing slopes in screen pixels.
      const dx = (after.x - before.x) * camera.aspect
      const dy = after.y - before.y
      const agreement = (dx * x + dy * y) / (Math.hypot(dx, dy) * Math.hypot(x, y))
      assert.ok(agreement > 1 - 1e-9, `wrong screen direction for (${x}, ${y}) at width ${sizes.width}`)
      assert.equal(player.state.position.y, player.motionConfig.height)
    }
    player.dispose()
  }
})

test('reversing the stick flies a U-turn with forward momentum, and release coasts to a stop', () => {
  const player = createPlayer()
  player.input.setJoystick(0.25, 0)
  for (let i = 0; i < 60; i++) player.update()
  const slowSpeed = player.state.velocity.length()
  const right = player.state.velocity.clone().normalize()
  assert.ok(Math.abs(slowSpeed / player.motionConfig.maxSpeed - 0.25) < 0.01)

  player.input.setJoystick(-1, 0)
  player.update()
  assert.ok(player.state.velocity.clone().normalize().dot(right) > 0.99)
  const start = player.state.position.clone()
  let widestOffset = 0
  for (let i = 0; i < 100; i++) {
    player.update()
    assert.ok(player.state.velocity.length() > slowSpeed * 0.98, 'a U-turn must not brake through zero')
    const { x, z } = player.state.position
    widestOffset = Math.max(widestOffset, Math.abs((x - start.x) * right.z - (z - start.z) * right.x))
  }
  const left = player.state.velocity.clone().normalize()
  assert.ok(left.dot(right) < -0.99)
  assert.ok(widestOffset > 1)
  assert.ok(player.state.velocity.length() > slowSpeed * 3)

  player.input.setJoystick(0, 0)
  const speed = player.state.velocity.length()
  player.update()
  assert.ok(player.state.velocity.length() < speed)
  for (let i = 0; i < 30; i++) player.update()
  assert.equal(player.state.velocity.length(), 0)
  const { yaw } = player.state
  assert.ok(Math.cos(yaw) * left.x + Math.sin(yaw) * left.z > 0.999)
  player.dispose()
})

test('keyboard controls resume when an active joystick is centered', () => {
  const player = createPlayer()
  player.input.setJoystick(0, 1)
  player.input.handleKeyDown({ code: 'KeyD' })
  player.update()
  assert.ok(player.state.angularVelocity < 0)

  player.input.setJoystick(0, 0)
  const yaw = player.state.yaw
  for (let i = 0; i < 10; i++) player.update()
  assert.ok(player.state.yaw > yaw)
  assert.ok(player.state.angularVelocity > 0)
  player.dispose()
})

test('pause freezes motion, drops held input and safely reconnects on resume', () => {
  const player = createPlayer()
  player.input.attach()
  player.input.handleKeyDown({ code: 'KeyW' })
  player.input.setJoystick(0.4, 0.6)
  player.state.velocity.set(4, 0, 0)
  const before = player.state.position.clone()
  player.setPaused(true)
  player.update()
  assert.ok(player.state.position.equals(before))
  assert.equal(player.input.isAttached, false)
  assert.equal(player.input.getKeys().KeyW, false)
  assert.deepEqual(player.input.getJoystick(), { x: 0, y: 0 })
  player.setPaused(false)
  assert.equal(player.input.isAttached, true)
  assert.equal(player.input.getKeys().KeyW, false)
  assert.deepEqual(player.input.getJoystick(), { x: 0, y: 0 })
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
