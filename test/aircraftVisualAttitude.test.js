import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeFlightTurbulence,
  computeHoverOffset,
  normalizeVisualAttitudeConfig,
  stepVisualAttitude
} from '../src/world/player/aircraftVisualAttitude.js'
import { createAircraftState, normalizeAircraftConfig } from '../src/world/player/aircraftMotion.js'

test('flight turbulence is absent at low speed and present at cruise speed', () => {
  const config = normalizeVisualAttitudeConfig()

  const idle = computeFlightTurbulence(0, 0, config.turbulence, 0.016)
  assert.equal(idle.pitch, 0)
  assert.equal(idle.roll, 0)
  assert.equal(idle.yaw, 0)
  assert.equal(idle.vertical, 0)

  const cruise = computeFlightTurbulence(0.5, 0, config.turbulence, 0.016)
  assert.ok(Math.abs(cruise.pitch) > 0 || Math.abs(cruise.roll) > 0)
  assert.ok(Math.abs(cruise.yaw) > 0 || Math.abs(cruise.vertical) > 0)
})

test('hover bob fades out while turbulence fades in with speed', () => {
  const visualConfig = normalizeVisualAttitudeConfig()
  const hoverLow = computeHoverOffset(0, 0, visualConfig, 0.5)
  const hoverHigh = computeHoverOffset(0.5, 0, visualConfig, 0.5)
  const turbulenceLow = computeFlightTurbulence(0, 0, visualConfig.turbulence, 0.5)
  const turbulenceHigh = computeFlightTurbulence(0.5, 0, visualConfig.turbulence, 0.5)

  assert.ok(Math.abs(hoverLow.hoverOffset) > Math.abs(hoverHigh.hoverOffset))
  assert.ok(
    Math.abs(turbulenceHigh.pitch) + Math.abs(turbulenceHigh.roll)
    > Math.abs(turbulenceLow.pitch) + Math.abs(turbulenceLow.roll)
  )
})

test('stepVisualAttitude writes turbulence wobble into attitude state', () => {
  const motionConfig = normalizeAircraftConfig({ maxSpeed: 8 })
  const visualConfig = normalizeVisualAttitudeConfig()
  const state = createAircraftState()
  state.velocity.set(4, 0, 0)
  const attitudeState = {
    pitch: 0,
    roll: 0,
    yawWobble: 0,
    hoverOffset: 0,
    hoverPhase: 0,
    turbulencePhase: 0,
    leftThruster: 0,
    rightThruster: 0
  }

  stepVisualAttitude(state, attitudeState, { thrustInput: 1, turnInput: 0 }, motionConfig, visualConfig, 0.05)

  assert.ok(Math.abs(attitudeState.yawWobble) > 0 || Math.abs(attitudeState.pitch) > 0)
})
