import * as THREE from 'three/webgpu'
import { random01 } from '../../utils/random.js'

const HSL_JITTER = {
  hue: 0.03,
  saturation: 0.04,
  lightness: 0.04
}

const LAYER_SEED = {
  surface: 0,
  subsurface: 41,
  deep: 73,
  shore: 19
}

export default class BrickColorResolver {
  constructor({ biomeRegistry, biomeBlender, config }) {
    this.biomeRegistry = biomeRegistry
    this.biomeBlender = biomeBlender
    this.config = config
    this._color = new THREE.Color()
    this._hsl = { h: 0, s: 0, l: 0 }
  }

  resolve({ biomeCell, surfaceCell, layer, x, y, z }) {
    const biomeId = this.biomeBlender.pickDitheredBiomeId(biomeCell.weights, x, z, this.config.seed)
    const colors = this.biomeRegistry.get(biomeId).terrain.colors

    let baseHex
    if (layer === 'surface' && surfaceCell.isShore) {
      baseHex = colors.shore
    } else if (layer === 'surface') {
      baseHex = colors.surface
    } else if (layer === 'subsurface') {
      baseHex = colors.subsurface
    } else {
      baseHex = colors.deep
    }

    return this.applyHslJitter(baseHex, x, y, z, layer)
  }

  applyHslJitter(baseHex, x, y, z, layer) {
    const seed = this.config.seed
    const layerSalt = LAYER_SEED[layer] ?? 0

    this._color.set(baseHex)
    this._color.getHSL(this._hsl)

    const hueJitter = (random01(x, y, seed + z + layerSalt) * 2 - 1) * HSL_JITTER.hue
    const satJitter = (random01(z, x, seed + y + layerSalt + 17) * 2 - 1) * HSL_JITTER.saturation
    const lightJitter = (random01(y, z, seed + x + layerSalt + 31) * 2 - 1) * HSL_JITTER.lightness

    this._hsl.h = (this._hsl.h + hueJitter + 1) % 1
    this._hsl.s = THREE.MathUtils.clamp(this._hsl.s + satJitter, 0, 1)
    this._hsl.l = THREE.MathUtils.clamp(this._hsl.l + lightJitter, 0, 1)

    this._color.setHSL(this._hsl.h, this._hsl.s, this._hsl.l)
    return `#${this._color.getHexString()}`
  }
}
