import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three/webgpu'
import { warmupLandmarkPipelines } from '../src/world/landmarks/LandmarkPipelineWarmup.js'

function fixture() {
  const scene = new THREE.Scene()
  const world = new THREE.Group()
  world.visible = false
  world.position.set(12, 0, -9)
  scene.add(world)
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.set(12, 15, 20)
  camera.lookAt(12, 0, -9)
  camera.userData.focusDistance = 20
  const meshes = []
  const slots = Array.from({ length: 2 }, (_, index) => {
    const group = new THREE.Group()
    group.visible = index === 0
    group.position.set(index * 20, 0, -index * 5)
    const landmarkGroup = new THREE.Group()
    landmarkGroup.visible = false
    group.add(landmarkGroup)
    world.add(group)
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshBasicMaterial(), 1)
    mesh.count = index
    mesh.visible = index === 0
    mesh.userData.streamingPrefab = true
    if (index === 1)
      mesh.userData.landmarkOpacity = 0.25
    mesh.position.set(0.3, 0.5, 0.7)
    mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(index, index * 3, index * 7))
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
    landmarkGroup.add(mesh)
    meshes.push(mesh)
    return { group, landmarkRenderer: { group: landmarkGroup } }
  })
  const visibility = []
  scene.traverse(object => visibility.push([object, object.visible]))
  const saved = meshes.map(mesh => ({
    mesh,
    matrices: mesh.instanceMatrix.array.slice(),
    count: mesh.count,
    opacity: mesh.userData.landmarkOpacity,
    hasOpacity: Object.hasOwn(mesh.userData, 'landmarkOpacity'),
    boundingBox: mesh.boundingBox,
    boundingSphere: mesh.boundingSphere,
    matrix: mesh.matrix.clone(),
    position: mesh.position.clone(),
    geometry: mesh.geometry,
    material: mesh.material,
  }))
  return { scene, world, camera, meshes, slots, visibility, saved }
}

function assertRestored(f) {
  for (const [object, visible] of f.visibility)
    assert.equal(object.visible, visible)
  for (const state of f.saved) {
    const { mesh } = state
    assert.equal(mesh.count, state.count)
    assert.equal(mesh.frustumCulled, true)
    assert.deepEqual(mesh.instanceMatrix.array, state.matrices)
    assert.equal(mesh.boundingBox, state.boundingBox)
    assert.equal(mesh.boundingSphere, state.boundingSphere)
    assert.equal(mesh.userData.landmarkOpacity, state.opacity)
    assert.equal(Object.hasOwn(mesh.userData, 'landmarkOpacity'), state.hasOpacity)
    assert.deepEqual(mesh.position, state.position)
    assert.equal(mesh.geometry, state.geometry)
    assert.equal(mesh.material, state.material)
  }
}

test('warms the same pooled mesh objects in main and shadow render stages then restores their state', async () => {
  const f = fixture()
  let compileCount = 0
  let frameCount = 0
  const inspectTemporaryState = () => {
    for (const mesh of f.meshes) {
      assert.equal(mesh.count, 1)
      assert.equal(mesh.frustumCulled, false)
      assert.equal(mesh.userData.landmarkOpacity, 1)
      for (let ancestor = mesh; ancestor; ancestor = ancestor.parent)
        assert.equal(ancestor.visible, true)
      const instance = new THREE.Matrix4()
      mesh.getMatrixAt(0, instance)
      const point = new THREE.Vector3().setFromMatrixPosition(instance.premultiply(mesh.matrixWorld))
      const target = f.camera.getWorldPosition(new THREE.Vector3())
        .addScaledVector(f.camera.getWorldDirection(new THREE.Vector3()), 20)
      assert.ok(point.distanceTo(target) < 1e-5)
    }
  }
  const renderer = {
    async compileAsync(scene, camera) {
      assert.equal(scene, f.scene)
      assert.equal(camera, f.camera)
      compileCount++
      inspectTemporaryState()
    },
  }
  const result = await warmupLandmarkPipelines({
    renderer, scene: f.scene, camera: f.camera, slots: f.slots,
    async renderFrame() {
      frameCount++
      inspectTemporaryState()
      await Promise.resolve() // asynchronous preparation must finish before restore
      inspectTemporaryState()
    },
  })
  assert.deepEqual(result, { compiled: true, meshCount: 2 })
  assert.equal(compileCount, 1)
  assert.equal(frameCount, 1)
  assertRestored(f)
})

test('restores pooled objects on compilation or draw failure without disposing shared assets', async () => {
  for (const stage of ['compile', 'render']) {
    const f = fixture()
    let disposed = 0
    for (const mesh of f.meshes) {
      mesh.addEventListener('dispose', () => disposed++)
      mesh.geometry.addEventListener('dispose', () => disposed++)
      mesh.material.addEventListener('dispose', () => disposed++)
    }
    await assert.rejects(warmupLandmarkPipelines({
      renderer: { async compileAsync() { if (stage === 'compile') throw Error('compile failure') } },
      scene: f.scene, camera: f.camera, slots: f.slots,
      async renderFrame() { throw Error('render failure') },
    }), new RegExp(stage + ' failure'))
    assert.equal(disposed, 0)
    assertRestored(f)
  }
})

test('empty or unsupported warmup is a no-op', async () => {
  const f = fixture()
  assert.deepEqual(await warmupLandmarkPipelines({ renderer: {}, ...f }), { compiled: false, meshCount: 0 })
  assertRestored(f)
  assert.deepEqual(await warmupLandmarkPipelines({
    renderer: { compileAsync() { assert.fail('no actual meshes to compile') } },
    scene: f.scene, camera: f.camera, slots: [{ landmarkRenderer: { group: new THREE.Group() } }],
  }), { compiled: false, meshCount: 0 })
})
