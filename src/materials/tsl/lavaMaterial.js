import * as THREE from 'three/webgpu'
import { color, cos, dot, floor, fract, mix, positionWorld, sin, smoothstep, texture, time, uniform, vec2 } from 'three/tsl'

function configureLavaNoiseTexture(lavaNoiseTexture) {
  lavaNoiseTexture.wrapS = THREE.RepeatWrapping
  lavaNoiseTexture.wrapT = THREE.RepeatWrapping
  lavaNoiseTexture.colorSpace = THREE.NoColorSpace
  lavaNoiseTexture.needsUpdate = true
}

export function createLavaMaterial(lavaConfig = {}, lavaNoiseTexture = null) {
  const material = new THREE.MeshStandardNodeMaterial()

  const uPulseSpeed = uniform(lavaConfig.pulseSpeed ?? 1.35)
  const uGlowStrength = uniform(lavaConfig.glowStrength ?? 1.15)
  const uTextureScale = uniform(lavaConfig.textureScale ?? 0.5)
  const uFlowStrength = uniform(lavaConfig.flowStrength ?? 0.36)
  const uPoolSeedScale = uniform(lavaConfig.poolSeedScale ?? 5.0)
  const uFlowVariance = uniform(lavaConfig.flowVariance ?? 0.85)

  const flow = sin(
    time.mul(uPulseSpeed)
      .add(positionWorld.x.mul(5.7))
      .add(positionWorld.z.mul(4.3))
  ).mul(0.5).add(0.5)

  const ember = sin(
    time.mul(uPulseSpeed.mul(1.7))
      .add(positionWorld.x.mul(13.1))
      .add(positionWorld.z.mul(9.4))
  ).mul(0.5).add(0.5)

  const waveHeat = flow.mul(0.7).add(ember.mul(0.3))
  let heat = waveHeat

  if (lavaNoiseTexture) {
    configureLavaNoiseTexture(lavaNoiseTexture)

    const flowTime = time.mul(uPulseSpeed)
    const lavaUv = positionWorld.xz.mul(uTextureScale)
    const seedCell = floor(positionWorld.xz.mul(uPoolSeedScale))
    const seedA = fract(sin(dot(seedCell, vec2(127.1, 311.7))).mul(43758.5453))
    const seedB = fract(sin(dot(seedCell, vec2(269.5, 183.3))).mul(24634.6345))
    const seedC = fract(sin(dot(seedCell, vec2(419.2, 371.9))).mul(13597.5312))
    const angle = seedA.mul(6.2831853)
    const randomFlow = vec2(cos(angle), sin(angle)).mul(seedB.mul(0.034).add(0.038))
    const baseFlow = vec2(0.035, 0.018)
    const poolFlow = mix(baseFlow, randomFlow, uFlowVariance)
    const phase = seedC.mul(6.2831853)
    const poolOffset = vec2(seedA, seedB).mul(7.0)
    const slowUv = lavaUv.add(poolOffset).add(poolFlow.mul(flowTime.add(phase)))
    const detailUv = lavaUv.mul(2.35).add(poolOffset.mul(1.7)).add(poolFlow.mul(-1.45).mul(flowTime.mul(1.18).add(phase)))
    const flowSample = texture(lavaNoiseTexture, slowUv)
    const detailSample = texture(lavaNoiseTexture, detailUv)

    const flowHeat = flowSample.r.mul(0.62).add(flowSample.g.mul(0.32)).add(flowSample.b.mul(0.06))
    const detailHeat = detailSample.r.mul(0.48).add(detailSample.g.mul(0.52))
    const textureHeat = smoothstep(0.18, 0.92, mix(flowHeat, detailHeat, uFlowStrength))

    heat = mix(waveHeat, textureHeat, 0.86)
    material.userData.lavaNoiseTexture = lavaNoiseTexture
  }

  const lavaColor = mix(color('#ff3b00'), color('#ffd45a'), heat)

  material.colorNode = lavaColor
  material.emissiveNode = color('#ff4a00').mul(heat.mul(uGlowStrength))
  material.roughness = lavaConfig.roughness ?? 0.34
  material.metalness = 0
  material.userData.uniforms = {
    uPulseSpeed,
    uGlowStrength,
    uTextureScale,
    uFlowStrength,
    uPoolSeedScale,
    uFlowVariance
  }

  return material
}
