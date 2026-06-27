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
    const { waterLevel } = this.config.terrain
    const usesHeightField = Boolean(terrainMap.heightField)
    const sampleWidth = usesHeightField ? terrainMap.heightField.width : this.config.terrain.width
    const sampleDepth = usesHeightField ? terrainMap.heightField.depth : this.config.terrain.depth
    const halo = usesHeightField ? (terrainMap.halo ?? 0) : 0
    const visibleWidth = usesHeightField
      ? (terrainMap.visibleSize ?? sampleWidth - halo * 2)
      : sampleWidth
    const visibleDepth = usesHeightField
      ? (terrainMap.visibleSize ?? sampleDepth - halo * 2)
      : sampleDepth

    const effectiveHeight = (sampleX, sampleZ, lavaAware = false) => {
      if (sampleX < 0 || sampleZ < 0 || sampleX >= sampleWidth || sampleZ >= sampleDepth) {
        return -1
      }
      const surfaceCell = terrainMap.getSurfaceCell(sampleX, sampleZ)
      if (lavaAware && surfaceCell?.isLava) {
        return surfaceCell.lavaHeight ?? surfaceCell.height
      }

      const h = terrainMap.getHeight(sampleX, sampleZ)
      return h <= waterLevel ? waterLevel : h
    }

    for (let sampleZ = halo; sampleZ < halo + visibleDepth; sampleZ++) {
      for (let sampleX = halo; sampleX < halo + visibleWidth; sampleX++) {
        const x = sampleX - halo
        const z = sampleZ - halo
        const surfaceCell = terrainMap.getSurfaceCell(sampleX, sampleZ)
        if (surfaceCell.isWater) {
          continue
        }

        const biomeCell = terrainMap.getBiomeCell(sampleX, sampleZ)
        const h = surfaceCell.height
        const topHeight = surfaceCell.isLava
          ? Math.min(h, (surfaceCell.lavaHeight ?? h) - 1)
          : h
        if (topHeight < 0) {
          continue
        }

        const originalNeighborHeight = Math.min(
          effectiveHeight(sampleX + 1, sampleZ),
          effectiveHeight(sampleX - 1, sampleZ),
          effectiveHeight(sampleX, sampleZ + 1),
          effectiveHeight(sampleX, sampleZ - 1)
        )
        const lavaAwareNeighborHeight = Math.min(
          effectiveHeight(sampleX + 1, sampleZ, true),
          effectiveHeight(sampleX - 1, sampleZ, true),
          effectiveHeight(sampleX, sampleZ + 1, true),
          effectiveHeight(sampleX, sampleZ - 1, true)
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
