import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { createLavaMaterial } from '../src/materials/tsl/lavaMaterial.js'
import LavaBrickRenderer from '../src/world/bricks/LavaBrickRenderer.js'
import LayeredTerrainBuilder from '../src/world/terrain/LayeredTerrainBuilder.js'
import WorldMaterials from '../src/world/WorldMaterials.js'

test('creates animated noise-mixed lava material with a procedural fallback', () => {
  const lavaNoiseTexture = new THREE.Texture()
  const config = {
    darkColor: '#C2410C',
    midColor: '#F15A24',
    lightColor: '#FFB020',
    textureScale: 0.1,
    flowSpeed: 0.6,
    flowStrength: 0.72,
    flowVariance: 0.55,
    roughness: 0.3,
    clearcoat: 0.45,
    clearcoatRoughness: 0.2
  }

  const texturedMaterial = createLavaMaterial(config, lavaNoiseTexture)
  const fallbackMaterial = createLavaMaterial(config)

  assert.ok(texturedMaterial instanceof THREE.MeshPhysicalNodeMaterial)
  assert.equal(lavaNoiseTexture.wrapS, THREE.RepeatWrapping)
  assert.equal(lavaNoiseTexture.wrapT, THREE.RepeatWrapping)
  assert.equal(lavaNoiseTexture.colorSpace, THREE.NoColorSpace)
  assert.ok(lavaNoiseTexture.version > 0)
  assert.ok(texturedMaterial.colorNode)
  assert.equal(texturedMaterial.emissiveNode, null)
  assert.equal(texturedMaterial.userData.uniforms.uTextureScale.value, 0.1)
  assert.equal(texturedMaterial.userData.uniforms.uFlowSpeed.value, 0.6)
  assert.equal(texturedMaterial.userData.uniforms.uFlowStrength.value, 0.72)
  assert.equal(texturedMaterial.userData.uniforms.uFlowVariance.value, 0.55)
  assert.equal(texturedMaterial.userData.noiseTexture, lavaNoiseTexture)
  assert.ok(fallbackMaterial.colorNode)
  assert.equal(fallbackMaterial.userData.uniforms.uFlowSpeed.value, 0.6)
  assert.equal(fallbackMaterial.userData.noiseTexture, undefined)
  assert.equal(texturedMaterial.transparent, false)
  assert.equal(texturedMaterial.opacity, 1)
  assert.equal(texturedMaterial.metalness, 0)
  assert.equal(texturedMaterial.roughness, 0.3)
  assert.equal(texturedMaterial.clearcoat, 0.45)
  assert.equal(texturedMaterial.clearcoatRoughness, 0.2)
})

test('lava borrows the shared liquid pattern and keeps its own colors', () => {
  const noiseTexture = new THREE.Texture()
  const materials = new WorldMaterials({
    config: {
      water: {
        darkColor: '#0757A6',
        midColor: '#168FD2',
        lightColor: '#42DDEB',
        textureScale: 0.1,
        flowSpeed: 0.6,
        flowStrength: 0.72,
        flowVariance: 0.55,
        roughness: 0.3,
        clearcoat: 0.45,
        clearcoatRoughness: 0.2
      }
    },
    waterNoiseTexture: noiseTexture,
    lavaConfig: {
      darkColor: '#C2410C',
      midColor: '#F15A24',
      lightColor: '#FFB020',
      textureScale: 4
    }
  })
  const renderer = new LavaBrickRenderer({
    materials,
    config: {
      terrain: { width: 1, depth: 1, cellSize: 0.2, layerHeight: 1 }
    },
    brickGeometry: new THREE.BoxGeometry(1, 1, 1)
  })

  assert.equal(renderer.material, materials.lavaMaterial)
  assert.equal(materials.lavaMaterial.userData.noiseTexture, noiseTexture)
  assert.equal(materials.waterMaterial.userData.noiseTexture, noiseTexture)
  assert.equal(materials.lavaMaterial.userData.uniforms, materials.waterMaterial.userData.uniforms)
  assert.equal(materials.lavaMaterial.userData.uniforms.uTextureScale.value, 0.1)
  assert.equal(materials.lavaMaterial.colorNode === materials.waterMaterial.colorNode, false)
  assert.equal(materials.lavaMaterial.roughness, 0.3)
  assert.equal(materials.lavaMaterial.clearcoat, 0.45)

  renderer.dispose()
  materials.dispose()
})

test('builds flat lava pool bricks at the pool lava height', () => {
  const layerHeight = 1
  const lavaHeight = 4
  const renderer = new LavaBrickRenderer({
    materials: new WorldMaterials(),
    config: {
      terrain: { width: 2, depth: 2, cellSize: 0.2, layerHeight }
    },
    brickGeometry: new THREE.BoxGeometry(1, 1, 1)
  })

  const cells = [
    [{ height: 4, lavaHeight, isLava: true }, { height: 5, isLava: false }],
    [{ height: 6, lavaHeight, isLava: true }, { height: 7, isLava: false }]
  ]
  const terrainMap = {
    getSurfaceCell(x, z) {
      return cells[z][x]
    }
  }

  renderer.build(terrainMap)

  assert.equal(renderer.mesh.count, 2)

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  for (let i = 0; i < renderer.mesh.count; i++) {
    renderer.mesh.getMatrixAt(i, matrix)
    position.setFromMatrixPosition(matrix)
    assert.equal(position.y, lavaHeight * layerHeight)
  }

  renderer.dispose()
})

test('removes terrain bricks at and above the lava pool height inside lava cells', () => {
  const lavaHeight = 2
  const builder = new LayeredTerrainBuilder({
    config: {
      terrain: { width: 1, depth: 1, waterLevel: 0 }
    }
  })
  const surfaceCell = { height: 4, lavaHeight, isWater: false, isLava: true }
  const terrainMap = {
    getHeight() {
      return surfaceCell.height
    },
    getSurfaceCell() {
      return surfaceCell
    },
    getBiomeCell() {
      return { biomeId: 'volcano', weights: { volcano: 1 } }
    }
  }

  const placements = builder.buildPlacements(terrainMap)

  assert.equal(placements.some((placement) => placement.y >= lavaHeight), false)
  assert.ok(placements.length > 0)
})

test('does not build negative terrain bricks when lava covers ground level', () => {
  const builder = new LayeredTerrainBuilder({
    config: {
      terrain: { width: 1, depth: 1, waterLevel: 0 }
    }
  })
  const surfaceCell = { height: 0, lavaHeight: 0, isWater: false, isLava: true }
  const terrainMap = {
    getHeight() {
      return surfaceCell.height
    },
    getSurfaceCell() {
      return surfaceCell
    },
    getBiomeCell() {
      return { biomeId: 'volcano', weights: { volcano: 1 } }
    }
  }

  const placements = builder.buildPlacements(terrainMap)

  assert.deepEqual(placements, [])
})

test('fills terrain exposed by flat lava pools with volcano bricks', () => {
  const builder = new LayeredTerrainBuilder({
    config: {
      terrain: { width: 3, depth: 3, waterLevel: 0 }
    }
  })
  const surfaceCells = Array.from({ length: 3 }, (_, z) =>
    Array.from({ length: 3 }, (_, x) => ({
      x,
      z,
      height: 5,
      isWater: false,
      isLava: false
    }))
  )
  surfaceCells[1][2] = {
    x: 2,
    z: 1,
    height: 5,
    lavaHeight: 2,
    isWater: false,
    isLava: true
  }
  const terrainMap = {
    getHeight(x, z) {
      return surfaceCells[z][x].height
    },
    getSurfaceCell(x, z) {
      return surfaceCells[z][x]
    },
    getBiomeCell() {
      return { biomeId: 'desert', weights: { desert: 1 } }
    }
  }

  const placements = builder.buildPlacements(terrainMap)
  const exposedWall = placements.filter((placement) => placement.x === 1 && placement.z === 1)
  const fillPlacements = exposedWall.filter((placement) => placement.y < 5)

  assert.deepEqual(exposedWall.map((placement) => placement.y), [3, 4, 5])
  assert.deepEqual(
    fillPlacements.map((placement) => placement.biomeCell.weights),
    [{ volcano: 1 }, { volcano: 1 }]
  )
})
