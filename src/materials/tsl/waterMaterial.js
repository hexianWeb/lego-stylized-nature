import * as THREE from 'three/webgpu'
import {
  color,
  mix,
  positionWorld,
  sin,
  smoothstep,
  time,
  uniform,
} from 'three/tsl'

export function createWaterMaterial(waterConfig = {}, baseColor = null) {
  const material = new THREE.MeshPhysicalNodeMaterial()
  const uRippleSpeed = uniform(waterConfig.rippleSpeed ?? 0.75)
  const uRippleScale = uniform(waterConfig.rippleScale ?? 7)
  const uRippleStrength = uniform(waterConfig.rippleStrength ?? 0.12)
  const uDetailScale = uniform(waterConfig.detailScale ?? 18)
  const uDetailStrength = uniform(waterConfig.detailStrength ?? 0.035)
  const uHighlightStrength = uniform(waterConfig.highlightStrength ?? 0.24)

  const phase = time.mul(uRippleSpeed)
  const primary = sin(
    positionWorld.x
      .mul(uRippleScale)
      .add(positionWorld.z.mul(uRippleScale).mul(0.62))
      .add(phase),
  )
    .mul(0.5)
    .add(0.5)
  const crossing = sin(
    positionWorld.x
      .mul(uRippleScale)
      .mul(-0.48)
      .add(positionWorld.z.mul(uRippleScale).mul(0.87))
      .sub(phase.mul(1.17)),
  )
    .mul(0.5)
    .add(0.5)
  const detail = sin(
    positionWorld.x
      .mul(uDetailScale)
      .add(positionWorld.z.mul(uDetailScale).mul(-0.73))
      .add(phase.mul(1.9)),
  )
    .mul(0.5)
    .add(0.5)

  const broadRipple = primary.mul(0.58).add(crossing.mul(0.42))
  const rippleBrightness = broadRipple.sub(0.5).mul(uRippleStrength)
  const highlightMask = smoothstep(0.68, 0.9, broadRipple)
    .add(detail.mul(uDetailStrength))
    .mul(uHighlightStrength)
  const waterColor = color(
    baseColor ??
      waterConfig.transitionColor ??
      waterConfig.color ??
      '#168FD2',
  )

  material.colorNode = mix(
    waterColor.add(rippleBrightness),
    color(waterConfig.highlightColor ?? '#BDF8FF'),
    highlightMask,
  )
  material.roughness = waterConfig.roughness ?? 0.3
  material.metalness = 0
  material.clearcoat = waterConfig.clearcoat ?? 0.45
  material.clearcoatRoughness = waterConfig.clearcoatRoughness ?? 0.2
  material.opacity = 1
  material.transparent = false
  material.userData.uniforms = {
    uRippleSpeed,
    uRippleScale,
    uRippleStrength,
    uDetailScale,
    uDetailStrength,
    uHighlightStrength,
  }

  return material
}
