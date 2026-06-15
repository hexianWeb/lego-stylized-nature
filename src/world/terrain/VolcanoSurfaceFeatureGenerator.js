import { createNoise2D } from 'simplex-noise'
import { mulberry32, random01 } from '../../utils/random.js'

const DEFAULT_LAVA = {
  poolDensity: 0.08,
  crackDensity: 0.05,
  minVolcanoWeight: 0.65,
  poolNoiseScale: 18,
  crackNoiseScale: 7,
  maxSlope: 4
}

export default class VolcanoSurfaceFeatureGenerator {
  constructor({ config, biomeRegistry }) {
    this.config = config
    this.biomeRegistry = biomeRegistry
    this.poolNoise = createNoise2D(mulberry32(config.seed + 3001))
    this.crackNoise = createNoise2D(mulberry32(config.seed + 7001))
  }

  apply(biomeCells, surfaceCells) {
    const { width, depth } = this.config.terrain
    const lavaConfig = this.getLavaConfig()

    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        const biomeCell = biomeCells[z][x]
        const surfaceCell = surfaceCells[z][x]

        surfaceCell.isLava = false
        surfaceCell.lavaType = null

        if (!this.canHostLava(biomeCell, surfaceCell, lavaConfig)) {
          continue
        }

        const poolValue = this.normalizedNoise(this.poolNoise, x, z, lavaConfig.poolNoiseScale)
        const crackValue = this.normalizedNoise(this.crackNoise, x, z, lavaConfig.crackNoiseScale)
        const jitter = random01(x, z, this.config.seed + 911)

        if (poolValue > 1 - lavaConfig.poolDensity) {
          surfaceCell.isLava = true
          surfaceCell.lavaType = 'pool'
        } else if (crackValue > 1 - lavaConfig.crackDensity && jitter > 0.35) {
          surfaceCell.isLava = true
          surfaceCell.lavaType = 'crack'
        }
      }
    }
  }

  getLavaConfig() {
    const volcano = this.biomeRegistry.get('volcano')
    return { ...DEFAULT_LAVA, ...(volcano.lava ?? {}) }
  }

  canHostLava(biomeCell, surfaceCell, lavaConfig) {
    const volcanoWeight = biomeCell.weights.volcano ?? 0
    return volcanoWeight >= lavaConfig.minVolcanoWeight &&
      !surfaceCell.isWater &&
      surfaceCell.slope <= lavaConfig.maxSlope
  }

  normalizedNoise(noise, x, z, scale) {
    return 0.5 + 0.5 * noise(x / scale, z / scale)
  }
}
