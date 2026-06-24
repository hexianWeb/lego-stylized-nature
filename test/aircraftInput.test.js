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

test('tracks WASD key state and ignores unrelated keys', () => {
  const input = new AircraftInput()

  input.handleKeyDown({ code: 'KeyW', repeat: false })
  input.handleKeyDown({ code: 'KeyA', repeat: false })
  input.handleKeyDown({ code: 'Space', repeat: false })

  assert.deepEqual(input.getKeys(), {
    KeyW: true,
    KeyA: true,
    KeyS: false,
    KeyD: false
  })

  input.handleKeyUp({ code: 'KeyW' })

  assert.equal(input.getKeys().KeyW, false)
  assert.equal(input.getKeys().KeyA, true)
})

test('repeated keydown does not change tracked state', () => {
  const input = new AircraftInput()

  input.handleKeyDown({ code: 'KeyW', repeat: true })

  assert.equal(input.getKeys().KeyW, false)
})

test('blur clears all key state', () => {
  const input = new AircraftInput()

  input.handleKeyDown({ code: 'KeyW', repeat: false })
  input.handleKeyDown({ code: 'KeyD', repeat: false })
  input.clear()

  assert.deepEqual(input.getKeys(), {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false
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
    KeyD: false
  })
})
