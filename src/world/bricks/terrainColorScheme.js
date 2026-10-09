import * as THREE from 'three/webgpu'

export const TERRAIN_COLOR_LAYERS = ['surface', 'subsurface', 'deep', 'shore']

export const TERRAIN_COLOR_DEFAULTS = Object.freeze({
  name: 'Nature terrain',
  seed: 20260608,
  macroScale: 20,
  verticalScale: 18,
  contrast: 0.85,
  bias: 0,
  heightInfluence: 0.25,
  heightMin: 0,
  heightMax: 36,
  layerStrength: 0.12,
  layerScale: 12,
  layerWarp: 2,
  microVariation: 0.015,
  preview: 'final'
})

const PARAMETER_LIMITS = {
  seed: [0, 4294967295],
  macroScale: [1, 256],
  verticalScale: [1, 128],
  contrast: [0, 2],
  bias: [-0.5, 0.5],
  heightInfluence: [0, 0.5],
  heightMin: [0, 255],
  heightMax: [1, 256],
  layerStrength: [0, 0.5],
  layerScale: [1, 128],
  layerWarp: [0, 16],
  microVariation: [0, 0.1]
}

export function prepareColorPalette(palette) {
  return palette.map((entry) => ({ at: entry.at, color: new THREE.Color(entry.color) }))
    .sort((a, b) => a.at - b.at)
}

// Select the closest authored tone center. At a boundary the higher entry wins.
export function sampleColorPalette(palette, tone, target) {
  for (let i = 1; i < palette.length; i++) {
    if (tone < (palette[i - 1].at + palette[i].at) * 0.5) {
      return target.copy(palette[i - 1].color)
    }
  }
  return target.copy(palette[palette.length - 1].color)
}

export function createDefaultColorPalette(baseHex) {
  const base = new THREE.Color(baseHex)
  const dark = base.clone().multiplyScalar(0.75).getHexString()
  const light = base.clone().multiplyScalar(1.25).getHexString()

  return [
    { at: 0, color: `#${dark}` },
    { at: 0.5, color: `#${base.getHexString()}` },
    { at: 1, color: `#${light}` }
  ]
}

export function createTerrainColorSettings() {
  return { ...TERRAIN_COLOR_DEFAULTS, palettes: {} }
}

export function ensureTerrainColorSettings(config, biomes = []) {
  const settings = config.terrain.color ??= createTerrainColorSettings()
  for (const [key, value] of Object.entries(TERRAIN_COLOR_DEFAULTS)) {
    settings[key] ??= value
  }
  settings.palettes ??= settings.ramps ?? {}
  delete settings.ramps

  for (const biome of biomes) {
    const palettes = settings.palettes[biome.id] ??= {}
    for (const layer of TERRAIN_COLOR_LAYERS) {
      palettes[layer] ??= structuredClone(biome.terrain.palettes?.[layer])
        ?? createDefaultColorPalette(biome.terrain.colors[layer])
    }
  }
  return settings
}

export function isTerrainColorPreview(config) {
  const preview = config.terrain.color?.preview
  return preview === 'baseColor' || preview === 'noise'
}

export function isTerrainPreview(config) {
  return config.terrain.ao?.previewGrayscale === true || isTerrainColorPreview(config)
}

export function exportTerrainColorScheme(settings) {
  return {
    version: 2,
    selection: 'nearest',
    name: settings.name.trim().slice(0, 80) || 'Terrain colors',
    settings: Object.fromEntries(Object.keys(PARAMETER_LIMITS).map((key) => [key, settings[key]])),
    palettes: structuredClone(settings.palettes)
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Validate the entire document before applying it, so a bad import leaves the current scheme intact.
export function importTerrainColorScheme(settings, document) {
  const legacy = isRecord(document) && document.version === 1 && document.interpolation === 'oklab'
  if (!isRecord(document) || (!legacy && (document.version !== 2 || document.selection !== 'nearest'))) {
    throw new Error('Expected a version 2 discrete terrain color scheme')
  }
  if (typeof document.name !== 'string' || !document.name.trim() || document.name.length > 80) {
    throw new Error('Scheme name must contain 1–80 characters')
  }
  const importedPalettes = legacy ? document.ramps : document.palettes
  if (!isRecord(document.settings) || !isRecord(importedPalettes)) {
    throw new Error('Scheme settings and palettes are required')
  }

  const next = {}
  for (const [key, [min, max]] of Object.entries(PARAMETER_LIMITS)) {
    const value = legacy && key.startsWith('height') && document.settings[key] === undefined
      ? TERRAIN_COLOR_DEFAULTS[key]
      : document.settings[key]
    if (!Number.isFinite(value) || value < min || value > max || (key === 'seed' && !Number.isInteger(value))) {
      throw new Error(`Invalid ${key}: expected ${min}–${max}`)
    }
    next[key] = value
  }
  if (next.heightMax <= next.heightMin) {
    throw new Error('Height range must have heightMax greater than heightMin')
  }

  const palettes = structuredClone(settings.palettes)
  for (const [biomeId, layers] of Object.entries(importedPalettes)) {
    if (!Object.hasOwn(palettes, biomeId) || !isRecord(layers)) {
      throw new Error(`Unknown biome: ${biomeId}`)
    }
    for (const [layer, entries] of Object.entries(layers)) {
      if (!TERRAIN_COLOR_LAYERS.includes(layer) || !Array.isArray(entries) || entries.length < 2 || entries.length > 8) {
        throw new Error(`Invalid palette: ${biomeId}/${layer} (expected 2–8 colors)`)
      }
      const normalized = entries.map((entry, i) => {
        if (!isRecord(entry) || !Number.isFinite(entry.at) || entry.at < 0 || entry.at > 1
          || (i > 0 && entry.at <= entries[i - 1].at)
          || typeof entry.color !== 'string' || !/^#[\da-f]{6}$/i.test(entry.color)) {
          throw new Error(`Invalid color ${i + 1}: ${biomeId}/${layer}`)
        }
        return { at: entry.at, color: entry.color.toLowerCase() }
      })
      if (normalized[0].at !== 0 || normalized[normalized.length - 1].at !== 1) {
        throw new Error(`Palette endpoints must be 0 and 1: ${biomeId}/${layer}`)
      }
      palettes[biomeId][layer] = normalized
    }
  }

  Object.assign(settings, next, { name: document.name.trim(), palettes })
}
