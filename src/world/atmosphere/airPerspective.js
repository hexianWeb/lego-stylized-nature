import { Color } from 'three/webgpu'
import { cameraPosition, Fn, fog, max, min, mix, positionWorld, select, smoothstep, uniform } from 'three/tsl'

const enabledByFogNode = new WeakMap()

export function hasActiveAirPerspective(fogNode) {
  return enabledByFogNode.get(fogNode)?.value === 1
}

/**
 * Integrate exponential height density over the ray beyond startDistance.
 * Heights and distances use world units. Density and falloff use inverse world units.
 */
export function createAirPerspective(settings) {
  const enabled = uniform(1)
  const color = uniform(new Color(settings.color))
  const density = uniform(settings.density)
  const heightFalloff = uniform(settings.heightFalloff)
  const baseHeight = uniform(settings.baseHeight)
  const startDistance = uniform(settings.startDistance)
  const fadeStart = uniform(settings.fadeStart ?? 0)
  const fadeEnd = uniform(settings.fadeEnd ?? 0)

  const factor = Fn(() => {
    const rayLength = positionWorld.distance(cameraPosition).toVar()
    const fogDistance = rayLength.sub(startDistance.max(0)).max(0).toVar()
    const startHeight = mix(positionWorld.y, cameraPosition.y, fogDistance.div(rayLength.max(0.0001))).toVar()
    const low = min(startHeight, positionWorld.y).sub(baseHeight).toVar()
    const high = max(startHeight, positionWorld.y).sub(baseHeight).toVar()
    const belowFraction = low.negate().div(high.sub(low).max(0.0001)).clamp(0, 1)
    const falloff = heightFalloff.max(0)
    const change = high.max(0).sub(low.max(0)).mul(falloff).toVar()

    // Average exp(-change * t) along the above-base segment. Use its Taylor
    // limit for nearly horizontal rays to keep the subtraction well-conditioned.
    const aboveAverage = select(
      change.lessThan(0.02),
      change.mul(change.div(6).sub(0.5)).add(1),
      change.negate().exp().oneMinus().div(change.max(0.0001)),
    ).mul(low.max(0).mul(falloff).negate().exp())
    const meanDensity = mix(aboveAverage, 1, belowFraction)
    const opticalDepth = density.max(0).mul(fogDistance, meanDensity)
    // Apply the distance fade to the finished haze so the farthest surfaces
    // reach the same height-dependent haze strength as the original model.
    const fadeNear = fadeStart.max(0)
    const distanceFade = smoothstep(fadeNear, fadeEnd.max(fadeNear.add(0.001)), rayLength)
    return opticalDepth.negate().exp().oneMinus().mul(distanceFade)
  })()

  // Keep the same scene fog node when toggling so material pipelines stay valid.
  const fogNode = fog(color, factor.mul(enabled))
  enabledByFogNode.set(fogNode, enabled)
  return { fogNode, enabled, color, density, heightFalloff, baseHeight, startDistance, fadeStart, fadeEnd }
}
