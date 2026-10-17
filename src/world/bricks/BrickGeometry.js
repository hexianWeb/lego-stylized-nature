import * as THREE from 'three/webgpu'

/**
 * Extract a `BufferGeometry` from a loaded GLTF asset.
 *
 * @param {{ scene?: THREE.Object3D }} gltf - Loaded GLTF asset.
 * @param {number} cellSize - World unit width of one build cell (currently informational).
 * @param {string | null} [meshName] - Optional mesh name to pick. When null,
 *   the first mesh encountered is used (legacy behavior, backward compatible).
 * @returns {THREE.BufferGeometry | null}
 */
export function extractBrickGeometry(gltf, cellSize, meshName = null) {
  let sourceMesh = null

  gltf?.scene?.traverse((child) => {
    if (!child.isMesh) {
      return
    }
    if (meshName) {
      if (child.name === meshName && !sourceMesh) {
        sourceMesh = child
      }
    } else if (!sourceMesh) {
      sourceMesh = child
    }
  })

  if (!sourceMesh) {
    return null
  }

  return sourceMesh.geometry.clone()
}
