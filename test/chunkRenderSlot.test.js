import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import ChunkRenderSlot from '../src/world/chunks/ChunkRenderSlot.js'

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
