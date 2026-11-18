import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import ChunkRenderSlot from '../src/world/chunks/ChunkRenderSlot.js'

function assertClose(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be close to ${expected}`)
}

function createRenderer() {
  return {
    group: new THREE.Group(),
    build() {},
    updateInstanceColors() {},
    dispose() {}
  }
}

test('chunk render slot delays prefab build until requested and resets on repopulate', () => {
  let prefabBuilds = 0
  const prefabPlacer = {
    group: new THREE.Group(),
    build() {
      prefabBuilds++
    },
    dispose() {}
  }
  const slot = new ChunkRenderSlot({
    index: 0,
    chunkSize: 64,
    cellSize: 0.2,
    terrainRenderer: createRenderer(),
    heightfieldAO: { build() {} },
    prefabPlacer,
    waterRenderer: createRenderer(),
    lavaRenderer: createRenderer()
  })

  slot.populate({
    coord: { x: 0, z: 0 },
    terrainMap: {},
    placements: [],
    colorResolver: {}
  })

  assert.deepEqual(
    { x: slot.group.position.x, z: slot.group.position.z },
    { x: 0, z: 0 }
  )

  slot.populate({
    coord: { x: 1, z: -1 },
    terrainMap: {},
    placements: [],
    colorResolver: {},
    debugSpacing: 3
  })

  assertClose(slot.group.position.x, 64 * 0.2 + 3)
  assertClose(slot.group.position.z, -(64 * 0.2 + 3))

  assert.equal(prefabBuilds, 0)
  assert.equal(prefabPlacer.group.visible, false)

  slot.ensurePrefabsBuilt()
  slot.ensurePrefabsBuilt()
  assert.equal(prefabBuilds, 1)

  slot.populate({
    coord: { x: 1, z: 0 },
    terrainMap: {},
    placements: [],
    colorResolver: {}
  })
  assert.equal(prefabPlacer.group.visible, false)

  slot.ensurePrefabsBuilt()
  assert.equal(prefabBuilds, 2)
})

test('terrain, liquid pages and deferred prefabs follow the same column progress', (t) => {
  const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8)
  const material = new THREE.MeshBasicMaterial()
  const meshes = []
  function makeRenderer(height) {
    const renderer = createRenderer()
    const mesh = new THREE.InstancedMesh(geometry, material, 1)
    mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0.5, height, 0.5))
    renderer.group.add(mesh)
    meshes.push(mesh)
    return renderer
  }
  const terrain = makeRenderer(2)
  const water = makeRenderer(3)
  const lava = makeRenderer(4)
  const prefab = createRenderer()
  prefab.build = () => {
    const mesh = new THREE.InstancedMesh(geometry, material, 1)
    mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0.5, 5, 0.5))
    prefab.group.add(mesh)
    meshes.push(mesh)
  }
  const slot = new ChunkRenderSlot({
    index: 0,
    chunkSize: 2,
    cellSize: 1,
    terrainRenderer: terrain,
    heightfieldAO: { build() {} },
    waterRenderer: water,
    lavaRenderer: lava,
    prefabPlacer: prefab,
  })
  t.after(() => {
    slot.dispose()
    meshes.forEach(mesh => mesh.dispose())
    geometry.dispose()
    material.dispose()
  })
  slot.populate({ coord: { x: 0, z: 0 }, terrainMap: {}, placements: [], colorResolver: {} })
  slot.startLoading({ x: 1, z: 0 }, { columnDuration: 1, waveDuration: 1, riseDistance: 2 })
  slot.updateTransition(0.5)
  slot.ensurePrefabsBuilt()
  slot.setPrefabsVisible(true)

  assert.deepEqual(meshes.map(mesh => mesh.instanceMatrix.array[5]), [0.5, 0.5, 0.5, 0.5])
  assert.deepEqual(meshes.map(mesh => mesh.instanceMatrix.array[13]), [0, 0.5, 1, 1.5])
  assert.equal(prefab.group.visible, true)
  assert.equal(slot.group.visible, true)

  slot.populate({ coord: { x: -1, z: 0 }, terrainMap: {}, placements: [], colorResolver: {} })
  assert.equal(slot.columnTransition, null)
  assert.deepEqual(meshes.map(mesh => mesh.instanceMatrix.array[13]), [2, 3, 4, 5])
  assert.equal(prefab.group.visible, false)
})
