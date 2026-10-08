import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import WorldMaterials from '../src/world/WorldMaterials.js'
import TerrainBrickRenderer from '../src/world/bricks/TerrainBrickRenderer.js'
import WaterBrickRenderer from '../src/world/bricks/WaterBrickRenderer.js'
import LavaBrickRenderer from '../src/world/bricks/LavaBrickRenderer.js'
import PrefabPlacer from '../src/world/prefabs/PrefabPlacer.js'

const config = { terrain: { width: 1, depth: 1, cellSize: 1, layerHeight: 1, waterLevel: 0 }, water: {} }

test('slot renderers borrow shared materials that survive individual slot disposal', () => {
  const materials = new WorldMaterials({ config })
  const brickGeometry = new THREE.BoxGeometry()
  const createRenderers = () => [
    new TerrainBrickRenderer({ config, brickGeometry, materials }),
    new WaterBrickRenderer({ config, brickGeometry, materials }),
    new LavaBrickRenderer({ config, brickGeometry, materials })
  ]
  const first = createRenderers()
  const second = createRenderers()
  const disposals = []
  for (const material of [materials.legoMaterial, materials.previewMaterial, materials.waterMaterial, materials.lavaMaterial]) {
    material.addEventListener('dispose', () => disposals.push(material))
  }
  first.forEach((renderer, i) => assert.equal(renderer.material, second[i].material))
  first.forEach((renderer) => renderer.dispose())
  assert.equal(disposals.length, 0)
  materials.legoMaterial.roughness = 0.9
  materials.waterMaterial.userData.uniforms.uFlowSpeed.value = 2
  assert.equal(second[0].material.roughness, 0.9)
  assert.equal(second[1].material.userData.uniforms.uFlowSpeed.value, 2)
  second.forEach((renderer) => renderer.dispose())
  materials.dispose()
  materials.dispose()
  assert.equal(disposals.length, 4)
  brickGeometry.dispose()
})

test('prefab caches belong to one World and are retained when a placer is cleared', () => {
  const materials = new WorldMaterials()
  const otherWorldMaterials = new WorldMaterials()
  const texture = new THREE.Texture()
  const source = new THREE.MeshPhysicalMaterial({ map: texture, color: '#808080' })
  const sourceScene = new THREE.Group()
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(), source)
  leaf.name = 'leaf'
  sourceScene.add(leaf)
  const createPlacer = () => new PrefabPlacer({ config, materials, prefabRegistry: {}, biomeRegistry: { get: () => null } })
  const first = createPlacer()
  const second = createPlacer()
  const transforms = [{ position: [0, 0, 0], rotationY: 0 }]
  for (const placer of [first, second]) {
    placer.group.add(placer.buildVariantInstances(sourceScene, transforms, { category: 'tree' }, null, 'tree', 'forest'))
  }
  const treeMaterial = first.group.children[0].children[0].material
  const tint = { color: '#ff0000', strength: 0.5 }
  const tinted = materials.resolvePrefabMaterial(source, tint)
  const colored = materials.resolveInstanceColorMaterial(source)
  assert.equal(treeMaterial, second.group.children[0].children[0].material)
  assert.equal(tinted, materials.resolvePrefabMaterial(source, tint))
  assert.equal(colored, materials.resolveInstanceColorMaterial(source))
  assert.notEqual(tinted, otherWorldMaterials.resolvePrefabMaterial(source, tint))
  assert.notEqual(treeMaterial, otherWorldMaterials.resolveTreeMaterial(leaf, 'forest'))
  let derivedDisposed = 0
  let sourceDisposed = 0
  let textureDisposed = 0
  for (const material of [treeMaterial, tinted, colored]) {
    material.addEventListener('dispose', () => derivedDisposed++)
  }
  source.addEventListener('dispose', () => sourceDisposed++)
  texture.addEventListener('dispose', () => textureDisposed++)

  first.dispose()
  assert.equal(derivedDisposed, 0)
  assert.equal(materials.resolveTreeMaterial(leaf, 'forest'), treeMaterial)
  second.dispose()
  materials.dispose()
  materials.dispose()
  assert.equal(derivedDisposed, 3)
  assert.equal(sourceDisposed, 0)
  assert.equal(textureDisposed, 0)
  otherWorldMaterials.dispose()
  source.dispose()
  texture.dispose()
  leaf.geometry.dispose()
})
