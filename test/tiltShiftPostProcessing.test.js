import test from 'node:test'
import assert from 'node:assert/strict'
import { worldConfig } from '../src/world/WorldConfig.js'
import {
  TILT_SHIFT_DEFAULTS,
  TILT_SHIFT_RANGES,
  evaluateTiltShiftMask
} from '../src/renderer/postprocessing/tiltShiftConfig.js'

test('defines the approved tilt-shift defaults and debug ranges', () => {
  assert.deepEqual(TILT_SHIFT_DEFAULTS, {
    enabled: true,
    focusCenter: 0.5,
    focusWidth: 0.22,
    falloff: 0.28,
    blurStrength: 2.5
  })

  assert.deepEqual(TILT_SHIFT_RANGES, {
    focusCenter: { min: 0, max: 1, step: 0.01 },
    focusWidth: { min: 0.02, max: 1, step: 0.01 },
    falloff: { min: 0.01, max: 0.5, step: 0.01 },
    blurStrength: { min: 0, max: 5, step: 0.05 }
  })

  assert.deepEqual(
    worldConfig.postProcessing.tiltShift,
    TILT_SHIFT_DEFAULTS
  )
  assert.notEqual(worldConfig.postProcessing.tiltShift, TILT_SHIFT_DEFAULTS)
})

test('keeps the focus center fully sharp', () => {
  assert.equal(evaluateTiltShiftMask(0.5), 0)
})

test('reaches full blur outside the clear band and falloff', () => {
  const fullBlurY =
    TILT_SHIFT_DEFAULTS.focusCenter +
    TILT_SHIFT_DEFAULTS.focusWidth * 0.5 +
    TILT_SHIFT_DEFAULTS.falloff

  assert.equal(evaluateTiltShiftMask(fullBlurY), 1)
  assert.equal(evaluateTiltShiftMask(1), 1)
})

test('uses a symmetric smooth transition above and below the focus center', () => {
  const upper = evaluateTiltShiftMask(0.25)
  const lower = evaluateTiltShiftMask(0.75)

  assert.equal(upper, lower)
  assert.equal(upper, 0.5)
})
