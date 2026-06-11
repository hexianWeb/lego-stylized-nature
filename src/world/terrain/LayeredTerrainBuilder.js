export default class LayeredTerrainBuilder {
  constructor({ config }) {
    this.config = config
  }

  buildPlacements(terrainMap) {
    const placements = []
    const { width, depth, waterLevel } = this.config.terrain

    const effectiveHeight = (x, z) => {
      if (x < 0 || z < 0 || x >= width || z >= depth) {
        return -1
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
        const m = Math.min(
          effectiveHeight(x + 1, z),
          effectiveHeight(x - 1, z),
          effectiveHeight(x, z + 1),
          effectiveHeight(x, z - 1)
        )
        const yStart = Math.min(h, m + 1)

        for (let y = yStart; y <= h; y++) {
          const layer = y === h
            ? 'surface'
            : y >= h - 2
              ? 'subsurface'
              : 'deep'
          placements.push({ x, y, z, layer, biomeCell, surfaceCell })
        }
      }
    }

    return placements
  }
}
