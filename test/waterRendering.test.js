import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { createWaterMaterial } from '../src/materials/tsl/waterMaterial.js'
import WaterBrickRenderer from '../src/world/bricks/WaterBrickRenderer.js'
import WorldMaterials from '../src/world/WorldMaterials.js'

test('creates animated noise-mixed water material with a procedural fallback', () => {
  const noiseTexture = new THREE.Texture()
  const config = {
    darkColor: '#0757A6',
    midColor: '#168FD2',
    lightColor: '#42DDEB',
    textureScale: 0.45,
    flowSpeed: 0.42,
    flowStrength: 0.52,
    flowVariance: 0.55,
    roughness: 0.3,
    clearcoat: 0.45,
    clearcoatRoughness: 0.2
  }

  const texturedMaterial = createWaterMaterial(config, noiseTexture)
  const fallbackMaterial = createWaterMaterial(config)

  assert.ok(texturedMaterial instanceof THREE.MeshPhysicalNodeMaterial)
  assert.equal(noiseTexture.wrapS, THREE.RepeatWrapping)
  assert.equal(noiseTexture.wrapT, THREE.RepeatWrapping)
  assert.equal(noiseTexture.colorSpace, THREE.NoColorSpace)
  assert.ok(noiseTexture.version > 0)
  assert.ok(texturedMaterial.colorNode)
  assert.equal(texturedMaterial.userData.uniforms.uTextureScale.value, 0.45)
  assert.equal(texturedMaterial.userData.uniforms.uFlowSpeed.value, 0.42)
  assert.equal(texturedMaterial.userData.waterNoiseTexture, noiseTexture)
  assert.ok(fallbackMaterial.colorNode)
  assert.equal(fallbackMaterial.userData.uniforms.uFlowSpeed.value, 0.42)
  assert.equal(fallbackMaterial.userData.waterNoiseTexture, undefined)
  assert.equal(texturedMaterial.transparent, false)
  assert.equal(texturedMaterial.opacity, 1)
  assert.equal(texturedMaterial.metalness, 0)
})

test('builds only water cells and leaves shared material disposal to the World', () => {
  const renderer = new WaterBrickRenderer({
    materials: new WorldMaterials(),
    config: {
      terrain: {
        width: 3,
        depth: 1,
        cellSize: 0.2,
        layerHeight: 1,
        waterLevel: 4
      },
      water: {}
    },
    brickGeometry: new THREE.BoxGeometry(1, 1, 1)
  })
  const terrainMap = {
    getSurfaceCell(x) {
      return { isWater: x !== 1 }
    }
  }

  renderer.build(terrainMap)
  const firstMesh = renderer.mesh

  assert.equal(renderer.group.children.length, 1)
  assert.equal(renderer.mesh.name, 'WaterBrickInstances')
  assert.equal(renderer.mesh.count, 2)
  assert.equal(renderer.instanceCount, 2)
  assert.equal(renderer.mesh.frustumCulled, true)

  renderer.build(terrainMap)

  assert.equal(renderer.mesh, firstMesh)
  assert.equal(renderer.group.children.length, 1)
  assert.equal(renderer.mesh.count, 2)

  let materialDisposed = false
  renderer.material.dispose = () => {
    materialDisposed = true
  }
  renderer.dispose()

  assert.equal(materialDisposed, false)
  assert.equal(renderer.mesh, null)
  assert.equal(renderer.group.children.length, 0)
})

test('water pages grow, shrink to zero and refill without stale instances', () => {
  const config = { terrain: { width: 5, depth: 1, cellSize: 1, layerHeight: 1, waterLevel: 3 }, water: {} }
  const materials = new WorldMaterials({ config })
  const renderer = new WaterBrickRenderer({ config, materials, brickGeometry: new THREE.BoxGeometry(), pageCapacity: 2 })
  let count = 5
  const terrainMap = { getSurfaceCell: (x) => ({ isWater: x < count }) }
  renderer.build(terrainMap)
  const meshes = renderer.pages.map((page) => page.mesh)
  assert.deepEqual(meshes.map((mesh) => mesh.count), [2, 2, 1])

  count = 1
  renderer.build(terrainMap)
  assert.deepEqual(meshes.map((mesh) => mesh.count), [1, 0, 0])
  assert.deepEqual(meshes.map((mesh) => mesh.visible), [true, false, false])
  count = 0
  renderer.build(terrainMap)
  assert.equal(renderer.instanceCount, 0)
  assert.ok(meshes.every((mesh) => mesh.boundingSphere.isEmpty() && !mesh.visible))

  count = 5
  config.terrain.waterLevel = 9
  config.water.castShadow = false
  renderer.build(terrainMap)
  assert.deepEqual(renderer.pages.map((page) => page.mesh), meshes)
  assert.equal(renderer.instanceCount, 5)
  assert.ok(meshes.every((mesh) => !mesh.castShadow && mesh.frustumCulled))
  assert.ok(meshes[2].boundingSphere.containsPoint(new THREE.Vector3(4.5, 9, 0.5)))

  config.water.enableWater = false
  renderer.build(terrainMap)
  assert.equal(renderer.instanceCount, 0)
  renderer.dispose()
  materials.dispose()
})
