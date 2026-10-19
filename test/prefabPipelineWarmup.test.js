import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import WorldMaterials from '../src/world/WorldMaterials.js'
import PrefabPlacer from '../src/world/prefabs/PrefabPlacer.js'
import { biomePrefabs } from '../src/assets/manifests/biomePrefabs.js'
import {
  buildPrefabPipelineWarmupGroup,
  warmupPrefabPipelines
} from '../src/world/prefabs/PrefabPipelineWarmup.js'

function createScene(meshName, material = new THREE.MeshBasicMaterial({ color: '#808080' })) {
  const scene = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
  mesh.name = meshName
  scene.add(mesh)
  return scene
}

function createRegistry(manifest, scenes) {
  return {
    manifest,
    get(prefabId) {
      const entry = manifest[prefabId]
      return entry ? { id: prefabId, entry } : null
    },
    getVariantAsset(prefabId, variantIndex) {
      const source = manifest[prefabId].variants[variantIndex].source
      return { scene: scenes[source] }
    }
  }
}

function collectWarmupMeshes(group) {
  const meshes = []
  group.traverse((node) => {
    if (node.isInstancedMesh) {
      meshes.push(node)
    }
  })
  return meshes
}

test('builds one-instance warmup meshes for prefab material modes', () => {
  const manifest = {
    cactus: {
      ...biomePrefabs.desertCactusSmall,
      variants: [{ source: 'cactusModel', weight: 1 }]
    },
    plainProp: {
      category: 'prop',
      placement: { surface: 'land' },
      variants: [{ source: 'plainModel', weight: 1 }]
    },
    tintedRock: {
      category: 'rock',
      placement: { surface: 'land' },
      variants: [{ source: 'tintedModel', weight: 1 }],
      biomeTints: {
        forest: { color: '#7a8178', strength: 0.35 }
      }
    },
    tree: {
      category: 'tree',
      placement: { surface: 'land', biomes: ['forest'] },
      variants: [{ source: 'treeModel', weight: 1 }]
    },
    flower: {
      category: 'flora',
      placement: { surface: 'land' },
      variants: [{ source: 'flowerModel', weight: 1 }],
      instanceColors: {
        meshNameSuffix: '_InstanceColor',
        palette: ['#ff0000']
      }
    }
  }
  const registry = createRegistry(manifest, {
    cactusModel: createScene('cactus'),
    plainModel: createScene('plain'),
    tintedModel: createScene('rock'),
    treeModel: createScene('leaf'),
    flowerModel: createScene('petal_InstanceColor')
  })

  const materials = new WorldMaterials()
  const config = { placement: { prefabCapacity: { prop: 192, rock: 128, tree: 64, flora: 32, plant: 32 } } }
  const group = buildPrefabPipelineWarmupGroup({ prefabRegistry: registry, materials, config })
  const meshes = collectWarmupMeshes(group)
  const modes = meshes.map((mesh) => mesh.userData.prefabWarmupMaterialMode).sort()

  assert.ok(modes.includes('source'))
  assert.ok(modes.includes('tint'))
  assert.ok(modes.includes('tree'))
  assert.ok(modes.includes('instanceColor'))
  assert.ok(meshes.every((mesh) => mesh.count === 1))
  assert.ok(meshes.every((mesh) => mesh.userData.streamingPrefab !== true))
  for (const mesh of meshes) {
    const expected = mesh.name.endsWith(':plain') ? 192
      : mesh.name.endsWith(':rock') ? 128
        : mesh.name.endsWith(':leaf') ? 64
          : 32
    assert.equal(mesh.instanceMatrix.count, expected)
    if (mesh.instanceColor) assert.equal(mesh.instanceColor.count, expected)
  }
  assert.ok(meshes.every((mesh) => !mesh.frustumCulled && mesh.receiveShadow))
  for (const mesh of meshes) {
    assert.equal(mesh.castShadow, mesh.name.endsWith(':leaf') || mesh.name.endsWith(':cactus'))
  }
  assert.ok(meshes.filter((mesh) => mesh.instanceColor).length >= 2)
  group.traverse((mesh) => mesh.isInstancedMesh && mesh.dispose())
  materials.dispose()
})

test('warmup capacities match actual prefab pools for default and category settings', () => {
  const cases = [
    { category: 'flora', capacities: undefined, expected: 512 },
    { category: 'flora', capacities: { default: 96 }, expected: 96 },
    { category: 'flora', capacities: { default: 96, flora: 32 }, expected: 32 },
    { category: undefined, capacities: { default: 64, flora: 32 }, expected: 64 },
    { category: 'prop', capacities: { flora: 32 }, expected: 512 }
  ]
  for (const { category, capacities, expected } of cases) {
    const materials = new WorldMaterials()
    const manifest = {
      grass: {
        category,
        placement: { surface: 'land' },
        variants: [{ source: 'grassModel' }],
        randomRotation: false
      }
    }
    const registry = createRegistry(manifest, { grassModel: createScene('grass') })
    const config = {
      seed: 1,
      terrain: { width: 1, depth: 1, cellSize: 1, layerHeight: 1, waterLevel: 0 },
      placement: { prefabCapacity: capacities }
    }
    const placer = new PrefabPlacer({
      config,
      materials,
      prefabRegistry: registry,
      biomeRegistry: { get: () => ({ prefabs: [{ id: 'grass', density: 1 }] }) }
    })
    const group = buildPrefabPipelineWarmupGroup({ prefabRegistry: registry, materials, config })
    try {
      placer.build({
        getBiomeCell: () => ({ biomeId: 'forest', weights: { forest: 1 } }),
        getSurfaceCell: () => ({ height: 1, slope: 0, isWater: false, isShore: false, isLava: false })
      })
      const [actualMesh] = collectWarmupMeshes(placer.group)
      const [warmupMesh] = collectWarmupMeshes(group)
      assert.equal(actualMesh.instanceMatrix.count, expected)
      assert.equal(warmupMesh.instanceMatrix.count, actualMesh.instanceMatrix.count)
      assert.equal(warmupMesh.count, 1)
      assert.equal(warmupMesh.userData.streamingPrefab, undefined)
    } finally {
      placer.dispose()
      group.traverse(mesh => mesh.isInstancedMesh && mesh.dispose())
      materials.dispose()
    }
  }
})

test('warmup compiles prefab group and removes it from the scene', async () => {
  const manifest = {
    plainProp: {
      category: 'prop',
      placement: { surface: 'land' },
      variants: [{ source: 'plainModel', weight: 1 }]
    }
  }
  const registry = createRegistry(manifest, {
    plainModel: createScene('plain')
  })
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  let compiledGroupName = null
  let compiledCapacity = null
  const renderer = {
    async compileAsync(compileScene) {
      const group = compileScene.getObjectByName('PrefabPipelineWarmup')
      compiledGroupName = group?.name ?? null
      compiledCapacity = collectWarmupMeshes(group)[0].instanceMatrix.count
    }
  }

  const result = await warmupPrefabPipelines({
    renderer,
    scene,
    camera,
    prefabRegistry: registry,
    materials: new WorldMaterials(),
    config: { placement: { prefabCapacity: { prop: 48 } } }
  })

  assert.equal(result.compiled, true)
  assert.equal(result.meshCount, 1)
  assert.equal(compiledGroupName, 'PrefabPipelineWarmup')
  assert.equal(compiledCapacity, 48)
  assert.equal(scene.children.some((child) => child.name === 'PrefabPipelineWarmup'), false)
})

test('warmup exercises a real frame with borrowed materials and cleans up on render failure', async () => {
  const scene = new THREE.Scene()
  const materials = new WorldMaterials()
  const manifest = {
    rock: { category: 'rock', variants: [{ source: 'rockModel' }], biomeTints: { forest: { color: '#ff0000' } } }
  }
  const sourceScene = createScene('rock')
  const registry = createRegistry(manifest, { rockModel: sourceScene })
  const calls = []
  let meshDisposals = 0
  let materialDisposals = 0
  const renderer = {
    async compileAsync(compileScene) {
      calls.push('compile')
      const group = compileScene.getObjectByName('PrefabPipelineWarmup')
      collectWarmupMeshes(group).forEach((mesh) => mesh.addEventListener('dispose', () => meshDisposals++))
    }
  }
  materials.resolvePrefabMaterial(sourceScene.children[0].material, { color: '#ff0000' })
    .addEventListener('dispose', () => materialDisposals++)
  await assert.rejects(() => warmupPrefabPipelines({
    renderer, scene, camera: new THREE.PerspectiveCamera(), prefabRegistry: registry, materials,
    renderFrame: () => {
      calls.push('render')
      assert.ok(scene.getObjectByName('PrefabPipelineWarmup'))
      throw new Error('render failed')
    }
  }), /render failed/)
  assert.deepEqual(calls, ['compile', 'render'])
  assert.equal(meshDisposals, 2)
  assert.equal(materialDisposals, 0)
  assert.equal(scene.getObjectByName('PrefabPipelineWarmup'), undefined)
  materials.dispose()
  assert.equal(materialDisposals, 1)
})

test('World can retain detached warmup pipelines and release them exactly once', async () => {
  const scene = new THREE.Scene()
  const materials = new WorldMaterials()
  const sourceScene = createScene('rock')
  const registry = createRegistry({ rock: { variants: [{ source: 'rockModel' }] } }, { rockModel: sourceScene })
  let meshDisposals = 0
  const result = await warmupPrefabPipelines({
    renderer: {
      async compileAsync(compileScene) {
        const group = compileScene.getObjectByName('PrefabPipelineWarmup')
        collectWarmupMeshes(group).forEach(mesh => mesh.addEventListener('dispose', () => meshDisposals++))
      }
    },
    scene, camera: new THREE.PerspectiveCamera(), prefabRegistry: registry, materials,
    retainPipelines: true
  })
  assert.equal(scene.getObjectByName('PrefabPipelineWarmup'), undefined)
  assert.equal(meshDisposals, 0)
  result.dispose()
  result.dispose()
  assert.equal(meshDisposals, 1)
  materials.dispose()
})
