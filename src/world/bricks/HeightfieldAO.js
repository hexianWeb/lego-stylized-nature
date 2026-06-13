const CARDINAL = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
]

const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1]
]

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export default class HeightfieldAO {
  constructor({ config }) {
    this.config = config
    /** @type {Map<string, number>} */
    this._values = new Map()
  }

  /**
   * @param {import('../terrain/TerrainMap.js').default} terrainMap
   */
  build(terrainMap) {
    this._values.clear()

    const ao = this.config.terrain.ao
    if (!ao?.enabled && !ao?.previewGrayscale) {
      return this
    }

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

        const h = surfaceCell.height
        const minNeighbor = Math.min(
          effectiveHeight(x + 1, z),
          effectiveHeight(x - 1, z),
          effectiveHeight(x, z + 1),
          effectiveHeight(x, z - 1)
        )
        const yStart = Math.min(h, minNeighbor + 1)

        for (let y = yStart; y <= h; y++) {
          const aoFactor = this._computeBlockAO({
            x,
            y,
            z,
            h,
            minNeighbor,
            effectiveHeight,
            ao
          })
          this._values.set(this._key(x, y, z), aoFactor)
        }
      }
    }

    return this
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  get(x, y, z) {
    const ao = this.config.terrain.ao
    if (!ao?.enabled && !ao?.previewGrayscale) {
      return 1
    }
    return this._values.get(this._key(x, y, z)) ?? 1
  }

  isActive() {
    const ao = this.config.terrain.ao
    return Boolean(ao?.enabled || ao?.previewGrayscale)
  }

  _key(x, y, z) {
    return `${x},${y},${z}`
  }

  _computeBlockAO({ x, y, z, h, minNeighbor, effectiveHeight, ao }) {
    let horizon = 0
    for (const [dx, dz] of DIRECTIONS) {
      const neighborHeight = effectiveHeight(x + dx, z + dz)
      const delta = Math.max(neighborHeight - h, 0)
      horizon += clamp(delta / ao.horizonScale, 0, 1)
    }
    horizon /= DIRECTIONS.length

    const underStep = Math.max(y - minNeighbor - 1, 0)
    const crevice = clamp(underStep / ao.creviceScale, 0, 1)

    const depthOcc = clamp((h - y) / ao.depthScale, 0, 1)

    let sideGap = 0
    for (const [dx, dz] of CARDINAL) {
      if (effectiveHeight(x + dx, z + dz) < y) {
        sideGap += 0.25
      }
    }

    const surfaceBoost = y === h ? 1 : clamp(0.35 + (y / Math.max(h, 1)) * 0.35, 0.35, 0.7)

    const occlusion =
      horizon * ao.horizonWeight * surfaceBoost +
      crevice * ao.creviceWeight +
      depthOcc * ao.depthWeight +
      sideGap * ao.sideWeight

    const t = clamp(occlusion * ao.strength, 0, 1)
    return ao.min + (1 - ao.min) * (1 - t)
  }
}
