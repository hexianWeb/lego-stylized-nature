import { vec3 } from 'three/tsl'
import * as THREE from 'three/webgpu'

/**
 * Solid green MeshBasicNodeMaterial for WebGPU + InstancedMesh.
 * Adjust colorNode here when the grid look needs to change.
 */
export function createInstancedGridMaterial() {
  const material = new THREE.MeshBasicNodeMaterial()
  material.colorNode = vec3(0, 1, 0)
  return { material }
}
