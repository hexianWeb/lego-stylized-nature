import { pickWeighted, random01 } from '../../utils/random.js'

export default class BiomeBlender {
  constructor(registry) {
    this.registry = registry
  }

  pickDitheredBiomeId(weights, x, z, seed) {
    const entries = Object.entries(weights).map(([biomeId, weight]) => ({ value: biomeId, weight }))
    return pickWeighted(entries, random01(x, z, seed + 7919))
  }

  getDominantBiome(cell) {
    return this.registry.get(cell.biomeId)
  }
}
