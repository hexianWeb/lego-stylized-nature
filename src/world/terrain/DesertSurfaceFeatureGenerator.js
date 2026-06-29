const DEFAULT_DRY = {
  minDesertWeight: 0.65
}

export default class DesertSurfaceFeatureGenerator {
  constructor({ config, biomeRegistry }) {
    this.config = config
    this.biomeRegistry = biomeRegistry
  }

  apply(biomeCells, surfaceCells) {
    const { waterLevel } = this.config.terrain
    const dryConfig = this.getDryConfig()
    const depth = biomeCells.length
    const width = biomeCells[0]?.length ?? 0

    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        const biomeCell = biomeCells[z][x]
        const surfaceCell = surfaceCells[z][x]

        if (!biomeCell || !surfaceCell || surfaceCell.isLava || !surfaceCell.isWater) {
          continue
        }

        const desertWeight = biomeCell.weights.desert ?? 0
        if (desertWeight < dryConfig.minDesertWeight) {
          continue
        }

        surfaceCell.isWater = false
        if (surfaceCell.height <= waterLevel) {
          surfaceCell.height = waterLevel + 1
        }
        surfaceCell.isShore = surfaceCell.height <= waterLevel + 1
      }
    }
  }

  getDryConfig() {
    const desert = this.biomeRegistry.get('desert')
    return { ...DEFAULT_DRY, ...(desert.dry ?? {}) }
  }
}
