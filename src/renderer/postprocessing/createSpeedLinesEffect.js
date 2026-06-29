import * as THREE from 'three/webgpu'
import {
  Fn,
  abs,
  atan,
  float,
  floor,
  fract,
  mix,
  sin,
  smoothstep,
  step,
  uniform,
  screenUV,
  vec4
} from 'three/tsl'
import {
  normalizeSpeedLinesConfig,
  SPEED_LINES_DEFAULTS
} from './speedLinesConfig.js'

function applyConfigToUniforms(uniforms, config) {
  const normalized = normalizeSpeedLinesConfig(config)

  uniforms.uEnabled.value = normalized.enabled ? 1 : 0
  uniforms.uOpacity.value = normalized.opacity
  uniforms.uDensity.value = normalized.density
  uniforms.uSpeed.value = normalized.speed
  uniforms.uThickness.value = normalized.thickness
  uniforms.uMinRadius.value = normalized.minRadius
  uniforms.uMaxRadius.value = normalized.maxRadius
  uniforms.uRandomness.value = normalized.randomness
  uniforms.uColor.value.setRGB(
    normalized.color.r / 255,
    normalized.color.g / 255,
    normalized.color.b / 255
  )

  return normalized
}

/**
 * @param {import('three/tsl').Node} sceneColor
 * @param {object} [config]
 */
export function createSpeedLinesEffect(
  sceneColor,
  config = SPEED_LINES_DEFAULTS
) {
  const normalized = normalizeSpeedLinesConfig(config)

  const uniforms = {
    uTime: uniform(0),
    uOpacity: uniform(normalized.opacity),
    uColor: uniform(new THREE.Color(
      normalized.color.r / 255,
      normalized.color.g / 255,
      normalized.color.b / 255
    )),
    uDensity: uniform(normalized.density),
    uSpeed: uniform(normalized.speed),
    uThickness: uniform(normalized.thickness),
    uMinRadius: uniform(normalized.minRadius),
    uMaxRadius: uniform(normalized.maxRadius),
    uRandomness: uniform(normalized.randomness),
    uEnabled: uniform(normalized.enabled ? 1 : 0)
  }

  const random = Fn(([seed]) => {
    return fract(seed.mul(12.9898).sin().mul(43758.5453))
  })

  const speedLinesFn = Fn(([inputColor]) => {
    const PI = float(3.14159265)
    const TWO_PI = PI.mul(2.0)

    const centeredUv = screenUV.sub(0.5).mul(2.0)
    const radius = centeredUv.length()

    const angle = atan(centeredUv.y, centeredUv.x)
    const normalizedAngle = angle.add(PI).div(TWO_PI)

    const sectorCount = uniforms.uDensity
    const sectorPosition = normalizedAngle.mul(sectorCount)
    const sectorIndex = floor(sectorPosition)
    const sectorProgress = fract(sectorPosition)
    const sectorCenter = float(0.5)

    const sectorSeed = random(sectorIndex.add(0.5))
    const showTriangle = step(0.4, sectorSeed)

    const angleOffset = random(sectorIndex.add(1.5))
      .sub(0.5)
      .mul(uniforms.uRandomness)
      .mul(0.3)

    const phase = random(sectorIndex.add(2.5)).mul(TWO_PI)

    const pulse = uniforms.uTime
      .mul(uniforms.uSpeed)
      .add(phase)
      .sin()
      .mul(0.5)
      .add(0.5)

    const tipRadius = mix(uniforms.uMaxRadius, uniforms.uMinRadius, pulse)
    const baseRadius = uniforms.uMaxRadius.add(0.2)

    const angleFromCenter = abs(
      sectorProgress
        .sub(sectorCenter)
        .add(angleOffset)
    )

    const halfWidth = uniforms.uThickness.mul(0.5)

    const radiusProgress = radius
      .sub(tipRadius)
      .div(baseRadius.sub(tipRadius))
      .clamp(0.0, 1.0)

    const allowedWidth = halfWidth.mul(radiusProgress)
    const edgeSoftness = float(0.02)

    const angleSoftEdge = float(1.0).sub(
      smoothstep(
        allowedWidth.sub(edgeSoftness),
        allowedWidth,
        angleFromCenter
      )
    )

    const tipSoftEdge = smoothstep(
      tipRadius.sub(edgeSoftness),
      tipRadius.add(edgeSoftness),
      radius
    )

    const baseSoftEdge = float(1.0).sub(
      smoothstep(
        baseRadius.sub(edgeSoftness),
        baseRadius,
        radius
      )
    )

    const softEdge = angleSoftEdge
      .mul(tipSoftEdge)
      .mul(baseSoftEdge)
      .mul(showTriangle)

    const triangleAlpha = softEdge
      .mul(radiusProgress)
      .mul(uniforms.uOpacity)

    const lineColor = mix(inputColor.rgb, uniforms.uColor, triangleAlpha)
    const withLines = vec4(lineColor, inputColor.a)

    const opacityMask = step(float(0.001), uniforms.uOpacity)

    return mix(inputColor, withLines, opacityMask)
  })

  const effectOutput = speedLinesFn(sceneColor)
  const enabledMask = step(float(0.5), uniforms.uEnabled)
  const outputNode = mix(sceneColor, effectOutput, enabledMask)

  return {
    outputNode,
    uniforms,

    setEnabled(value) {
      uniforms.uEnabled.value = value === true ? 1 : 0
    },

    setOpacity(value) {
      uniforms.uOpacity.value = Math.min(Math.max(value, 0), 1)
    },

    sync(nextConfig = {}) {
      return applyConfigToUniforms(uniforms, nextConfig)
    }
  }
}
