export default class BiomeMaskGenerator {
  constructor(config) {
    this.config = config
  }

  generate() {
    const { width, depth } = this.config.terrain
    const cells = []

    for (let z = 0; z < depth; z++) {
      const row = []
      for (let x = 0; x < width; x++) {
        row.push(this.getCellBiome(x, z))
      }
      cells.push(row)
    }

    return cells
  }

  getCellBiome(x, z) {
    const regions = this.config.biomes.regions
    const scores = regions.map((region) => {
      const dx = x - region.center[0]
      const dz = z - region.center[1]
      const distance = Math.sqrt(dx * dx + dz * dz)
      const normalized = distance / region.radius
      const score = Math.max(0, 1 - normalized) * region.weight
      return { id: region.id, score }
    }).filter((entry) => entry.score > 0)

    if (scores.length === 0) {
      return { biomeId: 'forest', weights: { forest: 1 } }
    }

    scores.sort((a, b) => b.score - a.score)
    const selected = scores.slice(0, 2)
    const total = selected.reduce((sum, entry) => sum + entry.score, 0)
    const weights = {}

    for (const entry of selected) {
      weights[entry.id] = entry.score / total
    }

    return { biomeId: selected[0].id, weights }
  }
}
