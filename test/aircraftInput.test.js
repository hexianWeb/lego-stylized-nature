import test from 'node:test'
import assert from 'node:assert/strict'
import AircraftInput from '../src/world/player/AircraftInput.js'

function createTarget() {
  const listeners = new Map()
  return {
    listeners,
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) {
        listeners.delete(type)
      }
    },
    dispatch(type, event = {}) {
      listeners.get(type)?.(event)
    }
  }
}

test('tracks WASD and arrow key state and ignores unrelated keys', () => {
  const input = new AircraftInput()

  input.handleKeyDown({ code: 'KeyW', repeat: false })
  input.handleKeyDown({ code: 'KeyA', repeat: false })
  input.handleKeyDown({ code: 'ArrowRight', repeat: false })
  input.handleKeyDown({ code: 'Space', repeat: false })

  assert.deepEqual(input.getKeys(), {
    KeyW: true,
    KeyA: true,
    KeyS: false,
    KeyD: false,
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: true,
    ShiftLeft: false,
    ShiftRight: false
  })

  input.handleKeyUp({ code: 'KeyW' })
  input.handleKeyUp({ code: 'ArrowRight' })

  assert.equal(input.getKeys().KeyW, false)
  assert.equal(input.getKeys().KeyA, true)
  assert.equal(input.getKeys().ArrowRight, false)
})

test('repeated keydown does not change tracked state', () => {
  const input = new AircraftInput()

  input.handleKeyDown({ code: 'KeyW', repeat: true })

  assert.equal(input.getKeys().KeyW, false)
})

test('opposing keyboard axes cancel and releasing one Shift key leaves the other active', () => {
  const input = new AircraftInput(null)
  for (const code of ['KeyD', 'ArrowLeft', 'KeyS', 'ArrowUp', 'ShiftLeft', 'ShiftRight'])
    input.handleKeyDown({ code })

  const opposed = input.consume()
  assert.equal(opposed.turn, 0)
  assert.equal(Math.abs(opposed.climb), 0)
  assert.equal(opposed.boost, true)

  for (const code of ['ArrowLeft', 'ArrowUp', 'ShiftLeft']) input.handleKeyUp({ code })
  const remaining = input.consume()
  assert.equal(remaining.turn, 1)
  assert.equal(remaining.climb, 1)
  assert.equal(remaining.boost, true)
  input.handleKeyUp({ code: 'ShiftRight' })
  assert.equal(input.consume().boost, false)
})

test('the cannon follows the left button and right-click or M launches one missile per press', () => {
  const target = createTarget()
  const canvas = createTarget()
  const input = new AircraftInput(target, canvas, { weaponsEnabled: true })
  input.attach()

  let prevented = false
  canvas.dispatch('contextmenu', { preventDefault: () => { prevented = true } })
  assert.equal(prevented, true)
  canvas.dispatch('mousedown', { button: 2 })
  const launch = input.consume()
  assert.equal(launch.missile, true)
  assert.equal(launch.cannon, undefined)
  assert.equal(input.consume().missile, undefined)

  canvas.dispatch('mousedown', { button: 0 })
  target.dispatch('mouseup', { button: 2 })
  const held = input.consume()
  assert.equal(held.cannon, true)
  assert.equal(held.turn, 0)
  assert.equal(Math.abs(held.climb), 0)
  assert.equal(held.boost, false)
  assert.equal(held.stunt, null)
  target.dispatch('keydown', { code: 'KeyM' })
  assert.equal(input.consume().missile, true)
  target.dispatch('keydown', { code: 'KeyM', repeat: true })
  assert.equal(input.consume().cannon, true)
  assert.equal(input.consume().missile, undefined)
  target.dispatch('mouseup', { button: 0 })
  assert.equal(input.consume().cannon, undefined)

  canvas.dispatch('mousedown', { button: 0 })
  target.dispatch('mouseup', { button: 0 })
  assert.equal(input.consume().cannon, true)
  assert.equal(input.consume().cannon, undefined)

  canvas.dispatch('mousedown', { button: 0 })
  canvas.dispatch('mousedown', { button: 2 })
  target.dispatch('blur')
  const cleared = input.consume()
  assert.equal(cleared.cannon, undefined)
  assert.equal(cleared.missile, undefined)
})

test('blur clears all key state', () => {
  const target = createTarget()
  const input = new AircraftInput(target)
  input.attach()

  input.handleKeyDown({ code: 'KeyW', repeat: false })
  input.handleKeyDown({ code: 'KeyD', repeat: false })
  input.handleKeyDown({ code: 'ArrowUp', repeat: false })
  target.dispatch('blur')

  assert.deepEqual(input.getKeys(), {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    ShiftLeft: false,
    ShiftRight: false
  })
})

test('attach and dispose register and remove window listeners', () => {
  const target = createTarget()
  const input = new AircraftInput(target)

  input.attach()

  assert.equal(target.listeners.has('keydown'), true)
  assert.equal(target.listeners.has('keyup'), true)
  assert.equal(target.listeners.has('blur'), true)

  target.dispatch('keydown', { code: 'KeyS', repeat: false })
  assert.equal(input.getKeys().KeyS, true)

  input.dispose()

  assert.equal(target.listeners.size, 0)
  assert.equal(input.getKeys().KeyS, false)
})

test('attach is safe when no target is available', () => {
  const input = new AircraftInput(null)

  input.attach()
  input.dispose()

  assert.deepEqual(input.getKeys(), {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    ShiftLeft: false,
    ShiftRight: false
  })
})

test('mouse motion and cannon fire leave the flight controls neutral', () => {
  const target = createTarget()
  const canvas = Object.assign(createTarget(), {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 480 }),
  })
  const input = new AircraftInput(target, canvas, { weaponsEnabled: true })
  input.attach()
  const left = {
    button: 0, pointerId: 3, pointerType: 'mouse',
    clientX: 510, clientY: 40, timeStamp: performance.now() - 450,
  }
  const checkNeutral = (cannon) => {
    const command = input.consume()
    assert.equal(command.turn, 0)
    assert.equal(Math.abs(command.climb), 0)
    assert.equal(command.boost, false)
    assert.equal(command.stunt, null)
    assert.equal(command.cannon, cannon)
  }

  canvas.dispatch('mousemove', left)
  canvas.dispatch('pointermove', left)
  checkNeutral()
  for (const duration of [450, 60]) {
    canvas.dispatch('pointerdown', left)
    canvas.dispatch('mousedown', left)
    checkNeutral(true)
    canvas.dispatch('pointerup', { ...left, timeStamp: left.timeStamp + duration })
    target.dispatch('mouseup', left)
    checkNeutral()
  }
  input.dispose()
})

test('view and stunt are edge actions and editable controls retain their keyboard input', () => {
  const input = new AircraftInput(null)
  input.handleKeyDown({ code: 'Space', target: { closest: () => true } })
  assert.equal(input.consume().view, false)
  input.handleKeyDown({ code: 'Space' })
  input.handleKeyDown({ code: 'KeyF' })
  const command = input.consume()
  assert.equal(command.view, true)
  assert.equal(command.stunt, 'backLoop')
  input.handleKeyDown({ code: 'KeyF', repeat: true })
  assert.equal(input.consume().stunt, null)
  for (const [code, stunt] of [['KeyR', 'roll'], ['KeyG', 'frontLoop']]) {
    input.handleKeyDown({ code })
    assert.equal(input.consume().stunt, stunt)
    assert.equal(input.consume().stunt, null)
  }
  input.handleKeyDown({ code: 'KeyS' })
  assert.equal(input.consume(true).climb, 1)
  assert.equal(input.consume(false).climb, -1)
})

test('flight input does not poll gamepads', () => {
  const target = createTarget()
  let polls = 0
  target.navigator = { getGamepads: () => { polls++; return [] } }
  const input = new AircraftInput(target)
  input.attach()
  input.consume()
  assert.equal(polls, 0)
  input.dispose()
})
