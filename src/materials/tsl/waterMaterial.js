import * as THREE from 'three/webgpu'
import { color } from 'three/tsl'

export function createWaterMaterial(waterConfig) {
    const material = new THREE.MeshStandardNodeMaterial()

    material.colorNode = color(waterConfig.color)
    material.roughness = 0.42
    material.metalness = 0

    return material
}
