import test from 'node:test'
import assert from 'node:assert/strict'
import BiomeMaskGenerator from '../src/world/biomes/BiomeMaskGenerator.js'
import { worldConfig } from '../src/world/WorldConfig.js'

const table = [
  { id: 'forest', weight: 4 },
  { id: 'autumnForest', weight: 3 },
  { id: 'desert', weight: 2 },
  { id: 'volcano', weight: 1 }
]

function createConfig(biomes = {}) {
  return {
    seed: 42,
    terrain: { width: 32, depth: 24 },
    biomes: {
      cellSize: 192,
      jitter: 0.6,
      blendWidth: 24,
      warp: { amplitude: 40, scale: 160 },
      originBiome: 'autumnForest',
      table: table.map(entry => ({ ...entry })),
      ...biomes
    }
  }
}

function sample(generator, x, z) {
  return generator.generateForBounds({ x, z }, 1, 1)[0][0]
}

function weightDifference(a, b) {
  return Math.max(...table.map(({ id }) => Math.abs((a.weights[id] ?? 0) - (b.weights[id] ?? 0))))
}

test('overlapping chunks and full-map generation return identical biome cells', () => {
  const generator = new BiomeMaskGenerator(createConfig())
  assert.deepEqual(generator.generate(), generator.generateForBounds({ x: 0, z: 0 }, 32, 24))

  for (const origin of [{ x: -220, z: -200 }, { x: 180, z: 170 }]) {
    const first = generator.generateForBounds(origin, 64, 48)
    const second = generator.generateForBounds({ x: origin.x + 23, z: origin.z + 17 }, 47, 40)
    for (let z = 0; z < 31; z++) {
      for (let x = 0; x < 41; x++) {
        assert.deepEqual(first[z + 17][x + 23], second[z][x])
      }
    }
  }
})

test('changing the seed rebuilds warp noise and restoring it reproduces the original cells', () => {
  const config = createConfig()
  const generator = new BiomeMaskGenerator(config)
  const origin = { x: -230, z: 360 }
  const original = generator.generateForBounds(origin, 16, 16)
  config.seed = 73
  const changed = generator.generateForBounds(origin, 16, 16)
  assert.deepEqual(changed, new BiomeMaskGenerator(config).generateForBounds(origin, 16, 16))
  assert.notDeepEqual(changed, original)
  config.seed = 42
  assert.deepEqual(generator.generateForBounds(origin, 16, 16), original)
})

test('every sampled cell has normalized finite weights and a site for each contributing biome', () => {
  const generator = new BiomeMaskGenerator(createConfig())
  for (const origin of [{ x: -400, z: -200 }, { x: 150, z: 175 }, { x: 500, z: -450 }]) {
    const cells = generator.generateForBounds(origin, 48, 48)
    for (const row of cells) {
      for (const cell of row) {
        const weights = Object.values(cell.weights)
        assert.ok(weights.length > 0)
        assert.ok(Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-12)
        assert.equal(cell.weights[cell.biomeId], Math.max(...weights))
        for (const [id, weight] of Object.entries(cell.weights)) {
          assert.ok(table.some(entry => entry.id === id))
          assert.ok(Number.isFinite(weight) && weight > 0 && weight <= 1)
          const site = cell.sites[id]
          assert.ok(site, `missing site for ${id}`)
          assert.ok(Number.isFinite(site.x) && Number.isFinite(site.z))
          assert.ok(Number.isFinite(site.distance) && site.distance >= 0)
        }
      }
    }
  }
})

test('biome weights vary continuously along a line crossing Voronoi boundaries', () => {
  const generator = new BiomeMaskGenerator(createConfig({
    jitter: 0,
    warp: { amplitude: 0, scale: 160 },
    originBiome: null
  }))
  const cells = generator.generateForBounds({ x: -768, z: 96 }, 1537, 1)[0]
  assert.ok(new Set(cells.map(cell => cell.biomeId)).size > 1)
  assert.ok(cells.some(cell => Object.keys(cell.weights).length > 1))
  for (let x = 1; x < cells.length; x++) {
    assert.ok(weightDifference(cells[x - 1], cells[x]) < 0.08, `weight jump at x = ${x - 768}`)
  }
})

test('jittered weights stay continuous when the sampling grid changes', () => {
  const generator = new BiomeMaskGenerator(createConfig({
    warp: { amplitude: 0, scale: 160 },
    originBiome: null
  }))
  const epsilon = 1e-4
  for (let gx = -4; gx <= 4; gx++) {
    for (let z = -768; z <= 768; z += 7) {
      const x = gx * 192
      const left = sample(generator, x - epsilon, z)
      const right = sample(generator, x + epsilon, z)
      assert.ok(weightDifference(left, right) < 1e-4, `weight jump across x = ${x}, z = ${z}`)
    }
  }
})

test('wide blending includes multiple biomes without a jump at grid boundaries', () => {
  const generator = new BiomeMaskGenerator(createConfig({
    jitter: 0,
    blendWidth: 300,
    warp: { amplitude: 0, scale: 160 },
    originBiome: null
  }))
  const epsilon = 1e-4
  let multipleBiomes = false
  for (let gx = -3; gx <= 3; gx++) {
    for (let gz = -3; gz <= 3; gz++) {
      const x = gx * 192
      const z = gz * 192
      const left = sample(generator, x - epsilon, z)
      const right = sample(generator, x + epsilon, z)
      multipleBiomes ||= Object.keys(right.weights).length >= 3
      assert.ok(weightDifference(left, right) < 1e-4, `weight jump at junction ${x}, ${z}`)
    }
  }
  assert.ok(multipleBiomes, 'expected at least one junction with three contributing biomes')
})

test('maximum jitter keeps contributing outer sites at a grid corner', () => {
  const config = createConfig({
    jitter: 1,
    warp: { amplitude: 0, scale: 160 },
    originBiome: null
  })
  config.seed = 20260608
  const generator = new BiomeMaskGenerator(config)
  const epsilon = 1e-7
  const left = sample(generator, -3264 - epsilon, 3456 - epsilon)
  const right = sample(generator, -3264 + epsilon, 3456 - epsilon)
  assert.ok(weightDifference(left, right) < 1e-6)
})

test('originBiome overrides the origin grid site and can be disabled', () => {
  const config = createConfig({
    jitter: 0,
    warp: { amplitude: 0, scale: 160 },
    table: [{ id: 'forest', weight: 1 }]
  })
  const originSite = sample(new BiomeMaskGenerator(config), 96, 96)
  assert.equal(originSite.biomeId, 'autumnForest')
  assert.deepEqual(originSite.weights, { autumnForest: 1 })
  assert.deepEqual(originSite.sites.autumnForest, { x: 96, z: 96, distance: 0 })

  config.biomes.originBiome = null
  assert.equal(sample(new BiomeMaskGenerator(config), 96, 96).biomeId, 'forest')
})

test('the default aircraft spawn belongs to the configured origin biome', () => {
  const generator = new BiomeMaskGenerator(worldConfig)
  const cell = sample(generator, Math.floor(worldConfig.terrain.width / 2), Math.floor(worldConfig.terrain.depth / 2))
  assert.equal(cell.biomeId, worldConfig.biomes.originBiome)
})

test('sites retain the nearest contributing site for each biome', () => {
  const config = createConfig({
    jitter: 0,
    blendWidth: 300,
    warp: { amplitude: 0, scale: 160 },
    originBiome: null
  })
  const generator = new BiomeMaskGenerator(config)
  const target = { x: 177, z: 205 }
  const cell = sample(generator, target.x, target.z)
  const candidates = []
  // At its center a grid site has the greatest individual influence. Disable
  // blending while identifying these sites, then restore it for the query.
  config.biomes.blendWidth = 0
  for (let gz = -2; gz <= 3; gz++) {
    for (let gx = -2; gx <= 3; gx++) {
      const x = (gx + 0.5) * 192
      const z = (gz + 0.5) * 192
      candidates.push({ id: sample(generator, x, z).biomeId, x, z })
    }
  }
  for (const id of Object.keys(cell.weights)) {
    const nearest = candidates.filter(site => site.id === id)
      .map(site => ({ ...site, distance: Math.hypot(target.x - site.x, target.z - site.z) }))
      .sort((a, b) => a.distance - b.distance)[0]
    assert.ok(nearest)
    assert.equal(cell.sites[id].x, nearest.x)
    assert.equal(cell.sites[id].z, nearest.z)
    assert.ok(Math.abs(cell.sites[id].distance - nearest.distance) < 1e-9)
  }
})

test('large-area biome proportions follow the configured table weights', () => {
  const generator = new BiomeMaskGenerator(createConfig())
  const counts = Object.fromEntries(table.map(({ id }) => [id, 0]))
  const sampleCount = 64 * 64
  for (let gz = -32; gz < 32; gz++) {
    for (let gx = -32; gx < 32; gx++) {
      counts[sample(generator, (gx + 0.5) * 192, (gz + 0.5) * 192).biomeId]++
    }
  }
  const totalWeight = table.reduce((sum, entry) => sum + entry.weight, 0)
  for (const { id, weight } of table) {
    const actual = counts[id] / sampleCount
    const expected = weight / totalWeight
    assert.ok(Math.abs(actual - expected) < 0.05, `${id} proportion ${actual} differs from ${expected}`)
  }
})
