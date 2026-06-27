import test from 'node:test'
import assert from 'node:assert/strict'
import PrefabPlacer from '../src/world/prefabs/PrefabPlacer.js'

function createChunkTerrainMap({ origin, visibleSize, halo, biomeId = 'forest' }) {
  const sampleWidth = visibleSize + halo * 2
  const sampleDepth = visibleSize + halo * 2
  const biomeCell = { biomeId, weights: { [biomeId]: 1 } }
  const surfaceCell = { height: 4, slope: 0, isWater: false, isShore: false, isLava: false }

  return {
    origin,
    halo,
    visibleSize,
    heightField: { width: sampleWidth, depth: sampleDepth },
    getBiomeCell(x, z) {
      return biomeCell
    },
    getSurfaceCell() {
      return surfaceCell
    }
  }
}

function createPlacer({ manifest, biomes }) {
  return new PrefabPlacer({
    config: {
      seed: 1,
      terrain: { width: 128, depth: 128, cellSize: 0.2, layerHeight: 1, waterLevel: 0 },
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

test('collectTransforms uses world block coordinates for chunk terrain maps', () => {
  const manifest = {
    testGrass: {
      category: 'flora',
      placement: { surface: 'land' },
      variants: [{ source: 'grassModel', weight: 1 }],
      randomRotation: false
    }
  }
  const biomes = {
    forest: { prefabs: [{ id: 'testGrass', density: 1 }] }
  }
  const placer = createPlacer({ manifest, biomes })

  const firstChunk = createChunkTerrainMap({ origin: { x: 32, z: 32 }, visibleSize: 2, halo: 1 })
  const secondChunk = createChunkTerrainMap({ origin: { x: 33, z: 32 }, visibleSize: 2, halo: 1 })

  const firstBuckets = [...placer.collectTransforms(firstChunk).values()]
  const secondBuckets = [...placer.collectTransforms(secondChunk).values()]

  assert.equal(firstBuckets.length, 1)
  assert.equal(secondBuckets.length, 1)

  const sharedWorldCell = firstBuckets[0].transforms.find((transform) => transform.x === 33 && transform.z === 32)
  const overlappingCell = secondBuckets[0].transforms.find((transform) => transform.x === 33 && transform.z === 32)

  assert.ok(sharedWorldCell)
  assert.ok(overlappingCell)
  assert.equal(sharedWorldCell.rotationY, overlappingCell.rotationY)
  assert.notEqual(sharedWorldCell.position[0], overlappingCell.position[0])
})

test('collectTransforms writes chunk-local positions inside each slot', () => {
  const manifest = {
    testGrass: {
      category: 'flora',
      placement: { surface: 'land' },
      variants: [{ source: 'grassModel', weight: 1 }],
      randomRotation: false
    }
  }
  const biomes = {
    forest: { prefabs: [{ id: 'testGrass', density: 1 }] }
  }
  const placer = createPlacer({ manifest, biomes })
  const terrainMap = createChunkTerrainMap({ origin: { x: 64, z: 64 }, visibleSize: 1, halo: 1 })
  const buckets = [...placer.collectTransforms(terrainMap).values()]

  assert.equal(buckets[0].transforms[0].position[0], 0.5 * 0.2)
  assert.equal(buckets[0].transforms[0].position[2], 0.5 * 0.2)
  assert.equal(buckets[0].transforms[0].x, 64)
  assert.equal(buckets[0].transforms[0].z, 64)
})
