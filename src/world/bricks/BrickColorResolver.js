import * as THREE from 'three/webgpu'
import { createNoise2D, createNoise3D } from 'simplex-noise'
import { mulberry32, random01 } from '../../utils/random.js'
import {
  createDefaultColorPalette,
  ensureTerrainColorSettings,
  prepareColorPalette,
  sampleColorPalette
} from './terrainColorScheme.js'

export default class BrickColorResolver {
  constructor({ biomeRegistry, biomeBlender, config }) {
    this.biomeRegistry = biomeRegistry
    this.biomeBlender = biomeBlender
    this.config = config
    this._color = new THREE.Color()
    this.settings = ensureTerrainColorSettings(config, biomeRegistry.getAll?.() ?? [])
    this._palettes = new Map()
    this._noiseSeed = null
    this.lastTone = 0.5
  }

  resolve(sample) {
    return `#${this.resolveColor(sample, this._color).getHexString()}`
  }

  resolveColor(sample, target) {
    const { biomeCell, surfaceCell, layer, x, z } = sample
    const biomeId = this.biomeBlender.pickDitheredBiomeId(biomeCell.weights, x, z, this.config.seed)
    const colorLayer = layer === 'surface' && surfaceCell?.isShore ? 'shore' : layer
    const key = `${biomeId}:${colorLayer}`
    let palette = this._palettes.get(key)
    if (!palette) {
      const palettes = this.settings.palettes[biomeId] ??= {}
      palettes[colorLayer] ??= createDefaultColorPalette(this.biomeRegistry.get(biomeId).terrain.colors[colorLayer])
      palette = prepareColorPalette(palettes[colorLayer])
      this._palettes.set(key, palette)
    }

    this.lastTone = this.sampleTone(sample, colorLayer)
    return sampleColorPalette(palette, this.lastTone, target)
  }

  sampleTone({ x, y, z, layer, surfaceCell }, colorLayer = layer) {
    this.ensureNoise()
    const settings = this.settings
    const nx = (x + 0.5) / settings.macroScale
    const nz = (z + 0.5) / settings.macroScale
    const isRock = colorLayer === 'subsurface' || colorLayer === 'deep'
    let noise = isRock
      ? this._noise3D(nx, (y + 0.5) / settings.verticalScale, nz)
      : this._noise2D(nx, nz)

    if (isRock && settings.layerStrength > 0) {
      const warp = this._warp2D(nx * 0.5, nz * 0.5) * settings.layerWarp
      const band = Math.sin((y + 0.5 + warp) * Math.PI * 2 / settings.layerScale)
      noise = (noise + band * settings.layerStrength) / (1 + settings.layerStrength)
    }

    const microSeed = settings.seed ^ Math.imul(y + 1013, 1597334677)
    const micro = (random01(x, z, microSeed) * 2 - 1) * settings.microVariation
    // Bias by the generated column height, rather than replacing the noise field with altitude bands.
    const height = Number.isFinite(surfaceCell?.height) ? surfaceCell.height : y
    const height01 = THREE.MathUtils.clamp(
      (height - settings.heightMin) / Math.max(Number.EPSILON, settings.heightMax - settings.heightMin), 0, 1
    )
    const heightBias = (height01 - 0.5) * settings.heightInfluence
    return THREE.MathUtils.clamp(0.5 + noise * 0.5 * settings.contrast + settings.bias + heightBias + micro, 0, 1)
  }

  ensureNoise() {
    if (this._noiseSeed === this.settings.seed) return
    this._noiseSeed = this.settings.seed
    this._noise2D = createNoise2D(mulberry32(this._noiseSeed))
    this._noise3D = createNoise3D(mulberry32(this._noiseSeed + 104729))
    this._warp2D = createNoise2D(mulberry32(this._noiseSeed + 130363))
  }

  invalidatePalettes() {
    this._palettes.clear()
  }
}
