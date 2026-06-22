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

test('collectTransforms stores deterministic color indices without splitting buckets', () => {
  const manifest = {
    testFlower: {
      category: 'flora',
      placement: { surface: 'land' },
      variants: [{ source: 'flowerModel', weight: 1 }],
      randomRotation: false,
      instanceColors: {
        meshNameSuffix: '_InstanceColor',
        palette: ['#ff0000', '#00ff00', '#0000ff']
      }
    }
  }
  const biomes = {
    forest: { prefabs: [{ id: 'testFlower', density: 1 }] }
  }
  const terrainMap = createTerrainMap([['forest', 'forest']])
  const placer = createPlacer({ manifest, biomes, width: 2, depth: 1 })

  const firstBuild = [...placer.collectTransforms(terrainMap).values()]
  const secondBuild = [...placer.collectTransforms(terrainMap).values()]

  assert.equal(firstBuild.length, 1)
  assert.equal(firstBuild[0].transforms.length, 2)
  assert.deepEqual(
    firstBuild[0].transforms.map((transform) => transform.instanceColorIndex),
    secondBuild[0].transforms.map((transform) => transform.instanceColorIndex)
  )
  for (const transform of firstBuild[0].transforms) {
    assert.equal(Number.isInteger(transform.instanceColorIndex), true)
    assert.equal(transform.instanceColorIndex >= 0 && transform.instanceColorIndex < 3, true)
  }
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

test('buildVariantInstances applies palette colors to matching child instances', () => {
  const sourceMaterial = new THREE.MeshBasicMaterial({ color: '#cc2255' })
  const sourceScene = new THREE.Group()
  const sourceMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMaterial)
  sourceMesh.name = 'flower_InstanceColor'
  sourceScene.add(sourceMesh)
  const placer = createPlacer({ manifest: {}, biomes: {}, width: 1, depth: 1 })

  const group = placer.buildVariantInstances(
    sourceScene,
    [
      { position: [0, 0, 0], rotationY: 0, instanceColorIndex: 0 },
      { position: [1, 0, 0], rotationY: 0, instanceColorIndex: 1 }
    ],
    {
      instanceColors: {
        meshNameSuffix: '_InstanceColor',
        palette: ['#ff0000', '#00ff00']
      }
    },
    null
  )

  const mesh = group.children[0]
  const firstColor = new THREE.Color()
  const secondColor = new THREE.Color()
  mesh.getColorAt(0, firstColor)
  mesh.getColorAt(1, secondColor)

  assert.equal(mesh.material.color.getHexString(), 'ffffff')
  assert.equal(firstColor.getHexString(), 'ff0000')
  assert.equal(secondColor.getHexString(), '00ff00')
  assert.equal(mesh.instanceColor.version > 0, true)
  assert.equal(sourceMaterial.color.getHexString(), 'cc2255')
})

test('buildVariantInstances shares each transform color across matching child meshes', () => {
  const sourceScene = new THREE.Group()
  const firstSource = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: '#ff00ff' })
  )
  firstSource.name = 'flower_InstanceColor'
  const secondSource = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: '#ff00ff' })
  )
  secondSource.name = 'flower_InstanceColor.001'
  sourceScene.add(firstSource, secondSource)
  const placer = createPlacer({ manifest: {}, biomes: {}, width: 1, depth: 1 })

  const group = placer.buildVariantInstances(
    sourceScene,
    [{ position: [0, 0, 0], rotationY: 0, instanceColorIndex: 1 }],
    {
      instanceColors: {
        meshNameSuffix: '_InstanceColor',
        palette: ['#ff0000', '#0000ff']
      }
    },
    null
  )

  const firstColor = new THREE.Color()
  const secondColor = new THREE.Color()
  group.children[0].getColorAt(0, firstColor)
  group.children[1].getColorAt(0, secondColor)

  assert.equal(firstColor.getHexString(), '0000ff')
  assert.equal(secondColor.getHexString(), '0000ff')
})

test('buildVariantInstances keeps biome tint on nonmatching child meshes', () => {
  const sourceScene = new THREE.Group()
  const sourceMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: '#ffffff' })
  )
  sourceMesh.name = 'flower_root'
  sourceScene.add(sourceMesh)
  const placer = createPlacer({ manifest: {}, biomes: {}, width: 1, depth: 1 })

  const originalWarn = console.warn
  const warnings = []
  console.warn = (message) => warnings.push(message)

  let group
  try {
    group = placer.buildVariantInstances(
      sourceScene,
      [{ position: [0, 0, 0], rotationY: 0, instanceColorIndex: 0 }],
      {
        instanceColors: {
          meshNameSuffix: '_InstanceColor',
          palette: ['#ff0000']
        }
      },
      { color: '#000000', strength: 1 },
      'testFlower'
    )
    placer.buildVariantInstances(
      sourceScene,
      [{ position: [0, 0, 0], rotationY: 0, instanceColorIndex: 0 }],
      {
        instanceColors: {
          meshNameSuffix: '_InstanceColor',
          palette: ['#ff0000']
        }
      },
      { color: '#000000', strength: 1 },
      'testFlower'
    )
  } finally {
    console.warn = originalWarn
  }

  assert.equal(group.children[0].material.color.getHexString(), '000000')
  assert.equal(group.children[0].instanceColor, null)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /testFlower/)
})

test('invalid instance color config warns once per manifest entry', () => {
  const sourceScene = new THREE.Group()
  sourceScene.add(new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: '#ffffff' })
  ))
  const prefabEntry = {
    instanceColors: {
      meshNameSuffix: '_InstanceColor',
      palette: []
    }
  }
  const transforms = [{ position: [0, 0, 0], rotationY: 0 }]
  const placer = createPlacer({ manifest: {}, biomes: {}, width: 1, depth: 1 })
  const originalWarn = console.warn
  const warnings = []
  console.warn = (message) => warnings.push(message)

  try {
    placer.buildVariantInstances(sourceScene, transforms, prefabEntry, null, 'testFlower')
    placer.buildVariantInstances(sourceScene, transforms, prefabEntry, null, 'testFlower')
  } finally {
    console.warn = originalWarn
  }

  assert.equal(warnings.length, 1)
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
