import * as THREE from 'three/webgpu'

export function createLegoMaterial() {
  const material = new THREE.MeshStandardNodeMaterial()
  material.roughness = 0.42
  material.metalness = 0
  return material
}
