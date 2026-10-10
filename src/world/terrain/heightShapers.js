const ZERO_HEIGHT_CURVE = [{ n: 0, h: 0 }, { n: 1, h: 0 }]
const VOLCANO_BASE_CURVE = [{ n: 0, h: 2 }, { n: 1, h: 2 }]
const TERRACED_OFFSET = { x: 0, z: 0 }
const DUNES_OFFSET = { x: 8191, z: -1777 }
const VOLCANO_OFFSET = { x: -4723, z: 9157 }

export function sampleHeightCurve(points, n) {
  if (n <= points[0].n) {
    return points[0].h
  }
  for (let i = 1; i < points.length; i++) {
    const b = points[i]
    if (n <= b.n) {
      const a = points[i - 1]
      const t = b.n > a.n ? (n - a.n) / (b.n - a.n) : 1
      return a.h + (b.h - a.h) * t
    }
  }
  return points[points.length - 1].h
}

export function fbm(noise2D, x, z, noise) {
  let value = 0
  let amplitude = 1
  let frequency = 1 / noise.scale
  let totalAmplitude = 0

  for (let octave = 0; octave < noise.octaves; octave++) {
    value += noise2D(x * frequency, z * frequency) * amplitude
    totalAmplitude += amplitude
    amplitude *= noise.gain
    frequency *= noise.lacunarity
  }

  return totalAmplitude > 0 ? value / totalAmplitude : 0
}

function resolveNoise(terrain, params) {
  const noise = params.noise ?? {}
  return {
    scale: noise.scale ?? terrain.noiseScale,
    octaves: noise.octaves ?? terrain.noiseOctaves,
    gain: noise.gain ?? terrain.noiseGain,
    lacunarity: noise.lacunarity ?? terrain.noiseLacunarity
  }
}

function sampleNoise(x, z, noise2D, terrain, params, defaultOffset) {
  const offset = params.noiseOffset ?? defaultOffset
  return fbm(
    noise2D,
    x + (offset.x ?? 0),
    z + (offset.z ?? 0),
    resolveNoise(terrain, params)
  )
}

/** Every shaper returns layers relative to the water level. */
export function terraced({ x, z, noise2D, terrain, params = {} }) {
  const n01 = 0.5 + 0.5 * sampleNoise(x, z, noise2D, terrain, params, TERRACED_OFFSET)
  return sampleHeightCurve(params.heightCurve ?? ZERO_HEIGHT_CURVE, n01)
}

export function dunes({ x, z, noise2D, terrain, params = {} }) {
  const n01 = 0.5 + 0.5 * sampleNoise(x, z, noise2D, terrain, params, DUNES_OFFSET)
  const offset = params.noiseOffset ?? DUNES_OFFSET
  const shiftedX = x + (offset.x ?? 0)
  const shiftedZ = z + (offset.z ?? 0)
  const angle = params.windAngle ?? 0
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const alongWind = shiftedX * cos + shiftedZ * sin
  const acrossWind = -shiftedX * sin + shiftedZ * cos
  const scale = params.duneScale ?? 24
  const stretch = params.duneStretch ?? 4
  const ridge = 1 - Math.abs(noise2D(alongWind / (scale * stretch), acrossWind / scale))

  return (params.baseHeight ?? 2)
    + n01 * (params.baseAmplitude ?? 5)
    + ridge * (params.duneAmplitude ?? 9)
}

export function volcano({ x, z, noise2D, terrain, params = {}, site }) {
  const noise = sampleNoise(x, z, noise2D, terrain, params, VOLCANO_OFFSET)
  const base = sampleHeightCurve(params.heightCurve ?? VOLCANO_BASE_CURVE, 0.5 + 0.5 * noise)
  const radius = params.coneRadius ?? 60
  if (!site || !Number.isFinite(site.distance) || radius <= 0 || site.distance >= radius) {
    return base
  }

  // The mask measures distance in warped biome space, so adjacent chunks and
  // the biome's cone use the same center and coordinate system.
  const distance = Math.max(0, site.distance)
  const radial = 1 - distance / radius
  const cone = radial ** (params.power ?? 1.4) * (params.peak ?? 32)
  const craterRadius = params.craterRadius ?? 12
  const craterT = craterRadius > 0 ? Math.min(1, distance / craterRadius) : 1
  const crater = (1 - craterT * craterT * (3 - 2 * craterT)) * (params.craterDepth ?? 24)
  const roughnessFade = radial * radial * (3 - 2 * radial)
  const relief = cone - crater + noise * (params.roughness ?? 1.5) * roughnessFade
  const step = params.terraceStep ?? 1

  // Quantize the relief, keeping the underlying low terrain intact. Rounding
  // sends relief near zero to zero, so the cone meets its base at the rim.
  return base + (step > 0 ? Math.round(relief / step) * step : relief)
}

export const heightShapers = { terraced, dunes, volcano }
