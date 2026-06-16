import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { createLavaMaterial } from '../src/materials/tsl/lavaMaterial.js'
import LavaBrickRenderer from '../src/world/bricks/LavaBrickRenderer.js'
import LayeredTerrainBuilder from '../src/world/terrain/LayeredTerrainBuilder.js'

test('creates lava material with pulse uniforms', () => {
  const material = createLavaMaterial({ pulseSpeed: 2, glowStrength: 0.8, roughness: 0.25 })

  assert.equal(material.roughness, 0.25)
  assert.equal(material.metalness, 0)
  assert.ok(material.colorNode)
  assert.ok(material.emissiveNode)
  assert.ok(material.userData.uniforms.uPulseSpeed)
  assert.ok(material.userData.uniforms.uGlowStrength)
})

test('creates lava material with configured noise texture uniforms', () => {
  const lavaNoiseTexture = new THREE.Texture()
  const material = createLavaMaterial({
    textureScale: 2.5,
    flowStrength: 0.7,
    poolSeedScale: 0.08,
    flowVariance: 0.6
  }, lavaNoiseTexture)

  assert.equal(lavaNoiseTexture.wrapS, THREE.RepeatWrapping)
  assert.equal(lavaNoiseTexture.wrapT, THREE.RepeatWrapping)
  assert.equal(lavaNoiseTexture.colorSpace, THREE.NoColorSpace)
  assert.equal(material.userData.lavaNoiseTexture, lavaNoiseTexture)
  assert.ok(material.userData.uniforms.uTextureScale)
  assert.ok(material.userData.uniforms.uFlowStrength)
  assert.ok(material.userData.uniforms.uPoolSeedScale)
  assert.ok(material.userData.uniforms.uFlowVariance)
})

test('passes lava noise texture from renderer config into material', () => {
  const lavaNoiseTexture = new THREE.Texture()
  const renderer = new LavaBrickRenderer({
    config: {
      terrain: { width: 1, depth: 1, cellSize: 0.2, layerHeight: 1 }
    },
    brickGeometry: new THREE.BoxGeometry(1, 1, 1),
    lavaConfig: {},
    lavaNoiseTexture
  })

  assert.equal(renderer.material.userData.lavaNoiseTexture, lavaNoiseTexture)

  renderer.dispose()
})

test('builds flat lava pool bricks at the pool lava height', () => {
  const layerHeight = 1
  const lavaHeight = 4
  const renderer = new LavaBrickRenderer({
    config: {
      terrain: { width: 2, depth: 2, cellSize: 0.2, layerHeight }
    },
    brickGeometry: new THREE.BoxGeometry(1, 1, 1),
    lavaConfig: {}
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
