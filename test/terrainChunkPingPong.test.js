import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import BiomeRegistry from '../src/world/biomes/BiomeRegistry.js'
import BiomeBlender from '../src/world/biomes/BiomeBlender.js'
import BiomeMaskGenerator from '../src/world/biomes/BiomeMaskGenerator.js'
import TerrainGenerator from '../src/world/terrain/TerrainGenerator.js'
import LayeredTerrainBuilder from '../src/world/terrain/LayeredTerrainBuilder.js'
import BrickColorResolver from '../src/world/bricks/BrickColorResolver.js'
import TerrainChunkPingPong from '../src/world/chunks/TerrainChunkPingPong.js'

const config = {
  seed: 1,
  terrain: {
    width: 128,
    depth: 128,
    cellSize: 0.2,
    layerHeight: 0.095,
    maxHeight: 36,
    waterLevel: 3,
    noiseScale: 34,
    noiseOctaves: 4,
    noiseGain: 0.5,
    noiseLacunarity: 2,
    seaClip: 0.35,
    ao: { enabled: false, previewGrayscale: false }
  },
  biomes: {
    regions: [
      { id: 'forest', center: [24, 34], radius: 30, weight: 1 }
    ]
  },
  chunks: {
    size: 32,
    halo: 1,
    prefetchThreshold: 0.2
  }
}

function createPingPong() {
  const parentGroup = new THREE.Group()
  const biomeRegistry = new BiomeRegistry()
  const biomeBlender = new BiomeBlender(biomeRegistry)
  const terrainGenerator = new TerrainGenerator({
    config,
    biomeMaskGenerator: new BiomeMaskGenerator(config),
    biomeBlender,
    biomeRegistry
  })

  return new TerrainChunkPingPong({
    config,
    terrainGenerator,
    layeredTerrainBuilder: new LayeredTerrainBuilder({ config }),
    brickColorResolver: new BrickColorResolver({
      biomeRegistry,
      biomeBlender,
      config
    }),
    brickGeometry: new THREE.BoxGeometry(0.2, 0.095, 0.2),
    parentGroup: new THREE.Group(),
    biomeRegistry,
    prefabRegistry: {
      get() {
        return null
      },
      getVariantAsset() {
        return null
      }
    }
  })
}

test('bootstrap creates per-slot renderers for terrain prefab water and lava', () => {
  const pingPong = createPingPong()
  pingPong.bootstrap(9.6, 9.6)

  assert.ok(pingPong.activeSlot.prefabPlacer)
  assert.ok(pingPong.activeSlot.waterRenderer)
  assert.ok(pingPong.activeSlot.lavaRenderer)
  assert.equal(pingPong.activeSlot.waterRenderer.group.parent, pingPong.activeSlot.group)
  assert.equal(pingPong.activeSlot.lavaRenderer.group.parent, pingPong.activeSlot.group)
})

test('bootstrap fills active slot and keeps standby hidden', () => {
  const pingPong = createPingPong()
  pingPong.bootstrap(6.4, 6.4)

  assert.ok(pingPong.activeSlot.terrainRenderer.mesh)
  assert.equal(pingPong.activeSlot.group.visible, true)
  assert.equal(pingPong.standbySlot.group.visible, false)
})

test('prefetch loads standby slot before player crosses chunk boundary', () => {
  const pingPong = createPingPong()
  const chunkSize = 32
  const cellSize = 0.2
  pingPong.bootstrap(9.6, 9.6)
  const startCoord = { ...pingPong.activeSlot.coord }

  const edgeWorldX = (startCoord.x * chunkSize + chunkSize - 1) * cellSize
  pingPong.update(edgeWorldX, 9.6)

  assert.deepEqual(pingPong.standbySlot.coord, { x: startCoord.x + 1, z: startCoord.z })
  assert.equal(pingPong.standbySlot.group.visible, false)

  const crossedWorldX = (startCoord.x * chunkSize + chunkSize) * cellSize + 0.01
  pingPong.update(crossedWorldX, 9.6)

  assert.deepEqual(pingPong.activeSlot.coord, { x: startCoord.x + 1, z: startCoord.z })
  assert.equal(pingPong.activeSlot.group.visible, true)
})

test('swap reuses terrain water and lava meshes in standby slot', () => {
  const pingPong = createPingPong()
  const chunkSize = 32
  const cellSize = 0.2
  pingPong.bootstrap(9.6, 9.6)
  const startCoord = { ...pingPong.activeSlot.coord }
  const activeTerrainMesh = pingPong.activeSlot.terrainRenderer.mesh
  const activeWaterMesh = pingPong.activeSlot.waterRenderer.mesh
  const activeLavaMesh = pingPong.activeSlot.lavaRenderer.mesh

  const edgeWorldX = (startCoord.x * chunkSize + chunkSize - 1) * cellSize
  pingPong.update(edgeWorldX, 9.6)
  const standbyTerrainMesh = pingPong.standbySlot.terrainRenderer.mesh
  const standbyWaterMesh = pingPong.standbySlot.waterRenderer.mesh
  const standbyLavaMesh = pingPong.standbySlot.lavaRenderer.mesh

  const crossedWorldX = (startCoord.x * chunkSize + chunkSize) * cellSize + 0.01
  pingPong.update(crossedWorldX, 9.6)

  assert.equal(pingPong.activeSlot.terrainRenderer.mesh, standbyTerrainMesh)
  assert.equal(pingPong.activeSlot.waterRenderer.mesh, standbyWaterMesh)
  assert.equal(pingPong.activeSlot.lavaRenderer.mesh, standbyLavaMesh)
  assert.notEqual(pingPong.activeSlot.terrainRenderer.mesh, activeTerrainMesh)
  assert.notEqual(pingPong.activeSlot.waterRenderer.mesh, activeWaterMesh)
  assert.notEqual(pingPong.activeSlot.lavaRenderer.mesh, activeLavaMesh)
})
