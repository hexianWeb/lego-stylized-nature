import * as THREE from 'three/webgpu'
import { color, time, positionWorld, sin, uniform } from 'three/tsl'

export function createWaterMaterial(waterConfig) {
    const material = new THREE.MeshStandardNodeMaterial()

    const uRippleStrength = uniform(waterConfig.rippleStrength)
    const uRippleSpeed = uniform(waterConfig.rippleSpeed)

    const ripple = sin(
        time.mul(uRippleSpeed)
            .add(positionWorld.x.mul(2.1))
            .add(positionWorld.z.mul(1.7))
    ).mul(uRippleStrength).add(1)

    material.colorNode = color(waterConfig.color).mul(ripple)
    material.roughness = 0.42
    material.metalness = 0

    material.userData.uniforms = { uRippleStrength, uRippleSpeed }

    return material
}
