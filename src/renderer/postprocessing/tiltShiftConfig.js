export const TILT_SHIFT_DEFAULTS = Object.freeze({
  enabled: true,
  focusCenter: 0.61,
  focusWidth: 0.33,
  falloff: 0.30,
  blurStrength: 0.45
})

export const TILT_SHIFT_RANGES = Object.freeze({
  focusCenter: Object.freeze({ min: 0, max: 1, step: 0.01 }),
  focusWidth: Object.freeze({ min: 0.02, max: 1, step: 0.01 }),
  falloff: Object.freeze({ min: 0.01, max: 0.5, step: 0.01 }),
  blurStrength: Object.freeze({ min: 0, max: 5, step: 0.05 })
})

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1)
}

export function evaluateTiltShiftMask(
  screenY,
  config = TILT_SHIFT_DEFAULTS
) {
  const focusCenter = config.focusCenter ?? TILT_SHIFT_DEFAULTS.focusCenter
  const focusWidth = config.focusWidth ?? TILT_SHIFT_DEFAULTS.focusWidth
  const falloff = config.falloff ?? TILT_SHIFT_DEFAULTS.falloff
  const distance = Math.abs(screenY - focusCenter)
  const clearEdge = focusWidth * 0.5

  if (falloff <= 0) {
    return distance <= clearEdge ? 0 : 1
  }

  const t = clamp01((distance - clearEdge) / falloff)
  return t * t * (3 - 2 * t)
}
