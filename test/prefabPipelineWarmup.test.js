import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import WorldMaterials from '../src/world/WorldMaterials.js'
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
    plainModel: createScene('plain'),
    tintedModel: createScene('rock'),
    treeModel: createScene('leaf'),
    flowerModel: createScene('petal_InstanceColor')
  })

  const materials = new WorldMaterials()
  const group = buildPrefabPipelineWarmupGroup({ prefabRegistry: registry, materials })
  const meshes = collectWarmupMeshes(group)
  const modes = meshes.map((mesh) => mesh.userData.prefabWarmupMaterialMode).sort()

  assert.ok(modes.includes('source'))
  assert.ok(modes.includes('tint'))
  assert.ok(modes.includes('tree'))
  assert.ok(modes.includes('instanceColor'))
  assert.ok(meshes.every((mesh) => mesh.count === 1))
  assert.ok(meshes.every((mesh) => !mesh.frustumCulled && mesh.castShadow && mesh.receiveShadow))
  assert.ok(meshes.filter((mesh) => mesh.instanceColor).length >= 2)
  group.traverse((mesh) => mesh.isInstancedMesh && mesh.dispose())
  materials.dispose()
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
  const renderer = {
    async compileAsync(compileScene) {
      compiledGroupName = compileScene.children.find((child) => child.name === 'PrefabPipelineWarmup')?.name ?? null
    }
  }

  const result = await warmupPrefabPipelines({
    renderer,
    scene,
    camera,
    prefabRegistry: registry,
    materials: new WorldMaterials()
  })

  assert.equal(result.compiled, true)
  assert.equal(result.meshCount, 1)
  assert.equal(compiledGroupName, 'PrefabPipelineWarmup')
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
