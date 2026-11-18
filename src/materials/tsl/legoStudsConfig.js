export const STUD_SHADING_DEFAULTS = Object.freeze({
  enabled: true,
  strength: 1,
  radiusScale: 1,
  topBrighten: 0.22,
  shadow: 0.42,
  shadowWidth: 0.13,
  rimWidth: 0.13,
  tilt: 1.3,
  fadeStart: 0.45,
  fadeEnd: 0.5,
})

// Widths use stud-pitch units; fade thresholds use pixel footprint / stud pitch.
// Keep fadeEnd at or below 0.5 so unresolved periods cannot reintroduce moire.
export const STUD_SHADING_RANGES = Object.freeze({
  strength: Object.freeze({ min: 0, max: 1, step: 0.01 }),
  radiusScale: Object.freeze({ min: 0.25, max: 1.5, step: 0.01 }),
  topBrighten: Object.freeze({ min: 0, max: 0.3, step: 0.01 }),
  shadow: Object.freeze({ min: 0, max: 1, step: 0.01 }),
  shadowWidth: Object.freeze({ min: 0, max: 0.3, step: 0.005 }),
  rimWidth: Object.freeze({ min: 0.005, max: 0.2, step: 0.005 }),
  tilt: Object.freeze({ min: 0, max: 2, step: 0.05 }),
  fadeStart: Object.freeze({ min: 0.05, max: 0.45, step: 0.01 }),
  fadeEnd: Object.freeze({ min: 0.1, max: 0.5, step: 0.01 }),
})

export function normalizeStudShadingConfig(config = {}) {
  const settings = { ...STUD_SHADING_DEFAULTS, enabled: config.enabled !== false }
  for (const [key, { min, max }] of Object.entries(STUD_SHADING_RANGES)) {
    const value = Number.isFinite(config[key]) ? config[key] : STUD_SHADING_DEFAULTS[key]
    settings[key] = Math.min(max, Math.max(min, value))
  }
  settings.fadeEnd = Math.max(settings.fadeStart + 0.01, settings.fadeEnd)
  return settings
}
