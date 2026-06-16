import { createNoise2D } from 'simplex-noise'
import { mulberry32, random01 } from '../../utils/random.js'

const DEFAULT_LAVA = {
  poolDensity: 0.12,
  minVolcanoWeight: 0.65,
  poolCellScale: 18,
  poolEdgeWarp: 0.12,
  maxSlope: 4
}

export default class VolcanoSurfaceFeatureGenerator {
  constructor({ config, biomeRegistry }) {
    this.config = config
    this.biomeRegistry = biomeRegistry
    this.poolWarpNoise = createNoise2D(mulberry32(config.seed + 3001))
  }

  apply(biomeCells, surfaceCells) {
    const { width, depth } = this.config.terrain
    const lavaConfig = this.getLavaConfig()

    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        const biomeCell = biomeCells[z][x]
        const surfaceCell = surfaceCells[z][x]

        surfaceCell.isLava = false
        surfaceCell.lavaType = null
        surfaceCell.lavaHeight = null

        if (!this.canHostLava(biomeCell, surfaceCell, lavaConfig)) {
          continue
        }

        if (this.isPoolCell(x, z, lavaConfig)) {
          surfaceCell.isLava = true
          surfaceCell.lavaType = 'pool'
        }
      }
    }

    this.assignPoolHeights(surfaceCells)
  }

  getLavaConfig() {
    const volcano = this.biomeRegistry.get('volcano')
    return { ...DEFAULT_LAVA, ...(volcano.lava ?? {}) }
  }

  canHostLava(biomeCell, surfaceCell, lavaConfig) {
    const volcanoWeight = biomeCell.weights.volcano ?? 0
    return volcanoWeight >= lavaConfig.minVolcanoWeight &&
      !surfaceCell.isWater &&
      surfaceCell.slope <= lavaConfig.maxSlope
  }

  isPoolCell(x, z, lavaConfig) {
    if (lavaConfig.poolDensity <= 0) {
      return false
    }
    if (lavaConfig.poolDensity >= 1) {
      return true
    }

    const cellScale = Math.max(1, lavaConfig.poolCellScale)
    const px = x / cellScale
    const pz = z / cellScale
    const cellX = Math.floor(px)
    const cellZ = Math.floor(pz)
    let nearestDistanceSq = Infinity

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cellX + dx
        const gz = cellZ + dz
        const featureX = gx + random01(gx, gz, this.config.seed + 1701)
        const featureZ = gz + random01(gx, gz, this.config.seed + 5309)
        const ddx = px - featureX
        const ddz = pz - featureZ
        nearestDistanceSq = Math.min(nearestDistanceSq, ddx * ddx + ddz * ddz)
      }
    }

    const nearestDistance = Math.sqrt(nearestDistanceSq)
    const warpScale = cellScale * 2.5
    const edgeWarp = this.poolWarpNoise(x / warpScale, z / warpScale) * lavaConfig.poolEdgeWarp
    const poolValue = Math.max(0, Math.min(1, 1 - nearestDistance + edgeWarp))

    return poolValue > 1 - lavaConfig.poolDensity
  }

  assignPoolHeights(surfaceCells) {
    const { width, depth } = this.config.terrain
    const visited = Array.from({ length: depth }, () => Array(width).fill(false))

    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        const startCell = surfaceCells[z][x]
        if (visited[z][x] || !startCell.isLava) {
          continue
        }

        const poolCells = []
        const stack = [[x, z]]
        let lavaHeight = startCell.height
        visited[z][x] = true

        while (stack.length > 0) {
          const [cx, cz] = stack.pop()
          const cell = surfaceCells[cz][cx]
          poolCells.push(cell)
          lavaHeight = Math.min(lavaHeight, cell.height)

          for (const [nx, nz] of this.neighborCoords(cx, cz)) {
            if (nx < 0 || nz < 0 || nx >= width || nz >= depth || visited[nz][nx]) {
              continue
            }

            const neighbor = surfaceCells[nz][nx]
            if (!neighbor.isLava) {
              continue
            }

            visited[nz][nx] = true
            stack.push([nx, nz])
          }
        }

        for (const cell of poolCells) {
          cell.lavaHeight = lavaHeight
        }
      }
    }
  }

  neighborCoords(x, z) {
    return [
      [x + 1, z],
      [x - 1, z],
      [x, z + 1],
      [x, z - 1]
    ]
  }
}
