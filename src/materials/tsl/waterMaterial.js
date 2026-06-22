import * as THREE from 'three/webgpu'
import {
  color,
  mix,
  positionWorld,
  step,
  texture,
  uniform
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

  material.userData.uniforms = {}

  if (waterNoiseTexture) {
    configureWaterNoiseTexture(waterNoiseTexture)

    const uTextureScale = uniform(waterConfig.textureScale ?? 0.45)
    const noiseValue = texture(
      waterNoiseTexture,
      positionWorld.xz.mul(uTextureScale)
    ).r
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
    material.userData.uniforms.uTextureScale = uTextureScale
    material.userData.waterNoiseTexture = waterNoiseTexture
  } else {
    material.colorNode = midColor
  }

  material.roughness = waterConfig.roughness ?? 0.3
  material.metalness = 0
  material.clearcoat = waterConfig.clearcoat ?? 0.45
  material.clearcoatRoughness = waterConfig.clearcoatRoughness ?? 0.2
  material.opacity = 1
  material.transparent = false

  return material
}
