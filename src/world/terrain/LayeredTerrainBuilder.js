const VOLCANO_FILL_BIOME_CELL = Object.freeze({
  biomeId: 'volcano',
  weights: Object.freeze({ volcano: 1 })
})

export default class LayeredTerrainBuilder {
  constructor({ config }) {
    this.config = config
  }

  buildPlacements(terrainMap) {
    const placements = []
    const { width, depth, waterLevel } = this.config.terrain

    const effectiveHeight = (x, z, lavaAware = false) => {
      if (x < 0 || z < 0 || x >= width || z >= depth) {
        return -1
      }
      const surfaceCell = terrainMap.getSurfaceCell(x, z)
      if (lavaAware && surfaceCell?.isLava) {
        return surfaceCell.lavaHeight ?? surfaceCell.height
      }

      const h = terrainMap.getHeight(x, z)
      return h <= waterLevel ? waterLevel : h
    }

    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        const surfaceCell = terrainMap.getSurfaceCell(x, z)
        if (surfaceCell.isWater) {
          continue
        }

        const biomeCell = terrainMap.getBiomeCell(x, z)
        const h = surfaceCell.height
        const topHeight = surfaceCell.isLava
          ? Math.min(h, (surfaceCell.lavaHeight ?? h) - 1)
          : h
        if (topHeight < 0) {
          continue
        }

        const originalNeighborHeight = Math.min(
          effectiveHeight(x + 1, z),
          effectiveHeight(x - 1, z),
          effectiveHeight(x, z + 1),
          effectiveHeight(x, z - 1)
        )
        const lavaAwareNeighborHeight = Math.min(
          effectiveHeight(x + 1, z, true),
          effectiveHeight(x - 1, z, true),
          effectiveHeight(x, z + 1, true),
          effectiveHeight(x, z - 1, true)
        )
        const originalYStart = Math.min(topHeight, originalNeighborHeight + 1)
        const yStart = Math.min(topHeight, lavaAwareNeighborHeight + 1)

        for (let y = yStart; y <= topHeight; y++) {
          const layer = y === topHeight
            ? 'surface'
            : y >= topHeight - 2
              ? 'subsurface'
              : 'deep'
          const placementBiomeCell = surfaceCell.isLava || y < originalYStart
            ? VOLCANO_FILL_BIOME_CELL
            : biomeCell
          placements.push({ x, y, z, layer, biomeCell: placementBiomeCell, surfaceCell })
        }
      }
    }

    return placements
  }
}
