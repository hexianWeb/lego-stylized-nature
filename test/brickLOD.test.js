import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import BrickLOD, { BRICK_LOD_DEFAULTS, createBrickLODGeometries, projectedStudPixels, selectBrickLOD } from '../src/world/bricks/BrickLOD.js'

// Load the shipped geometry, bypassing its image material in the Node runner.
const bytes = await readFile(new URL('../public/model/terrain/legoBlock2x2.glb', import.meta.url))
const loader = new GLTFLoader().register(() => ({
  name: 'geometry_test_material',
  loadMaterial: () => Promise.resolve(new THREE.MeshBasicMaterial()),
}))
const asset = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
let source
asset.scene.traverse((mesh) => {
  if (mesh.isMesh)
    source ??= mesh.geometry
})

function cameraAt(x = 0, y = 10, z = 0) {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 200)
  camera.position.set(x, y, z)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)
  return camera
}

const triangleCount = geometry => (geometry.index?.count ?? geometry.attributes.position.count) / 3

test('authored brick LOD reduces triangles and removes studs without opening the deck', () => {
  const { geometries, studDiameter, studLayout } = createBrickLODGeometries(source)
  assert.deepEqual(geometries.map(triangleCount), [172, 92, 20])
  assert.ok(studDiameter > 0.06 && studDiameter < 0.061)
  assert.ok(Math.abs(studLayout.pitch - 0.1) < 1e-4)
  assert.ok(Math.abs(studLayout.originX + 0.05) < 1e-4 && Math.abs(studLayout.originZ + 0.05) < 1e-4)
  assert.ok(Math.abs(studLayout.deckY - 0.101053) < 1e-6)
  const [full, simplified, body] = geometries
  const point = new THREE.Vector3()
  for (const geometry of [simplified, body]) {
    assert.ok(geometry.boundingBox.equals(full.boundingBox))
    const positions = geometry.attributes.position
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i)
      assert.ok(full.boundingBox.clone().expandByScalar(1e-7).containsPoint(point))
      if (geometry === body)
        assert.ok(point.y <= 0.101054)
    }
  }
  const material = new THREE.MeshBasicMaterial()
  const mesh = new THREE.Mesh(body, material)
  for (const x of [-0.05, 0, 0.05]) {
    for (const z of [-0.05, 0, 0.05]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 1, z), new THREE.Vector3(0, -1, 0))
      const hit = ray.intersectObject(mesh)[0]
      assert.ok(hit, 'deck remains closed under removed studs')
      assert.ok(Math.abs(hit.point.y - 0.101053) < 1e-6)
    }
  }
  simplified.dispose()
  body.dispose()
  material.dispose()
})

test('orthographic stud coverage follows zoom, resolution and tilt, not distance', () => {
  const camera = cameraAt()
  const initial = projectedStudPixels(camera, 1000, 1000, 0.06)
  assert.ok(Math.abs(initial - 6) < 1e-6)
  camera.position.multiplyScalar(4)
  camera.updateMatrixWorld(true)
  assert.equal(projectedStudPixels(camera, 1000, 1000, 0.06), initial)
  camera.zoom = 2
  camera.updateProjectionMatrix()
  assert.equal(projectedStudPixels(camera, 1000, 1000, 0.06), initial * 2)
  assert.equal(projectedStudPixels(camera, 2000, 2000, 0.06), initial * 4)
  const tilted = cameraAt(0, 5, Math.sqrt(75))
  assert.ok(Math.abs(projectedStudPixels(tilted, 1000, 1000, 0.06) - 3) < 1e-6)
})

test('perspective stud coverage matches orthographic coverage at equivalent focus frustum height', () => {
  const fov = 22
  const frustumHeight = 10
  const distance = frustumHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fov * 0.5)))
  const perspective = new THREE.PerspectiveCamera(fov, 1, 0.1, 200)
  perspective.position.set(0, distance, 0)
  perspective.lookAt(0, 0, 0)
  perspective.updateProjectionMatrix()
  perspective.updateMatrixWorld(true)
  perspective.userData.focusDistance = distance

  assert.ok(Math.abs(projectedStudPixels(perspective, 1000, 1000, 0.06) - 6) < 1e-5)
  perspective.userData.focusDistance = distance * 2
  assert.ok(Math.abs(projectedStudPixels(perspective, 1000, 1000, 0.06) - 3) < 1e-5)
})

test('LOD hysteresis stabilizes both boundaries and supports large zoom changes', () => {
  const settings = BRICK_LOD_DEFAULTS
  assert.equal(selectBrickLOD(10, null, settings), 0)
  assert.equal(selectBrickLOD(6, null, settings), 1)
  assert.equal(selectBrickLOD(2, null, settings), 2)
  assert.equal(selectBrickLOD(7, 0, settings), 0)
  assert.equal(selectBrickLOD(6.7, 0, settings), 1)
  assert.equal(selectBrickLOD(8.5, 1, settings), 1)
  assert.equal(selectBrickLOD(9.3, 1, settings), 0)
  assert.equal(selectBrickLOD(3.5, 1, settings), 1)
  assert.equal(selectBrickLOD(3.3, 1, settings), 2)
  assert.equal(selectBrickLOD(4.5, 2, settings), 2)
  assert.equal(selectBrickLOD(4.7, 2, settings), 1)
  assert.equal(selectBrickLOD(1, 0, settings), 2)
  assert.equal(selectBrickLOD(20, 2, settings), 0)
})

test('shared LOD preserves instance data and bounds across switching and new chunk pages', () => {
  const settings = { ...BRICK_LOD_DEFAULTS }
  const lod = new BrickLOD(source, settings)
  const group = new THREE.Group()
  const material = new THREE.MeshBasicMaterial()
  const mesh = new THREE.InstancedMesh(source, material, 2)
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(1, 2, 3))
  mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(4, 5, 6))
  mesh.setColorAt(0, new THREE.Color('red'))
  mesh.computeBoundingSphere()
  mesh.castShadow = true
  group.add(mesh)
  const matrices = mesh.instanceMatrix
  const colors = mesh.instanceColor
  const bounds = mesh.boundingSphere.clone()
  const renderer = { getDrawingBufferSize: target => target.set(1000, 1000) }
  const camera = cameraAt()
  lod.update(group, camera, renderer)
  assert.equal(mesh.geometry, lod.geometries[1])
  camera.zoom = 0.25
  camera.updateProjectionMatrix()
  lod.update(group, camera, renderer)
  assert.equal(mesh.geometry, lod.geometries[2])
  const newPage = new THREE.InstancedMesh(source, material, 1)
  group.add(newPage)
  lod.update(group, camera, renderer)
  assert.equal(newPage.geometry, lod.geometries[2])
  newPage.computeBoundingSphere()
  settings.enabled = false
  lod.update(group, camera, renderer)
  assert.equal(mesh.geometry, source)
  assert.equal(newPage.geometry, source)
  assert.equal(mesh.instanceMatrix, matrices)
  assert.equal(mesh.instanceColor, colors)
  assert.equal(mesh.count, 2)
  assert.equal(mesh.castShadow, true)
  assert.ok(mesh.boundingSphere.equals(bounds))
  assert.ok(newPage.boundingSphere.equals(source.boundingSphere))
  assert.equal(group.children.length, 2)
  mesh.dispose()
  newPage.dispose()
  material.dispose()
  lod.dispose()
})

test('LOD owns only derived geometry, leaving the source to World', () => {
  const lod = new BrickLOD(source)
  const disposals = [0, 0, 0]
  const listeners = lod.geometries.map((geometry, i) => {
    const listener = () => disposals[i]++
    geometry.addEventListener('dispose', listener)
    return listener
  })
  lod.dispose()
  assert.deepEqual(disposals, [0, 1, 1])
  lod.geometries.forEach((geometry, i) => geometry.removeEventListener('dispose', listeners[i]))
})

test('plain geometry has a safe full-detail fallback', () => {
  const box = new THREE.BoxGeometry(0.2, 0.095, 0.2)
  const lod = new BrickLOD(box)
  assert.deepEqual(lod.geometries, [box])
  lod.dispose()
  box.dispose()
})
