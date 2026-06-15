import * as THREE from 'three/webgpu'
import { color, mix, positionWorld, sin, time, uniform } from 'three/tsl'

export function createLavaMaterial(lavaConfig = {}) {
  const material = new THREE.MeshStandardNodeMaterial()

  const uPulseSpeed = uniform(lavaConfig.pulseSpeed ?? 1.35)
  const uGlowStrength = uniform(lavaConfig.glowStrength ?? 1.15)

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

  const heat = flow.mul(0.7).add(ember.mul(0.3))
  const lavaColor = mix(color('#ff3b00'), color('#ffd45a'), heat)

  material.colorNode = lavaColor
  material.emissiveNode = color('#ff4a00').mul(heat.mul(uGlowStrength))
  material.roughness = lavaConfig.roughness ?? 0.34
  material.metalness = 0
  material.userData.uniforms = { uPulseSpeed, uGlowStrength }

  return material
}
