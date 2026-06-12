import * as THREE from 'three/webgpu'

export function createLegoMaterial() {
  const material = new THREE.MeshPhysicalNodeMaterial()
  material.metalness = 0.0
  material.roughness = 0.42
  material.clearcoat = 0.65
  material.clearcoatRoughness = 0.28
  material.envMapIntensity = 0.8
  // material.sheen = 0.15
  // material.sheenRoughness = 0.6
  return material
}
