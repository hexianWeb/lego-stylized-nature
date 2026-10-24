import * as THREE from 'three/webgpu'

/**
 * Prepare the actual pooled landmark objects, including their shadow draws.
 * renderFrame must drain any asynchronous render preparation before resolving;
 * the pooled objects stay visible/renderable until that promise settles.
 */
export async function warmupLandmarkPipelines({ renderer, scene, camera, slots, renderFrame = null }) {
  if (typeof renderer?.compileAsync !== 'function' || !scene || !camera)
    return { compiled: false, meshCount: 0 }

  const meshes = new Set()
  for (const slot of slots ?? []) {
    slot.landmarkRenderer?.group?.traverse((object) => {
      if (object.isInstancedMesh && object.instanceMatrix.count > 0)
        meshes.add(object)
    })
  }
  if (!meshes.size)
    return { compiled: false, meshCount: 0 }

  const visibility = new Map()
  const snapshots = []
  for (const mesh of meshes) {
    for (let ancestor = mesh; ancestor; ancestor = ancestor.parent) {
      if (!visibility.has(ancestor))
        visibility.set(ancestor, ancestor.visible)
    }
    snapshots.push({
      mesh,
      count: mesh.count,
      frustumCulled: mesh.frustumCulled,
      matrices: mesh.instanceMatrix.array.slice(),
      boundingBox: mesh.boundingBox,
      boundingSphere: mesh.boundingSphere,
      hasOpacity: Object.hasOwn(mesh.userData, 'landmarkOpacity'),
      opacity: mesh.userData.landmarkOpacity,
    })
  }

  const direction = camera.getWorldDirection(new THREE.Vector3())
  const origin = camera.getWorldPosition(new THREE.Vector3())
  const distance = Math.max(camera.near * 4, camera.userData.focusDistance ?? 10)
  const point = origin.addScaledVector(direction, distance)
  const worldMatrix = new THREE.Matrix4().makeScale(0.05, 0.05, 0.05)
  worldMatrix.setPosition(point)
  const localMatrix = new THREE.Matrix4()

  try {
    for (const ancestor of visibility.keys())
      ancestor.visible = true
    for (const { mesh } of snapshots) {
      mesh.updateWorldMatrix(true, false)
      localMatrix.copy(mesh.matrixWorld).invert().multiply(worldMatrix)
      mesh.count = 1
      mesh.frustumCulled = false
      mesh.userData.landmarkOpacity = 1
      mesh.setMatrixAt(0, localMatrix)
      mesh.instanceMatrix.clearUpdateRanges()
      mesh.instanceMatrix.needsUpdate = true
      // Use temporary bounds without mutating an existing saved bounding object.
      mesh.boundingBox = null
      mesh.boundingSphere = null
      mesh.computeBoundingBox()
      mesh.computeBoundingSphere()
    }
    await renderer.compileAsync(scene, camera)
    if (renderFrame)
      await renderFrame()
    return { compiled: true, meshCount: meshes.size }
  }
  finally {
    for (const state of snapshots) {
      const { mesh } = state
      mesh.count = state.count
      mesh.frustumCulled = state.frustumCulled
      mesh.instanceMatrix.array.set(state.matrices)
      // The GPU may contain dummy matrices now: schedule a full restoration.
      mesh.instanceMatrix.clearUpdateRanges()
      mesh.instanceMatrix.needsUpdate = true
      mesh.boundingBox = state.boundingBox
      mesh.boundingSphere = state.boundingSphere
      if (state.hasOpacity)
        mesh.userData.landmarkOpacity = state.opacity
      else
        delete mesh.userData.landmarkOpacity
    }
    for (const [ancestor, visible] of visibility)
      ancestor.visible = visible
  }
}
