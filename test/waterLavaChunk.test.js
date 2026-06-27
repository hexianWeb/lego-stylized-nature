import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import WaterBrickRenderer from '../src/world/bricks/WaterBrickRenderer.js'
import LavaBrickRenderer from '../src/world/bricks/LavaBrickRenderer.js'

function createChunkTerrainMap({ origin, visibleSize, halo, surfaceCells }) {
  const sampleWidth = visibleSize + halo * 2
  const sampleDepth = visibleSize + halo * 2

  return {
    origin,
    halo,
    visibleSize,
    heightField: { width: sampleWidth, depth: sampleDepth },
    getSurfaceCell(x, z) {
      return surfaceCells[z][x]
    }
  }
}

test('water renderer uses chunk-local positions inside each slot', () => {
  const renderer = new WaterBrickRenderer({
    config: {
      terrain: {
        width: 128,
        depth: 128,
        cellSize: 0.2,
        layerHeight: 1,
        waterLevel: 4
      },
      water: {}
    },
    brickGeometry: new THREE.BoxGeometry(1, 1, 1)
  })

  const terrainMap = createChunkTerrainMap({
    origin: { x: 64, z: 64 },
    visibleSize: 2,
    halo: 1,
    surfaceCells: [
      [{ isWater: false }, { isWater: false }, { isWater: false }, { isWater: false }],
      [{ isWater: false }, { isWater: true }, { isWater: true }, { isWater: false }],
      [{ isWater: false }, { isWater: false }, { isWater: false }, { isWater: false }],
      [{ isWater: false }, { isWater: false }, { isWater: false }, { isWater: false }]
    ]
  })

  renderer.build(terrainMap)

  assert.equal(renderer.mesh.count, 2)

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  renderer.mesh.getMatrixAt(0, matrix)
  position.setFromMatrixPosition(matrix)
  assert.ok(Math.abs(position.x - 0.1) < 1e-5)
  assert.ok(Math.abs(position.z - 0.1) < 1e-5)

  renderer.dispose()
})

test('lava renderer uses chunk-local positions inside each slot', () => {
  const renderer = new LavaBrickRenderer({
    config: {
      terrain: {
        width: 128,
        depth: 128,
        cellSize: 0.2,
        layerHeight: 1
      }
    },
    brickGeometry: new THREE.BoxGeometry(1, 1, 1),
    lavaConfig: {}
  })

  const terrainMap = createChunkTerrainMap({
    origin: { x: 32, z: 32 },
    visibleSize: 1,
    halo: 1,
    surfaceCells: [
      [{ isLava: false }, { isLava: false }, { isLava: false }],
      [{ isLava: false }, { isLava: true, height: 5, lavaHeight: 4 }, { isLava: false }],
      [{ isLava: false }, { isLava: false }, { isLava: false }]
    ]
  })

  renderer.build(terrainMap)

  assert.equal(renderer.mesh.count, 1)

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  renderer.mesh.getMatrixAt(0, matrix)
  position.setFromMatrixPosition(matrix)
  assert.ok(Math.abs(position.x - 0.1) < 1e-5)
  assert.equal(position.y, 4)

  renderer.dispose()
})

test('water renderer reuses InstancedMesh across rebuilds', () => {
  const renderer = new WaterBrickRenderer({
    config: {
      terrain: { width: 3, depth: 1, cellSize: 0.2, layerHeight: 1, waterLevel: 4 },
      water: {}
    },
    brickGeometry: new THREE.BoxGeometry(1, 1, 1)
  })
  const terrainMap = {
    getSurfaceCell(x) {
      return { isWater: x < 2 }
    }
  }

  renderer.build(terrainMap)
  const firstMesh = renderer.mesh
  renderer.build(terrainMap)

  assert.equal(renderer.mesh, firstMesh)
  renderer.dispose()
})
