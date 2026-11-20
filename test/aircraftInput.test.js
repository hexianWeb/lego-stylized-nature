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

test('short clicks roll once, a long press boosts without rolling, cancellation clears both', () => {
  const input = new AircraftInput(null, { setPointerCapture() {}, hasPointerCapture: () => false })
  const press = { button: 0, pointerId: 3, clientX: 10, clientY: 20, pointerType: 'mouse', timeStamp: 100 }
  input.pointerDown(press)
  input.pointerUp({ ...press, timeStamp: 160 })
  assert.equal(input.consume().stunt, 'roll')
  assert.equal(input.consume().stunt, null)
  input.pointerDown(press)
  assert.equal(input.consume(true, 250).boost, false)
  assert.equal(input.consume(true, 450).boost, true)
  input.pointerUp({ ...press, timeStamp: 510 })
  assert.equal(input.consume().stunt, null)
  input.pointerDown(press)
  input.cancelPointer()
  assert.equal(input.consume(true, 600).boost, false)
  assert.equal(input.consume().stunt, null)
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
  input.handleKeyDown({ code: 'KeyS' })
  assert.equal(input.consume(true).climb, 1)
  assert.equal(input.consume(false).climb, -1)
})
