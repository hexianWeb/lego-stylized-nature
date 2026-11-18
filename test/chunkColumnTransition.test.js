import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import ChunkColumnTransition from '../src/world/chunks/ChunkColumnTransition.js'
import PrefabPlacer from '../src/world/prefabs/PrefabPlacer.js'

const settings = { columnDuration: 1, waveDuration: 1, riseDistance: 2 }

test('reuses an existing sphere without recomputing bounds and covers every animated vertex', (t) => {
  const { mesh, group } = createMesh(t, [[0.5, 10, 0.5], [1.5, -1, 0.5]])
  mesh.boundingBox = null
  const originalSphere = mesh.boundingSphere.clone()
  mesh.computeBoundingBox = () => assert.fail('must reuse existing bounds')
  mesh.computeBoundingSphere = () => assert.fail('must reuse existing sphere')
  const transition = new ChunkColumnTransition({ chunkSize: 2, cellSize: 1 })
  transition.start(1, { x: 1, z: 0 }, settings)
  transition.capture(group)
  const position = mesh.geometry.attributes.position
  const matrix = new THREE.Matrix4()
  const point = new THREE.Vector3()
  for (let step = 0; step < 20; step++) {
    for (let instance = 0; instance < mesh.count; instance++) {
      mesh.getMatrixAt(instance, matrix)
      for (let vertex = 0; vertex < position.count; vertex++) {
        point.fromBufferAttribute(position, vertex).applyMatrix4(matrix)
        assert.ok(mesh.boundingBox.containsPoint(point))
        assert.ok(mesh.boundingSphere.containsPoint(point))
      }
    }
    transition.update(0.09)
  }
  transition.update(2)
  assert.equal(mesh.boundingBox, null)
  assert.deepEqual(mesh.boundingSphere, originalSphere)
})

test('discarding a hidden transition does not restore or upload obsolete matrices', (t) => {
  const { mesh, group } = createMesh(t, [[0.5, 2, 0.5]])
  const bounds = mesh.boundingBox.clone()
  const transition = new ChunkColumnTransition({ chunkSize: 2, cellSize: 1 })
  transition.start(1, { x: 1, z: 0 }, settings)
  transition.capture(group)
  transition.update(0.2)
  const matrices = mesh.instanceMatrix.array.slice()
  const version = mesh.instanceMatrix.version
  transition.discard()
  assert.deepEqual(mesh.instanceMatrix.array, matrices)
  assert.equal(mesh.instanceMatrix.version, version)
  assert.equal(mesh.instanceMatrix.updateRanges.length, 0)
  assert.deepEqual(mesh.boundingBox, bounds)
  assert.equal(transition.meshStates.size, 0)
})

function createMesh(t, positions) {
  const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8)
  const material = new THREE.MeshBasicMaterial()
  const mesh = new THREE.InstancedMesh(geometry, material, positions.length + 2)
  const matrix = new THREE.Matrix4()
  positions.forEach((position, i) => mesh.setMatrixAt(i, matrix.makeTranslation(...position)))
  mesh.count = positions.length
  mesh.computeBoundingBox()
  mesh.computeBoundingSphere()
  const group = new THREE.Group()
  group.add(mesh)
  t.after(() => {
    mesh.dispose()
    geometry.dispose()
    material.dispose()
  })
  return { mesh, group }
}

test('loads from the entering edge and keeps all layers of a column together', (t) => {
  const { mesh, group } = createMesh(t, [[0.5, 1, 0.5], [0.5, 2, 0.5], [1.5, 2, 0.5]])
  const original = mesh.instanceMatrix.array.slice()
  const transition = new ChunkColumnTransition({ chunkSize: 2, cellSize: 1 })
  transition.start(1, { x: 1, z: 0 }, settings)
  transition.capture(group)
  assert.equal(mesh.instanceMatrix.array[0], 0)
  assert.equal(mesh.instanceMatrix.array[13], -2)

  assert.equal(transition.update(0.5), false)
  const matrices = mesh.instanceMatrix.array
  assert.equal(matrices[5], 0.5)
  assert.equal(matrices[16 + 5], 0.5)
  assert.equal(matrices[13], -0.5)
  assert.equal(matrices[16 + 13], 0)
  assert.equal(matrices[32 + 5], 0)
  assert.equal(matrices[32 + 13], -2)

  assert.equal(transition.update(2), true)
  assert.deepEqual(mesh.instanceMatrix.array, original)
  assert.equal(transition.meshStates.size, 0)
  const version = mesh.instanceMatrix.version
  transition.update(1)
  assert.equal(mesh.instanceMatrix.version, version)
})

test('negative travel reverses the wave and diagonal ties use the X axis', () => {
  const negative = new ChunkColumnTransition({ chunkSize: 3, cellSize: 1 })
  negative.start(1, { x: -1, z: 0 }, settings)
  negative.update(0.5)
  assert.equal(negative.progress[0], 0)
  assert.equal(negative.progress[2], 0.5)
  assert.equal(negative.progress[8], 0.5)

  const diagonal = new ChunkColumnTransition({ chunkSize: 3, cellSize: 1 })
  diagonal.start(1, { x: 1, z: 1 }, settings)
  diagonal.update(0.75)
  assert.ok(diagonal.progress[0] > diagonal.progress[2])
  assert.equal(diagonal.progress[0], diagonal.progress[6])
  assert.equal(diagonal.progress[2], diagonal.progress[8])
  assert.equal(diagonal.progress[8], 0)

  const backward = new ChunkColumnTransition({ chunkSize: 3, cellSize: 1 })
  backward.start(1, { x: 0, z: -1 }, settings)
  backward.update(0.5)
  assert.equal(backward.progress[0], 0)
  assert.equal(backward.progress[6], 0.5)
})

test('all diagonal quadrants reveal whole strips along the dominant axis', () => {
  for (const direction of [
    { x: 2, z: 1 }, { x: -2, z: 1 }, { x: 2, z: -1 }, { x: -2, z: -1 },
    { x: 1, z: 2 }, { x: -1, z: 2 }, { x: 1, z: -2 }, { x: -1, z: -2 },
  ]) {
    const diagonal = new ChunkColumnTransition({ chunkSize: 4, cellSize: 1 })
    const cardinal = new ChunkColumnTransition({ chunkSize: 4, cellSize: 1 })
    const alongX = Math.abs(direction.x) > Math.abs(direction.z)
    diagonal.start(1, direction, settings)
    cardinal.start(1, alongX ? { x: Math.sign(direction.x), z: 0 } : { x: 0, z: Math.sign(direction.z) }, settings)
    // Later aircraft steering must not change an already-started wave.
    direction.x *= -1
    direction.z *= -1
    for (const delta of [0.1, 0.4, 0.5, 1.1]) {
      diagonal.update(delta)
      cardinal.update(delta)
      assert.deepEqual(diagonal.progress, cardinal.progress)
    }
  }
})

test('unloads from the trailing edge without hiding the whole mesh at once', (t) => {
  const { mesh, group } = createMesh(t, [[0.5, 2, 0.5], [1.5, 2, 0.5]])
  const transition = new ChunkColumnTransition({ chunkSize: 2, cellSize: 1, initiallyVisible: true })
  transition.start(0, { x: 1, z: 0 }, settings)
  transition.capture(group)
  assert.equal(mesh.instanceMatrix.array[13], 2)
  assert.equal(transition.update(0.5), false)
  assert.equal(mesh.instanceMatrix.array[5], 0.5)
  assert.equal(mesh.instanceMatrix.array[13], 0)
  assert.equal(mesh.instanceMatrix.array[16 + 5], 1)
  assert.equal(mesh.instanceMatrix.array[16 + 13], 2)
  assert.equal(group.visible, true)
  assert.equal(transition.update(2), true)
  assert.equal(mesh.instanceMatrix.array[5], 0)
  assert.equal(mesh.instanceMatrix.array[16 + 5], 0)
})

test('interrupting either transition preserves the current transforms and original matrices', (t) => {
  const { mesh, group } = createMesh(t, [[0.5, 2, 0.5], [1.5, 2, 0.5]])
  const original = mesh.instanceMatrix.array.slice()
  const transition = new ChunkColumnTransition({ chunkSize: 2, cellSize: 1 })
  transition.start(1, { x: 1, z: 0 }, settings)
  transition.capture(group)
  transition.update(0.5)
  const rising = mesh.instanceMatrix.array.slice()
  transition.start(0, { x: 1, z: 0 }, settings)
  transition.capture(group)
  assert.deepEqual(mesh.instanceMatrix.array, rising)
  transition.update(0.1)
  assert.ok(mesh.instanceMatrix.array[13] < rising[13])
  const sinking = mesh.instanceMatrix.array.slice()
  transition.start(1, { x: -1, z: 0 }, settings)
  assert.deepEqual(mesh.instanceMatrix.array, sinking)
  transition.update(3)
  assert.deepEqual(mesh.instanceMatrix.array, original)
})

test('repeated reversals keep pending matrix upload ranges bounded', (t) => {
  const { mesh, group } = createMesh(t, [[0.5, 2, 0.5], [1.5, 2, 0.5]])
  const original = mesh.instanceMatrix.array.slice()
  const transition = new ChunkColumnTransition({ chunkSize: 2, cellSize: 1 })
  transition.start(1, { x: 1, z: 0 }, settings)
  transition.capture(group)
  for (let i = 0; i < 40; i++) {
    transition.update(0.02)
    transition.start(i % 2, { x: 1, z: 0 }, settings)
    assert.ok(mesh.instanceMatrix.updateRanges.length <= 1)
  }
  transition.reset()
  assert.deepEqual(mesh.instanceMatrix.array, original)
  assert.equal(mesh.instanceMatrix.updateRanges.length, 0)
})

test('animation bounds cover the lowered columns and restore precisely after loading', (t) => {
  const { mesh, group } = createMesh(t, [[0.5, 10, 0.5], [1.5, 12, 0.5]])
  const box = mesh.boundingBox.clone()
  const sphere = mesh.boundingSphere.clone()
  const transition = new ChunkColumnTransition({ chunkSize: 2, cellSize: 1 })
  transition.start(1, { x: 1, z: 0 }, settings)
  transition.capture(group)
  const expandedBounds = mesh.boundingBox
  assert.ok(mesh.boundingSphere.containsPoint(new THREE.Vector3(0.5, -2, 0.5)))
  assert.ok(mesh.boundingBox.containsPoint(new THREE.Vector3(1.5, 12.4, 0.5)))
  transition.update(0.5)
  assert.equal(mesh.boundingBox, expandedBounds)
  transition.update(3)
  assert.deepEqual(mesh.boundingBox, box)
  assert.deepEqual(mesh.boundingSphere, sphere)
})

test('offset prefab submeshes use the placement anchor instead of their own origin', (t) => {
  const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2)
  const material = new THREE.MeshBasicMaterial()
  const source = new THREE.Group()
  const stem = new THREE.Mesh(geometry, material)
  const crown = new THREE.Mesh(geometry, material)
  stem.position.set(0, 0, 0)
  crown.position.set(1.2, 1, 0)
  source.add(stem, crown)
  const placer = new PrefabPlacer({
    config: { placement: {} },
    biomeRegistry: {},
    prefabRegistry: {},
    materials: { resolvePrefabMaterial: sourceMaterial => sourceMaterial },
  })
  const group = placer.buildVariantInstances(source, [{ position: [0.5, 2, 0.5], rotationY: 0 }], {})
  t.after(() => {
    group.traverse(mesh => mesh.isInstancedMesh && mesh.dispose())
    geometry.dispose()
    material.dispose()
  })
  const transition = new ChunkColumnTransition({ chunkSize: 2, cellSize: 1 })
  transition.start(1, { x: 1, z: 0 }, settings)
  transition.update(0.5)
  transition.capture(group)
  for (const mesh of group.children) {
    assert.deepEqual(mesh.userData.chunkColumnPositions, new Float32Array([0.5, 0.5]))
    assert.equal(mesh.instanceMatrix.array[5], 0.5)
  }
  assert.equal(group.children[1].instanceMatrix.array[13] - group.children[0].instanceMatrix.array[13], 0.5)
})

test('one-cell and zero-duration transitions settle and invalid time never corrupts matrices', (t) => {
  const { mesh, group } = createMesh(t, [[0.5, 1, 0.5]])
  const transition = new ChunkColumnTransition({ chunkSize: 1, cellSize: 1 })
  transition.start(1, { x: -1, z: 0 }, { ...settings, columnDuration: 0 })
  transition.capture(group)
  assert.equal(transition.update(0), true)
  assert.equal(mesh.instanceMatrix.array[13], 1)
  transition.start(0, { x: NaN, z: Infinity }, { columnDuration: NaN, waveDuration: NaN, riseDistance: NaN })
  transition.capture(group)
  transition.update(NaN)
  assert.ok([...mesh.instanceMatrix.array].every(Number.isFinite))
  assert.equal(transition.update(2), true)
})
