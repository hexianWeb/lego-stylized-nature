import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import PrefabPlacer from '../src/world/prefabs/PrefabPlacer.js'

function createPlacer({ manifest, biomes, width = 2, depth = 1 }) {
  return new PrefabPlacer({
    config: {
      seed: 1,
      terrain: { width, depth, cellSize: 1, layerHeight: 1, waterLevel: 0 },
      placement: { rotationStep: Math.PI / 2, enableTrees: true }
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
        return null
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

test('collectTransforms stores structured bucket metadata for tinted placements', () => {
  const manifest = {
    testGrass: {
      category: 'flora',
      placement: { surface: 'land' },
      variants: [{ source: 'grassModel', weight: 1 }],
      randomRotation: false,
      biomeTints: {
        forest: { color: '#ffffff', strength: 0.5 }
      }
    }
  }
  const biomes = {
    forest: { prefabs: [{ id: 'testGrass', density: 1 }] }
  }
  const placer = createPlacer({ manifest, biomes, width: 1, depth: 1 })

  const buckets = [...placer.collectTransforms(createTerrainMap([['forest']])).values()]

  assert.equal(buckets.length, 1)
  assert.equal(buckets[0].prefabId, 'testGrass')
  assert.equal(buckets[0].variantIndex, 0)
  assert.equal(buckets[0].biomeId, 'forest')
  assert.deepEqual(buckets[0].tint, { color: '#ffffff', strength: 0.5 })
  assert.equal(buckets[0].transforms.length, 1)
})

test('collectTransforms does not split by biome when no tint applies', () => {
  const manifest = {
    testRock: {
      category: 'rock',
      placement: { surface: 'land' },
      variants: [{ source: 'rockModel', weight: 1 }],
      randomRotation: false
    }
  }
  const biomes = {
    forest: { prefabs: [{ id: 'testRock', density: 1 }] },
    desert: { prefabs: [{ id: 'testRock', density: 1 }] }
  }
  const placer = createPlacer({ manifest, biomes, width: 2, depth: 1 })

  const buckets = [...placer.collectTransforms(createTerrainMap([['forest', 'desert']])).values()]

  assert.equal(buckets.length, 1)
  assert.equal(buckets[0].prefabId, 'testRock')
  assert.equal(buckets[0].variantIndex, 0)
  assert.equal(buckets[0].biomeId, null)
  assert.equal(buckets[0].tint, null)
  assert.equal(buckets[0].transforms.length, 2)
})

test('collectTransforms uses untinted bucket when prefab lacks current biome tint', () => {
  const manifest = {
    testGrass: {
      category: 'flora',
      placement: { surface: 'land' },
      variants: [{ source: 'grassModel', weight: 1 }],
      randomRotation: false,
      biomeTints: {
        forest: { color: '#ffffff', strength: 0.5 }
      }
    }
  }
  const biomes = {
    desert: { prefabs: [{ id: 'testGrass', density: 1 }] }
  }
  const placer = createPlacer({ manifest, biomes, width: 1, depth: 1 })

  const buckets = [...placer.collectTransforms(createTerrainMap([['desert']])).values()]

  assert.equal(buckets.length, 1)
  assert.equal(buckets[0].biomeId, null)
  assert.equal(buckets[0].tint, null)
  assert.equal(buckets[0].transforms.length, 1)
})

test('buildVariantInstances applies tint clones to instanced meshes', () => {
  const sourceMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  const sourceScene = new THREE.Group()
  sourceScene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMaterial))
  const placer = createPlacer({ manifest: {}, biomes: {}, width: 1, depth: 1 })

  const group = placer.buildVariantInstances(
    sourceScene,
    [{ position: [0, 0, 0], rotationY: 0 }],
    {},
    { color: '#000000', strength: 1 }
  )

  const mesh = group.children[0]
  assert.equal(mesh.isInstancedMesh, true)
  assert.notEqual(mesh.material, sourceMaterial)
  assert.equal(mesh.material.userData.isBiomeTintClone, true)
  assert.equal(mesh.material.color.getHexString(), '000000')
})

test('buildVariantInstances preserves untinted source material', () => {
  const sourceMaterial = new THREE.MeshBasicMaterial({ color: '#808080' })
  const sourceScene = new THREE.Group()
  sourceScene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMaterial))
  const placer = createPlacer({ manifest: {}, biomes: {}, width: 1, depth: 1 })

  const group = placer.buildVariantInstances(
    sourceScene,
    [{ position: [0, 0, 0], rotationY: 0 }],
    {},
    null
  )

  assert.equal(group.children[0].material, sourceMaterial)
})

test('buildVariantInstances preserves material array order when tinting', () => {
  const first = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  const second = new THREE.MeshBasicMaterial({ color: '#808080' })
  const sourceScene = new THREE.Group()
  sourceScene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [first, second]))
  const placer = createPlacer({ manifest: {}, biomes: {}, width: 1, depth: 1 })

  const group = placer.buildVariantInstances(
    sourceScene,
    [{ position: [0, 0, 0], rotationY: 0 }],
    {},
    { color: '#000000', strength: 1 }
  )

  assert.equal(Array.isArray(group.children[0].material), true)
  assert.equal(group.children[0].material.length, 2)
  assert.notEqual(group.children[0].material[0], first)
  assert.notEqual(group.children[0].material[1], second)
})

test('clearInstances disposes tinted material clones without disposing textures', () => {
  const texture = new THREE.Texture()
  const material = new THREE.MeshBasicMaterial({ map: texture })
  let materialDisposed = false
  let textureDisposed = false
  material.userData.isBiomeTintClone = true
  material.dispose = () => {
    materialDisposed = true
  }
  texture.dispose = () => {
    textureDisposed = true
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, 1)
  const placer = createPlacer({ manifest: {}, biomes: {}, width: 1, depth: 1 })
  placer.group.add(mesh)

  placer.clearInstances()

  assert.equal(materialDisposed, true)
  assert.equal(textureDisposed, false)
  assert.equal(placer.group.children.length, 0)
})
