import { pickWeighted, placementRandom01, random01, snapValue } from '../../utils/random.js'

export function canPlacePrefab(rule, manifestEntry, biomeCell, surfaceCell, waterLevel = 0) {
  const placement = manifestEntry.placement ?? {}

  if (surfaceCell.isLava) {
    return false
  }
  if (placement.surface === 'water' && !surfaceCell.isWater) {
    return false
  }
  if (placement.surface === 'land' && surfaceCell.isWater) {
    return false
  }
  if (placement.surface === 'land' && surfaceCell.isShore && !rule.allowShore) {
    return false
  }
  if (placement.biomes && !placement.biomes.includes(biomeCell.biomeId)) {
    return false
  }
  if (rule.minHeight !== undefined && surfaceCell.height < rule.minHeight) {
    return false
  }
  if (rule.maxSlope !== undefined && surfaceCell.slope > rule.maxSlope) {
    return false
  }
  if (surfaceCell.isWater && rule.maxWaterDepth !== undefined
    && waterLevel - surfaceCell.height > rule.maxWaterDepth) {
    return false
  }
  return true
}

// Smooth world-space value noise keeps plant patches continuous across chunks.
// Rules without patches preserve their original uniform distribution.
export function samplePlacementDensity(rule, x, z, seed) {
  if (!rule.patch) {
    return rule.density
  }
  const { scale, minDensity = 0 } = rule.patch
  const gx = Math.floor(x / scale)
  const gz = Math.floor(z / scale)
  const tx = smoothstep(x / scale - gx)
  const tz = smoothstep(z / scale - gz)
  const salt = `${rule.id}:patch`
  const a = placementRandom01(gx, gz, seed, salt)
  const b = placementRandom01(gx + 1, gz, seed, salt)
  const c = placementRandom01(gx, gz + 1, seed, salt)
  const d = placementRandom01(gx + 1, gz + 1, seed, salt)
  const noise = (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz
  const coverage = smoothstep(Math.max(0, Math.min(1, (noise - 0.35) / 0.3)))
  return minDensity + (rule.density - minDensity) * coverage
}

function smoothstep(t) {
  return t * t * (3 - 2 * t)
}

export function createVariantEntries(manifestEntry, variantWeights = null) {
  return manifestEntry.variants
    .map((variant, index) => ({
      value: index,
      weight: variantWeights
        ? variantWeights[variant.source] ?? 0
        : variant.weight ?? 1,
    }))
    .filter(({ weight }) => Number.isFinite(weight) && weight > 0)
}

export function pickVariantIndex(manifestEntry, x, z, seed, entries = createVariantEntries(manifestEntry)) {
  return pickWeighted(entries, random01(x, z, seed + 131))
}

export function makePrefabTransform({
  x,
  z,
  height,
  manifestEntry,
  config,
  seed,
  worldX = x,
  worldZ = z,
}) {
  const { cellSize, layerHeight } = config.terrain
  const { rotationStep } = config.placement

  const rotationY = manifestEntry.randomRotation
    ? snapValue(random01(worldX, worldZ, seed + 17) * Math.PI * 2, rotationStep)
    : 0

  return {
    position: [(x + 0.5) * cellSize, (height + 1) * layerHeight, (z + 0.5) * cellSize],
    rotationY,
    x: worldX,
    y: height,
    z: worldZ,
  }
}
