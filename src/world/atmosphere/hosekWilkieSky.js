import { acos, clamp, Fn, max, mix, positionLocal, smoothstep, uniform, vec3, vec4 } from 'three/tsl'
import { Color, MathUtils, Vector3 } from 'three/webgpu'
import { skyData } from './hosekWilkieData.js'

// A fixed conversion from the reference radiance values to this scene's HDR exposure.
const SCENE_RADIANCE_SCALE = 0.032
const COEFFICIENT_COUNT = 10
const CONTROL_POINT_COUNT = 6
const TURBIDITY_COUNT = 10
const GROUND_BLEND_DEPTH = 0.26
const HORIZON_BLEND_HALF_WIDTH = 0.1
const MIN_DIRECTION_LENGTH = 1e-5
const MIN_PHASE_DENOMINATOR = 1e-5
const SUN_DISK_OUTER = Math.cos(MathUtils.degToRad(0.38))
const SUN_DISK_INNER = Math.cos(MathUtils.degToRad(0.21))
const SUN_DISK_WARM = new Color(1, 0.37, 0.11)
const SUN_DISK_WHITE = new Color(1, 0.96, 0.84)
const HORIZON_DIRECTIONS = [
  new Vector3(1, 0, 0),
  new Vector3(-1, 0, 0),
  new Vector3(0, 0, 1),
  new Vector3(0, 0, -1),
]

function fitCoefficients(data, turbidity, albedo, elevation, coefficients) {
  const lowestTurbidity = Math.floor(turbidity) - 1
  const highestTurbidity = Math.min(lowestTurbidity + 1, TURBIDITY_COUNT - 1)
  const turbidityMix = turbidity - (lowestTurbidity + 1)
  // More of the fit is allocated to the rapid changes near the horizon.
  const t = Math.cbrt(elevation / (Math.PI / 2))
  const s = 1 - t
  const weights = [s ** 5, 5 * s ** 4 * t, 10 * s ** 3 * t ** 2, 10 * s ** 2 * t ** 3, 5 * s * t ** 4, t ** 5]
  const turbidityStride = CONTROL_POINT_COUNT * COEFFICIENT_COUNT
  const albedoStride = TURBIDITY_COUNT * turbidityStride
  const lowStart = lowestTurbidity * turbidityStride
  const highStart = highestTurbidity * turbidityStride

  coefficients.fill(0)
  for (let point = 0; point < CONTROL_POINT_COUNT; point++) {
    for (let index = 0; index < COEFFICIENT_COUNT; index++) {
      const offset = point * COEFFICIENT_COUNT + index
      const low = MathUtils.lerp(data[lowStart + offset], data[lowStart + albedoStride + offset], albedo)
      const high = MathUtils.lerp(data[highStart + offset], data[highStart + albedoStride + offset], albedo)
      coefficients[index] += weights[point] * MathUtils.lerp(low, high, turbidityMix)
    }
  }
}

function sampleChannel([a, b, c, d, e, f, g, i, h, radiance], cosTheta, cosGamma, gamma) {
  const cosGammaSquared = cosGamma * cosGamma
  const phaseDenominator = Math.max(MIN_PHASE_DENOMINATOR, 1 + h * h - 2 * h * cosGamma)
  const chi = (1 + cosGammaSquared) / phaseDenominator ** 1.5
  const horizon = 1 + a * Math.exp(b / (cosTheta + 0.01))
  const distribution = c + d * Math.exp(e * gamma) + f * cosGammaSquared + g * chi + i * Math.sqrt(cosTheta)
  return Math.max(0, horizon * distribution * radiance)
}

function smoothHorizonCosine(y) {
  const width = HORIZON_BLEND_HALF_WIDTH
  const t = MathUtils.clamp((y + width) / (2 * width), 0, 1)
  return Math.max(0, y - width) + width * t ** 3 * (2 - t)
}

/**
 * Analytic skydome in scene-linear RGB. The fit covers the upper hemisphere.
 * The lower hemisphere carries the horizon haze below the ground silhouette.
 */
export function createHosekWilkieSky(options = {}) {
  const sun = new Vector3(0, 1, 0)
  const ray = new Vector3()
  const horizonColor = new Color(0, 0, 0)
  const horizonSample = new Color()
  const channelCoefficients = skyData.map(() => new Float64Array(COEFFICIENT_COUNT))
  const sunNode = uniform(sun)
  const horizonNode = uniform(horizonColor)
  const sunDiskColorNode = uniform(new Color())
  const sunDiskStrengthNode = uniform(0)
  const radianceScaleNode = uniform(SCENE_RADIANCE_SCALE)
  const coefficientNodes = Array.from({ length: COEFFICIENT_COUNT }, () => uniform(new Vector3()))
  const [a, b, c, d, e, f, g, i, h, radiance] = coefficientNodes

  const backgroundNode = Fn(() => {
    // Three.js supplies a world-aligned background sphere and ignores camera translation.
    const direction = positionLocal.normalize().toVar()
    const width = HORIZON_BLEND_HALF_WIDTH
    const t = clamp(direction.y.add(width).div(2 * width), 0, 1).toVar()
    // Smooth the transition into the fitted hemisphere. A hard clamp produces
    // a visible sky seam because the fit changes steeply at low angles.
    const cosTheta = max(direction.y.sub(width), 0).add(t.mul(t).mul(t).mul(t.oneMinus().add(1)).mul(width)).toVar()
    const horizonDirection = vec3(direction.x, 0, direction.z).toVar()
    const sinTheta = max(cosTheta.mul(cosTheta).oneMinus(), 0).sqrt()
    const domeDirection = horizonDirection.mul(sinTheta.div(max(horizonDirection.length(), MIN_DIRECTION_LENGTH)))
      .add(vec3(0, cosTheta, 0))
    const cosGamma = clamp(domeDirection.dot(sunNode), -1, 1).toVar()
    const gamma = acos(cosGamma)
    const cosGammaSquared = cosGamma.mul(cosGamma).toVar()
    const phaseDenominator = max(h.mul(h).add(1).sub(h.mul(cosGamma).mul(2)), MIN_PHASE_DENOMINATOR)
    const chi = cosGammaSquared.add(1).div(phaseDenominator.pow(1.5))
    const horizon = a.mul(b.div(cosTheta.add(0.01)).exp()).add(1)
    const distribution = c.add(d.mul(e.mul(gamma).exp())).add(f.mul(cosGammaSquared)).add(g.mul(chi)).add(i.mul(cosTheta.sqrt()))
    const sky = max(horizon.mul(distribution).mul(radiance), 0).mul(radianceScaleNode)
    const groundBlend = smoothstep(0, GROUND_BLEND_DEPTH, direction.y.negate())

    // Small HDR disc with a softened edge. The angular haze comes from the sky fit.
    const sunDisk = smoothstep(SUN_DISK_OUTER, SUN_DISK_INNER, direction.dot(sunNode))
      .mul(direction.y.greaterThanEqual(0).select(sunDiskStrengthNode, 0))
    return vec4(mix(sky, horizonNode, groundBlend).add(sunDiskColorNode.mul(sunDisk)), 1)
  })()

  let turbidity = 3
  let groundAlbedo = 0.25
  let intensity = 1
  let sunDiskIntensity = 5

  function sampleUpper(cosTheta, cosGamma, target) {
    const angle = Math.acos(cosGamma)
    return target.setRGB(
      sampleChannel(channelCoefficients[0], cosTheta, cosGamma, angle),
      sampleChannel(channelCoefficients[1], cosTheta, cosGamma, angle),
      sampleChannel(channelCoefficients[2], cosTheta, cosGamma, angle),
    ).multiplyScalar(radianceScaleNode.value)
  }

  function sample(direction, target = new Color()) {
    ray.copy(direction).normalize()
    const cosTheta = smoothHorizonCosine(ray.y)
    const groundBlend = MathUtils.smoothstep(-ray.y, 0, GROUND_BLEND_DEPTH)
    ray.y = 0
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta))
    ray.multiplyScalar(sinTheta / Math.max(ray.length(), MIN_DIRECTION_LENGTH))
    ray.y = cosTheta
    const cosGamma = MathUtils.clamp(ray.dot(sun), -1, 1)
    return sampleUpper(cosTheta, cosGamma, target).lerp(horizonColor, groundBlend)
  }

  function update(settings) {
    if (settings.sunDirection) {
      sun.copy(settings.sunDirection)
      if (sun.lengthSq() > 0)
        sun.normalize()
      else
        sun.set(0, 1, 0)
    }
    turbidity = MathUtils.clamp(settings.turbidity ?? turbidity, 1, 10)
    groundAlbedo = MathUtils.clamp(settings.groundAlbedo ?? groundAlbedo, 0, 1)
    intensity = Math.max(0, settings.intensity ?? intensity)
    sunDiskIntensity = Math.max(0, settings.sunDiskIntensity ?? sunDiskIntensity)
    const elevation = Math.asin(MathUtils.clamp(sun.y, 0, 1))
    skyData.forEach((data, index) => fitCoefficients(data, turbidity, groundAlbedo, elevation, channelCoefficients[index]))
    coefficientNodes.forEach((node, index) => node.value.set(
      channelCoefficients[0][index],
      channelCoefficients[1][index],
      channelCoefficients[2][index],
    ))
    radianceScaleNode.value = SCENE_RADIANCE_SCALE * intensity
    sunDiskStrengthNode.value = sunDiskIntensity * intensity * MathUtils.smoothstep(sun.y, 0, 0.004)
    sunDiskColorNode.value.copy(SUN_DISK_WARM).lerp(SUN_DISK_WHITE, MathUtils.smoothstep(elevation, 0, 0.35))
    horizonColor.setRGB(0, 0, 0)
    for (const direction of HORIZON_DIRECTIONS)
      horizonColor.add(sample(direction, horizonSample))
    horizonColor.multiplyScalar(1 / HORIZON_DIRECTIONS.length)
  }

  update(options)
  return { backgroundNode, horizonColor, update, sample }
}
