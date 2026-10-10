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

const DEFAULT_SAMPLE_DISTANCES = [1, 2, 4, 8]

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export default class HeightfieldAO {
  constructor({ config }) {
    this.config = config
    this._values = new Float32Array(0)
    this._count = 0
    this._samples = new Float64Array(0)
    this._distances = DEFAULT_SAMPLE_DISTANCES
    this._minNeighbor = 0
  }

  /**
   * Computes one visibility value per placement, in placement order.
   * @param {import('../terrain/TerrainMap.js').default} terrainMap
   * @param {Array<{ x: number, y: number, z: number, layer: string }>} placements
   */
  build(terrainMap, placements) {
    this._count = 0

    const ao = this.config.terrain.ao
    if (!this.isActive()) {
      return this
    }

    const { waterLevel, cellSize, layerHeight } = this.config.terrain
    const usesHeightField = Boolean(terrainMap.heightField)
    const sampleWidth = usesHeightField ? terrainMap.heightField.width : this.config.terrain.width
    const sampleDepth = usesHeightField ? terrainMap.heightField.depth : this.config.terrain.depth
    const halo = usesHeightField ? (terrainMap.halo ?? 0) : 0
    const distances = Array.isArray(ao.sampleDistances) && ao.sampleDistances.length > 0
      ? ao.sampleDistances
      : DEFAULT_SAMPLE_DISTANCES
    this._distances = distances

    const sampleCount = DIRECTIONS.length * distances.length
    if (this._samples.length < sampleCount) {
      this._samples = new Float64Array(sampleCount)
    }

    // Matches LayeredTerrainBuilder's lava-aware neighbor height, so exposed bricks line up with placements.
    const effectiveHeight = (sampleX, sampleZ) => {
      if (sampleX < 0 || sampleZ < 0 || sampleX >= sampleWidth || sampleZ >= sampleDepth) {
        return Number.NaN
      }
      const surfaceCell = terrainMap.getSurfaceCell(sampleX, sampleZ)
      if (surfaceCell?.isLava) {
        return surfaceCell.lavaHeight ?? surfaceCell.height
      }
      const h = terrainMap.getHeight(sampleX, sampleZ)
      return h <= waterLevel ? waterLevel : h
    }

    if (this._values.length < placements.length) {
      this._values = new Float32Array(placements.length)
    }

    const samples = this._samples
    let columnX = null
    let columnZ = null

    for (let i = 0; i < placements.length; i++) {
      const p = placements[i]
      if (p.x !== columnX || p.z !== columnZ) {
        columnX = p.x
        columnZ = p.z
        const sampleX = p.x + halo
        const sampleZ = p.z + halo
        let sampleIndex = 0
        for (let d = 0; d < DIRECTIONS.length; d++) {
          const [dx, dz] = DIRECTIONS[d]
          for (let s = 0; s < distances.length; s++) {
            const dist = distances[s]
            samples[sampleIndex++] = effectiveHeight(sampleX + dx * dist, sampleZ + dz * dist)
          }
        }
        // Immediate cardinal neighbors for foot-contact falloff.
        this._minNeighbor = Math.min(
          samples[0],
          samples[distances.length],
          samples[distances.length * 2],
          samples[distances.length * 3]
        )
      }

      this._values[i] = this._computeBlockAO(
        p.y,
        p.layer === 'surface',
        ao,
        cellSize,
        layerHeight
      )
    }

    this._count = placements.length
    return this
  }

  /**
   * @param {number} index placement index passed to build()
   */
  get(index) {
    if (!this.isActive() || index >= this._count) {
      return 1
    }
    return this._values[index]
  }

  isActive() {
    const ao = this.config.terrain.ao
    return Boolean(ao?.enabled || ao?.previewGrayscale)
  }

  _computeBlockAO(y, isTop, ao, cellSize, layerHeight) {
    const horizon = this._computeHorizon(y, ao, cellSize, layerHeight)
    let contact = 0
    if (!isTop && Number.isFinite(this._minNeighbor)) {
      contact = 1 - clamp((y - this._minNeighbor - 1) / ao.creviceScale, 0, 1)
    }

    const occlusion = horizon * ao.horizonWeight + contact * ao.creviceWeight
    const t = clamp(occlusion * ao.strength, 0, 1)
    return ao.min + (1 - ao.min) * (1 - t)
  }

  /**
   * Per-direction max elevation angle (as sin), with distance attenuation.
   * Missing samples are skipped so out-of-bounds data is not treated as open sky.
   */
  _computeHorizon(y, ao, cellSize, layerHeight) {
    const distances = this._distances
    const samples = this._samples
    const falloff = ao.distanceFalloff ?? 0.25
    let sum = 0
    let counted = 0

    for (let d = 0; d < DIRECTIONS.length; d++) {
      const [dx, dz] = DIRECTIONS[d]
      const stepLen = Math.hypot(dx, dz)
      let maxOcc = 0
      let any = false
      const base = d * distances.length

      for (let s = 0; s < distances.length; s++) {
        const neighborHeight = samples[base + s]
        if (!Number.isFinite(neighborHeight)) {
          continue
        }
        any = true
        const rise = (neighborHeight - y) * layerHeight
        if (rise <= 0) {
          continue
        }
        const dist = distances[s]
        const run = dist * stepLen * cellSize
        const sinElev = rise / Math.hypot(rise, run)
        const atten = 1 / (1 + (dist - 1) * falloff)
        maxOcc = Math.max(maxOcc, sinElev * atten)
      }

      if (any) {
        sum += maxOcc
        counted++
      }
    }

    return counted > 0 ? sum / counted : 0
  }
}
