import { hash2, mulberry32 } from '../../utils/random.js'
import { getLandmarkSettings, SUN_GATE } from './landmarkConfig.js'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const smoothstep = value => value * value * (3 - 2 * value)

/** Candidate ownership depends only on seed and region, never loaded neighbours. */
export function getSunGateCandidate({ origin, size, halo = 0 }, config) {
  const settings = getLandmarkSettings(config)
  const cellSize = config.terrain.cellSize
  if (!settings.enabled || !Number.isFinite(cellSize) || cellSize <= 0 || !Number.isInteger(size))
    return null
  const chunkX = origin.x / size
  const chunkZ = origin.z / size
  if (!Number.isInteger(chunkX) || !Number.isInteger(chunkZ))
    return null
  const regionSize = Math.max(1, Math.floor(settings.regionChunks))
  const regionX = Math.floor(chunkX / regionSize)
  const regionZ = Math.floor(chunkZ / regionSize)
  const random = mulberry32(hash2(regionX, regionZ, config.seed ^ 0x51A7))
  const ownerX = regionX * regionSize + Math.floor(random() * regionSize)
  const ownerZ = regionZ * regionSize + Math.floor(random() * regionSize)
  if (chunkX !== ownerX || chunkZ !== ownerZ)
    return null

  const desiredX = size / 2 + Math.floor(random() * 7) - 3
  const desiredZ = size / 2 + Math.floor(random() * 7) - 3
  const rotation = Math.floor(random() * 4) * Math.PI / 2
  const scale = settings.targetHeight / SUN_GATE.dimensions.height
  if (!Number.isFinite(scale) || scale <= 0)
    return null
  const sideways = Math.round(rotation / (Math.PI / 2)) % 2 !== 0
  const halfWidth = (sideways ? SUN_GATE.dimensions.depth : SUN_GATE.dimensions.width) * scale / 2
  const halfDepth = (sideways ? SUN_GATE.dimensions.width : SUN_GATE.dimensions.depth) * scale / 2
  const platformHalfWidth = halfWidth + Math.max(0, settings.foundationPadding)
  const platformHalfDepth = halfDepth + Math.max(0, settings.foundationPadding)
  const blend = Math.max(1, Math.floor(settings.terraceBlendCells))
  const extentX = platformHalfWidth / cellSize + blend
  const extentZ = platformHalfDepth / cellSize + blend
  // No deformation reaches the neighbouring chunk's sampled halo. The long
  // axis may have less than one cell of jitter room at the default model size.
  const margin = Math.max(1, halo)
  if (extentX * 2 > size - margin * 2 || extentZ * 2 > size - margin * 2)
    return null
  const x = clamp(desiredX, margin + extentX, size - margin - extentX)
  const z = clamp(desiredZ, margin + extentZ, size - margin - extentZ)
  return {
    id: `${SUN_GATE.id}:${config.seed}:${regionX}:${regionZ}`,
    type: SUN_GATE.id,
    name: SUN_GATE.name,
    x, z,
    worldX: (origin.x + x) * cellSize,
    worldZ: (origin.z + z) * cellSize,
    rotation, scale, halfWidth, halfDepth,
    platformHalfWidth, platformHalfDepth,
    blendCells: blend,
    vegetationPadding: Math.max(0, settings.vegetationPadding),
    // Inclusive sample bounds cover every intersected terrain cell.
    minX: Math.max(margin, Math.floor(x - extentX + 1e-9)),
    maxX: Math.min(size - margin - 1, Math.ceil(x + extentX - 1e-9) - 1),
    minZ: Math.max(margin, Math.floor(z - extentZ + 1e-9)),
    maxZ: Math.min(size - margin - 1, Math.ceil(z + extentZ - 1e-9) - 1),
  }
}

/** Validation reads the unmodified final surface, including dry/lava features. */
export function planSunGate(terrainMap, config) {
  const site = getSunGateCandidate({
    origin: terrainMap.origin,
    size: terrainMap.visibleSize,
    halo: terrainMap.halo,
  }, config)
  if (!site)
    return []
  const settings = getLandmarkSettings(config)
  const { cellSize, layerHeight } = config.terrain
  const halo = terrainMap.halo ?? 0
  let minHeight = Infinity
  let maxHeight = -Infinity
  let foundationHeight = -Infinity
  for (let z = site.minZ; z <= site.maxZ; z++) {
    for (let x = site.minX; x <= site.maxX; x++) {
      const surface = terrainMap.getSurfaceCell(x + halo, z + halo)
      const biome = terrainMap.getBiomeCell(x + halo, z + halo)
      if (!surface || !Number.isFinite(surface.height) || surface.isWater || surface.isShore || surface.isLava
        || biome?.biomeId !== 'desert' || (biome.weights?.volcano ?? 0) > 0)
        return []
      minHeight = Math.min(minHeight, surface.height)
      maxHeight = Math.max(maxHeight, surface.height)
      if (maxHeight - minHeight > settings.maxHeightRange)
        return []
      if (Math.abs((x + 0.5 - site.x) * cellSize) <= site.platformHalfWidth + cellSize / 2
        && Math.abs((z + 0.5 - site.z) * cellSize) <= site.platformHalfDepth + cellSize / 2)
        foundationHeight = Math.max(foundationHeight, surface.height)
    }
  }
  if (!Number.isFinite(foundationHeight))
    return []
  return [{
    ...site,
    terraceHeight: foundationHeight,
    // The source terrain brick is translated by h*layerHeight. Its stud top
    // is 0.12 above that origin, measured from legoBlock2x2.glb, not one layer.
    baseY: foundationHeight * layerHeight + (settings.terrainTopOffset ?? 0.12),
  }]
}

/** Apply before final classification/AO/placements so all consumers agree. */
export function applyLandmarkTerraces(heightField, landmarks, halo, config) {
  const { cellSize } = config.terrain
  for (const site of landmarks) {
    for (let z = site.minZ; z <= site.maxZ; z++) {
      for (let x = site.minX; x <= site.maxX; x++) {
        const distanceX = Math.max(0, Math.abs(x + 0.5 - site.x) - site.platformHalfWidth / cellSize - 0.5)
        const distanceZ = Math.max(0, Math.abs(z + 0.5 - site.z) - site.platformHalfDepth / cellSize - 0.5)
        const distance = Math.max(distanceX, distanceZ)
        const t = smoothstep(clamp(distance / Math.max(1, site.blendCells - 0.5), 0, 1))
        const original = heightField.get(x + halo, z + halo)
        const height = Math.round(site.terraceHeight + (original - site.terraceHeight) * t)
        heightField.set(x + halo, z + halo, height)
      }
    }
  }
}

export function isLandmarkReserved(localX, localZ, landmarks, cellSize) {
  return landmarks.some(site =>
    Math.abs((localX + 0.5 - site.x) * cellSize) <= site.halfWidth + site.vegetationPadding
    && Math.abs((localZ + 0.5 - site.z) * cellSize) <= site.halfDepth + site.vegetationPadding)
}
