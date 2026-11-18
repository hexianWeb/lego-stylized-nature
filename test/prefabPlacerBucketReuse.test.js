import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import PrefabPlacer from '../src/world/prefabs/PrefabPlacer.js'
import WorldMaterials from '../src/world/WorldMaterials.js'
import { resolveTreeInstanceColor } from '../src/world/prefabs/treeMaterial.js'

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
    materials: new WorldMaterials(),
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
  assert.equal(firstMeshes[0].userData.streamingPrefab, true)
  assert.equal(firstMeshes[0].userData.prefabBucketKey, [...placer.meshBuckets.keys()][0])
  placer.dispose()
  placer.materials.dispose()
})

test('standalone variant instances are tagged for streamed renderer preparation', () => {
  const prefabEntry = {
    category: 'flora',
    placement: { surface: 'land' },
    variants: [{ source: 'grassModel' }]
  }
  const placer = createPlacer({ manifest: { grass: prefabEntry }, biomes: {} })
  const group = placer.buildVariantInstances(
    createVariantScene(),
    [{ position: [0, 1, 0], rotationY: 0 }],
    prefabEntry,
    null,
    'grass'
  )
  try {
    const meshes = collectInstancedMeshes(group)
    assert.equal(meshes.length, 1)
    assert.equal(meshes[0].userData.streamingPrefab, true)
    assert.equal(meshes[0].count, 1)
  } finally {
    group.traverse(mesh => mesh.isInstancedMesh && mesh.dispose())
    placer.dispose()
    placer.materials.dispose()
  }
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

test('tree and non-tree prefab visibility is independent, including after a rebuild', () => {
  const manifest = {
    tree: {
      category: 'tree',
      placement: { surface: 'land' },
      variants: [{ source: 'treeModel', weight: 1 }],
      randomRotation: false
    },
    rock: {
      category: 'rock',
      placement: { surface: 'land' },
      variants: [{ source: 'rockModel', weight: 1 }],
      randomRotation: false
    }
  }
  const biomes = {
    forest: { prefabs: [{ id: 'tree', density: 1 }] },
    desert: { prefabs: [{ id: 'rock', density: 1 }] }
  }
  const placer = createPlacer({ manifest, biomes })
  placer.config.placement.enablePrefabs = false
  placer.build(createTerrainMap([['forest', 'desert']]))

  const treeGroup = [...placer.variantGroups.values()].find((group) => group.userData.category === 'tree')
  const rockGroup = [...placer.variantGroups.values()].find((group) => group.userData.category === 'rock')
  assert.ok(treeGroup)
  assert.ok(rockGroup)
  assert.equal(treeGroup.visible, true)
  assert.equal(rockGroup.visible, false)

  placer.config.placement.enableTrees = false
  placer.syncVariantGroupVisibility()
  assert.equal(treeGroup.visible, false)
  assert.equal(rockGroup.visible, false)

  placer.config.placement.enablePrefabs = true
  placer.syncVariantGroupVisibility()
  assert.equal(treeGroup.visible, false)
  assert.equal(rockGroup.visible, true)

  placer.config.placement.enableTrees = true
  placer.syncVariantGroupVisibility()
  assert.equal(treeGroup.visible, true)
  assert.equal(rockGroup.visible, true)

  placer.build(createTerrainMap([['desert', 'desert']]))
  assert.equal(treeGroup.visible, false)
  assert.equal(rockGroup.visible, true)
  placer.config.placement.enableTrees = false
  placer.syncVariantGroupVisibility()
  placer.config.placement.enableTrees = true
  placer.syncVariantGroupVisibility()
  assert.equal(treeGroup.visible, false)
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

test('tree pools clamp every source mesh without slicing transforms or sharing mutable colors', () => {
  const biome = { trees: { leafColor: '#228833', trunkColor: '#775533' }, prefabs: [] }
  const placer = createPlacer({ manifest: {}, biomes: { forest: biome }, prefabCapacity: { tree: 2 } })
  const sourceScene = new THREE.Group()
  const geometry = new THREE.BoxGeometry()
  const material = new THREE.MeshBasicMaterial()
  for (const name of ['root', 'leaf']) {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = name
    sourceScene.add(mesh)
  }
  const transforms = Array.from({ length: 3 }, (_, i) => ({
    position: [i + 0.5, 5, 0.5], rotationY: 0, x: i, y: 4, z: 0,
  }))
  transforms.slice = () => assert.fail('transform arrays must not be copied per source mesh')
  const originalWarn = console.warn
  console.warn = () => {}
  try {
    placer.fillTransformBucket('tree:0:forest', sourceScene, transforms, { category: 'tree' }, null, 'tree', 'forest')
    const meshes = collectInstancedMeshes(placer.group)
    assert.equal(meshes.length, 2)
    meshes.forEach((mesh, index) => {
      assert.equal(mesh.count, 2)
      assert.deepEqual([...mesh.userData.chunkColumnPositions], [0.5, 0.5, 1.5, 0.5])
      for (let i = 0; i < mesh.count; i++) {
        const actual = new THREE.Color()
        mesh.getColorAt(i, actual)
        const expected = resolveTreeInstanceColor(sourceScene.children[index], biome, i, 4, 0, 1)
        assert.equal(actual.getHexString(), expected.getHexString())
      }
    })
  } finally {
    console.warn = originalWarn
    placer.dispose()
    placer.materials.dispose()
    geometry.dispose()
    material.dispose()
  }
})

test('reused prefab bounds cover expanded placements and refresh an existing box', () => {
  const manifest = {
    grass: { category: 'flora', placement: { surface: 'land' }, variants: [{ source: 'grassModel' }], randomRotation: false }
  }
  const biomes = { forest: { prefabs: [{ id: 'grass', density: 1 }] }, desert: { prefabs: [] } }
  const placer = createPlacer({ manifest, biomes, width: 8 })
  placer.build(createTerrainMap([['forest', ...Array(7).fill('desert')]]))
  const mesh = collectInstancedMeshes(placer.group)[0]
  const firstRadius = mesh.boundingSphere.radius
  mesh.computeBoundingBox()

  placer.build(createTerrainMap([Array(8).fill('forest')]))

  assert.equal(collectInstancedMeshes(placer.group)[0], mesh)
  assert.equal(mesh.count, 8)
  assert.ok(mesh.boundingSphere.radius > firstRadius)
  assert.ok(mesh.boundingSphere.containsPoint(new THREE.Vector3(7.5, 4, 0.5)))
  assert.ok(mesh.boundingBox.max.x >= 8)
  placer.dispose()
  placer.materials.dispose()
})
