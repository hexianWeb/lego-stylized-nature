import * as THREE from 'three/webgpu'

export function extractBrickGeometry(gltf, cellSize) {
  let sourceMesh = null
  gltf?.scene?.traverse((child) => {
    if (child.isMesh && !sourceMesh) {
      sourceMesh = child
    }
  })

  if (!sourceMesh) {
    return null
  }

  const geometry = sourceMesh.geometry.clone()
  geometry.computeBoundingBox()
  const size = new THREE.Vector3()
  geometry.boundingBox.getSize(size)

  const scale = cellSize / size.x
  geometry.scale(scale, scale, scale)

  return geometry
}
