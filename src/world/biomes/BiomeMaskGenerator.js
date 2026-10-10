import { createNoise2D } from 'simplex-noise'
import { mulberry32, pickWeighted, random01 } from '../../utils/random.js'

export default class BiomeMaskGenerator {
  constructor(config) {
    this.config = config
  }

  generate() {
    const { width, depth } = this.config.terrain
    return this.generateForBounds({ x: 0, z: 0 }, width, depth)
  }

  generateForBounds(origin, width, depth) {
    const context = this.createSamplingContext()
    const cells = []

    for (let z = 0; z < depth; z++) {
      const row = []
      for (let x = 0; x < width; x++) {
        row.push(this.getCellBiome(origin.x + x, origin.z + z, context))
      }
      cells.push(row)
    }

    return cells
  }

  createSamplingContext() {
    const { seed, biomes } = this.config
    if (this.noiseSeed !== seed) {
      this.warpNoiseX = createNoise2D(mulberry32(seed + 1259))
      this.warpNoiseZ = createNoise2D(mulberry32(seed + 3253))
      this.noiseSeed = seed
    }

    return {
      table: biomes.table.map(({ id, weight }) => ({ value: id, weight })),
      // Reuse sites within a generation without retaining an unbounded world cache.
      sites: new Map()
    }
  }

  getSite(gx, gz, context) {
    const key = `${gx},${gz}`
    let site = context.sites.get(key)
    if (!site) {
      const { seed, biomes } = this.config
      const { cellSize, jitter, originBiome } = biomes
      site = {
        x: (gx + 0.5 + (random01(gx, gz, seed + 1) - 0.5) * jitter) * cellSize,
        z: (gz + 0.5 + (random01(gx, gz, seed + 2) - 0.5) * jitter) * cellSize,
        biomeId: gx === 0 && gz === 0 && originBiome
          ? originBiome
          : pickWeighted(context.table, random01(gx, gz, seed + 3))
      }
      context.sites.set(key, site)
    }
    return site
  }

  getCellBiome(x, z, context = this.createSamplingContext()) {
    const { cellSize, jitter, blendWidth, warp } = this.config.biomes
    const warpedX = x + this.warpNoiseX(x / warp.scale, z / warp.scale) * warp.amplitude
    const warpedZ = z + this.warpNoiseZ(x / warp.scale, z / warp.scale) * warp.amplitude
    const gx = Math.floor(warpedX / cellSize)
    const gz = Math.floor(warpedZ / cellSize)
    const candidates = []
    let nearestDistance = Infinity
    const addSite = (sx, sz) => {
      const site = this.getSite(sx, sz, context)
      const distance = Math.hypot(warpedX - site.x, warpedZ - site.z)
      candidates.push({ ...site, distance })
      nearestDistance = Math.min(nearestDistance, distance)
    }

    for (let sz = gz - 1; sz <= gz + 1; sz++) {
      for (let sx = gx - 1; sx <= gx + 1; sx++) {
        addSite(sx, sz)
      }
    }

    // A fixed 3x3 search can drop a contributing site at a grid boundary.
    // Include every grid whose jittered site can lie within the blend cutoff.
    const cutoff = nearestDistance + blendWidth
    const minX = Math.ceil((warpedX - cutoff) / cellSize - 0.5 - jitter / 2)
    const maxX = Math.floor((warpedX + cutoff) / cellSize - 0.5 + jitter / 2)
    const minZ = Math.ceil((warpedZ - cutoff) / cellSize - 0.5 - jitter / 2)
    const maxZ = Math.floor((warpedZ + cutoff) / cellSize - 0.5 + jitter / 2)
    for (let sz = minZ; sz <= maxZ; sz++) {
      for (let sx = minX; sx <= maxX; sx++) {
        if (Math.abs(sx - gx) > 1 || Math.abs(sz - gz) > 1) {
          addSite(sx, sz)
        }
      }
    }

    const weights = {}
    const sites = {}
    let total = 0
    for (const { biomeId, x: siteX, z: siteZ, distance } of candidates) {
      const t = blendWidth > 0
        ? Math.min(1, Math.max(0, (distance - nearestDistance) / blendWidth))
        : distance === nearestDistance ? 0 : 1
      const weight = 1 - t * t * (3 - 2 * t)
      if (weight <= 0) continue

      weights[biomeId] = (weights[biomeId] ?? 0) + weight
      total += weight
      if (!sites[biomeId] || distance < sites[biomeId].distance) {
        sites[biomeId] = { x: siteX, z: siteZ, distance }
      }
    }

    let biomeId
    let dominantWeight = -1
    for (const id of Object.keys(weights)) {
      weights[id] /= total
      if (weights[id] > dominantWeight) {
        biomeId = id
        dominantWeight = weights[id]
      }
    }

    return { biomeId, weights, sites }
  }
}
