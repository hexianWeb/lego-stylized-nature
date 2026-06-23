import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { createWaterMaterial } from '../src/materials/tsl/waterMaterial.js'
import WaterBrickRenderer from '../src/world/bricks/WaterBrickRenderer.js'

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

test('maintains one reusable water mesh and disposes owned resources', () => {
  const renderer = new WaterBrickRenderer({
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
    brickGeometry: new THREE.BoxGeometry(1, 1, 1),
    waterNoiseTexture: new THREE.Texture()
  })
  let cells = [
    { isWater: true },
    { isWater: true },
    { isWater: false }
  ]
  const terrainMap = {
    getSurfaceCell(x) {
      return cells[x]
    }
  }

  renderer.build(terrainMap)
  const firstMesh = renderer.mesh

  assert.equal(renderer.group.children.length, 1)
  assert.equal(renderer.mesh.name, 'WaterBrickInstances')
  assert.equal(renderer.mesh.count, 2)

  cells = [
    { isWater: true },
    { isWater: false },
    { isWater: false }
  ]
  renderer.build(terrainMap)

  assert.equal(renderer.mesh, firstMesh)
  assert.equal(renderer.group.children.length, 1)
  assert.equal(renderer.mesh.count, 1)

  let materialDisposed = false
  renderer.material.dispose = () => {
    materialDisposed = true
  }
  renderer.dispose()

  assert.equal(materialDisposed, true)
  assert.equal(renderer.mesh, null)
  assert.equal(renderer.capacity, 0)
  assert.equal(renderer.group.children.length, 0)
})
