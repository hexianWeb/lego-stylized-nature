export const SPEED_LINES_DEFAULTS = Object.freeze({
  enabled: true,
  color: Object.freeze({ r: 255, g: 255, b: 255 }),
  density: 66,
  speed: 6,
  thickness: 0.24,
  minRadius: 0.4,
  maxRadius: 1.3,
  randomness: 0.5,
  opacity: 0
})

export const SPEED_LINES_RANGES = Object.freeze({
  opacity: Object.freeze({ min: 0, max: 1, step: 0.01 }),
  density: Object.freeze({ min: 8, max: 160, step: 1 }),
  speed: Object.freeze({ min: 0, max: 20, step: 0.1 }),
  thickness: Object.freeze({ min: 0.02, max: 1, step: 0.01 }),
  minRadius: Object.freeze({ min: 0, max: 1.5, step: 0.01 }),
  maxRadius: Object.freeze({ min: 0.2, max: 2, step: 0.01 }),
  randomness: Object.freeze({ min: 0, max: 1, step: 0.01 })
})

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1)
}

export function normalizeSpeedLinesColor(color = {}) {
  return {
    r: Number.isFinite(color.r) ? color.r : SPEED_LINES_DEFAULTS.color.r,
    g: Number.isFinite(color.g) ? color.g : SPEED_LINES_DEFAULTS.color.g,
    b: Number.isFinite(color.b) ? color.b : SPEED_LINES_DEFAULTS.color.b
  }
}

export function normalizeSpeedLinesConfig(config = {}) {
  return {
    enabled: config.enabled !== false,
    color: normalizeSpeedLinesColor({
      ...SPEED_LINES_DEFAULTS.color,
      ...(config.color ?? {})
    }),
    density: Number.isFinite(config.density)
      ? config.density
      : SPEED_LINES_DEFAULTS.density,
    speed: Number.isFinite(config.speed)
      ? config.speed
      : SPEED_LINES_DEFAULTS.speed,
    thickness: Number.isFinite(config.thickness)
      ? config.thickness
      : SPEED_LINES_DEFAULTS.thickness,
    minRadius: Number.isFinite(config.minRadius)
      ? config.minRadius
      : SPEED_LINES_DEFAULTS.minRadius,
    maxRadius: Number.isFinite(config.maxRadius)
      ? config.maxRadius
      : SPEED_LINES_DEFAULTS.maxRadius,
    randomness: Number.isFinite(config.randomness)
      ? config.randomness
      : SPEED_LINES_DEFAULTS.randomness,
    opacity: Number.isFinite(config.opacity)
      ? clamp01(config.opacity)
      : SPEED_LINES_DEFAULTS.opacity
  }
}
