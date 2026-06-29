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
