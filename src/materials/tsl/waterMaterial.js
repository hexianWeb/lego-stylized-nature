import * as THREE from 'three/webgpu'
import {
  color,
  cos,
  dot,
  floor,
  fract,
  mix,
  positionWorld,
  sin,
  step,
  texture,
  time,
  uniform,
  vec2
} from 'three/tsl'

function configureWaterNoiseTexture(waterNoiseTexture) {
  waterNoiseTexture.wrapS = THREE.RepeatWrapping
  waterNoiseTexture.wrapT = THREE.RepeatWrapping
  waterNoiseTexture.colorSpace = THREE.NoColorSpace
  waterNoiseTexture.needsUpdate = true
}

export function createWaterMaterial(waterConfig = {}, waterNoiseTexture = null) {
  const material = new THREE.MeshPhysicalNodeMaterial()
  const darkColor = color(waterConfig.darkColor ?? '#0757A6')
  const midColor = color(waterConfig.midColor ?? '#168FD2')
  const lightColor = color(waterConfig.lightColor ?? '#42DDEB')

  const uTextureScale = uniform(waterConfig.textureScale ?? 0.45)
  const uFlowSpeed = uniform(waterConfig.flowSpeed ?? 0.42)
  const uFlowStrength = uniform(waterConfig.flowStrength ?? 0.52)
  const uFlowVariance = uniform(waterConfig.flowVariance ?? 0.55)

  const flowTime = time.mul(uFlowSpeed)
  const waterUv = positionWorld.xz.mul(uTextureScale)
  const seedCell = floor(positionWorld.xz.mul(0.65))
  const seedA = fract(sin(dot(seedCell, vec2(127.1, 311.7))).mul(43758.5453))
  const seedB = fract(sin(dot(seedCell, vec2(269.5, 183.3))).mul(24634.6345))
  const angle = seedA.mul(6.2831853)
  const randomFlow = vec2(cos(angle), sin(angle)).mul(seedB.mul(0.008).add(0.01))
  const baseFlow = vec2(0.014, 0.007)
  const poolFlow = mix(baseFlow, randomFlow, uFlowVariance)
  const uvPerturb = vec2(
    sin(positionWorld.z.mul(2.4).add(flowTime.mul(1.6))),
    cos(positionWorld.x.mul(2.4).sub(flowTime.mul(1.35)))
  ).mul(0.012)

  let noiseValue = sin(
    positionWorld.x.mul(3.1)
      .add(positionWorld.z.mul(2.3))
      .add(flowTime.mul(2.2))
  ).mul(0.5).add(0.5)

  if (waterNoiseTexture) {
    configureWaterNoiseTexture(waterNoiseTexture)

    const slowUv = waterUv.add(poolFlow.mul(flowTime)).add(uvPerturb)
    const detailUv = waterUv
      .mul(2.05)
      .add(poolFlow.mul(-0.72).mul(flowTime.mul(1.12)))
      .add(uvPerturb.mul(1.35))
    const slowSample = texture(waterNoiseTexture, slowUv).r
    const detailSample = texture(waterNoiseTexture, detailUv).r

    noiseValue = mix(slowSample, detailSample, uFlowStrength)
    material.userData.waterNoiseTexture = waterNoiseTexture
  }

  const darkToMid = mix(darkColor, midColor, noiseValue.mul(2))
  const midToLight = mix(
    midColor,
    lightColor,
    noiseValue.sub(0.5).mul(2)
  )

  material.colorNode = mix(
    darkToMid,
    midToLight,
    step(0.5, noiseValue)
  )
  material.userData.uniforms = {
    uTextureScale,
    uFlowSpeed,
    uFlowStrength,
    uFlowVariance
  }

  material.roughness = waterConfig.roughness ?? 0.3
  material.metalness = 0
  material.clearcoat = waterConfig.clearcoat ?? 0.45
  material.clearcoatRoughness = waterConfig.clearcoatRoughness ?? 0.2
  material.opacity = 1
  material.transparent = false

  return material
}
