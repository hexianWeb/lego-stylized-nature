export default class BrickColorResolver {
  constructor({ biomeRegistry, biomeBlender, config }) {
    this.biomeRegistry = biomeRegistry
    this.biomeBlender = biomeBlender
    this.config = config
  }

  resolve({ biomeCell, surfaceCell, layer, x, z }) {
    const biomeId = this.biomeBlender.pickDitheredBiomeId(biomeCell.weights, x, z, this.config.seed)
    const colors = this.biomeRegistry.get(biomeId).terrain.colors

    if (layer === 'surface' && surfaceCell.isShore) {
      return colors.shore
    }
    if (layer === 'surface') {
      return colors.surface
    }
    if (layer === 'subsurface') {
      return colors.subsurface
    }
    return colors.deep
  }
}
