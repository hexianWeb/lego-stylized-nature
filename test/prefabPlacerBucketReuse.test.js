import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import PrefabPlacer from '../src/world/prefabs/PrefabPlacer.js'

function createVariantScene() {
  const scene = new THREE.Group()
  scene.add(new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: '#ffffff' })
  ))
  return scene
}

function createPlacer({
  manifest,
  biomes,
  width = 2,
  depth = 1,
  prefabCapacity = { default: 512, flora: 512 }
}) {
  const variantScene = createVariantScene()

  return new PrefabPlacer({
    config: {
      seed: 1,
      terrain: { width, depth, cellSize: 1, layerHeight: 1, waterLevel: 0 },
      placement: {
        rotationStep: Math.PI / 2,
        enableTrees: true,
        prefabCapacity
      }
    },
    biomeRegistry: {
      get(id) {
        return biomes[id]
      }
    },
    prefabRegistry: {
      get(id) {
        const entry = manifest[id]
        return entry ? { id, entry } : null
      },
      getVariantAsset() {
        return { scene: variantScene }
      }
    }
  })
}

function createTerrainMap(biomeIds) {
  return {
    getBiomeCell(x, z) {
      const biomeId = biomeIds[z][x]
      return { biomeId, weights: { [biomeId]: 1 } }
    },
    getSurfaceCell() {
      return { height: 4, slope: 0, isWater: false, isShore: false, isLava: false }
    }
  }
}

function collectInstancedMeshes(group) {
  const meshes = []
  group.traverse((node) => {
    if (node.isInstancedMesh) {
      meshes.push(node)
    }
  })
  return meshes
}

test('build reuses InstancedMesh objects across rebuilds', () => {
  const manifest = {
    testGrass: {
      category: 'flora',
      placement: { surface: 'land' },
      variants: [{ source: 'grassModel', weight: 1 }],
      randomRotation: false
    }
  }
  const biomes = {
    forest: { prefabs: [{ id: 'testGrass', density: 1 }] }
  }
  const terrainMap = createTerrainMap([['forest', 'forest']])
  const placer = createPlacer({ manifest, biomes, width: 2, depth: 1 })

  placer.build(terrainMap)
  const firstMeshes = collectInstancedMeshes(placer.group)

  placer.build(terrainMap)
  const secondMeshes = collectInstancedMeshes(placer.group)

  assert.equal(firstMeshes.length, 1)
  assert.equal(secondMeshes.length, 1)
  assert.equal(firstMeshes[0], secondMeshes[0])
})

test('build hides stale instances by lowering mesh count', () => {
  const manifest = {
    testGrass: {
      category: 'flora',
      placement: { surface: 'land' },
      variants: [{ source: 'grassModel', weight: 1 }],
      randomRotation: false
    }
  }
  const biomes = {
    forest: { prefabs: [{ id: 'testGrass', density: 1 }] },
    desert: { prefabs: [] }
  }
  const placer = createPlacer({ manifest, biomes, width: 2, depth: 1 })

  placer.build(createTerrainMap([['forest', 'forest']]))
  const mesh = collectInstancedMeshes(placer.group)[0]
  assert.equal(mesh.count, 2)

  placer.build(createTerrainMap([['forest', 'desert']]))
  assert.equal(mesh.count, 1)
})

test('build clamps instance count to configured prefab capacity', () => {
  const manifest = {
    testGrass: {
      category: 'flora',
      placement: { surface: 'land' },
      variants: [{ source: 'grassModel', weight: 1 }],
      randomRotation: false
    }
  }
  const biomes = {
    forest: { prefabs: [{ id: 'testGrass', density: 1 }] }
  }
  const placer = createPlacer({
    manifest,
    biomes,
    width: 4,
    depth: 1,
    prefabCapacity: { default: 512, flora: 2 }
  })
  const originalWarn = console.warn
  const warnings = []
  console.warn = (message) => warnings.push(message)

  try {
    placer.build(createTerrainMap([['forest', 'forest', 'forest', 'forest']]))
  } finally {
    console.warn = originalWarn
  }

  const mesh = collectInstancedMeshes(placer.group)[0]
  assert.equal(mesh.count, 2)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /testGrass/)
})
