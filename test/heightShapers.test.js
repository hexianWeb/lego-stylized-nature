import test from 'node:test'
import assert from 'node:assert/strict'
import { createNoise2D } from 'simplex-noise'
import { mulberry32 } from '../src/utils/random.js'
import { worldConfig } from '../src/world/WorldConfig.js'
import BiomeRegistry from '../src/world/biomes/BiomeRegistry.js'
import BiomeMaskGenerator from '../src/world/biomes/BiomeMaskGenerator.js'
import HeightField from '../src/world/terrain/HeightField.js'
import TerrainGenerator from '../src/world/terrain/TerrainGenerator.js'
import { fbm, terraced, dunes, volcano, heightShapers } from '../src/world/terrain/heightShapers.js'

const oldForestCurve = [
  { n: 0, h: 0 }, { n: 0.35, h: 0 },
  { n: 0.38, h: 2 }, { n: 0.44, h: 2 },
  { n: 0.46, h: 11 }, { n: 0.53, h: 11 },
  { n: 0.55, h: 20 }, { n: 0.62, h: 20 },
  { n: 0.64, h: 29 }, { n: 0.8, h: 29 }, { n: 1, h: 32 }
]

function oldForestHeight(noise2D, x, z, terrain) {
  let noise = 0
  let amplitude = 1
  let frequency = 1 / terrain.noiseScale
  let totalAmplitude = 0
  for (let i = 0; i < terrain.noiseOctaves; i++) {
    noise += noise2D(x * frequency, z * frequency) * amplitude
    totalAmplitude += amplitude
    amplitude *= terrain.noiseGain
    frequency *= terrain.noiseLacunarity
  }
  const n = 0.5 + 0.5 * noise / totalAmplitude
  if (n <= oldForestCurve[0].n) return oldForestCurve[0].h * 0.95
  for (let i = 1; i < oldForestCurve.length; i++) {
    const a = oldForestCurve[i - 1]
    const b = oldForestCurve[i]
    if (n <= b.n) return (a.h + (b.h - a.h) * (n - a.n) / (b.n - a.n)) * 0.95
  }
  return oldForestCurve.at(-1).h * 0.95
}

function createGenerator(config = structuredClone(worldConfig), biomeRegistry = new BiomeRegistry()) {
  return new TerrainGenerator({ config, biomeRegistry, biomeMaskGenerator: new BiomeMaskGenerator(config) })
}

function shapeHeight(registry, terrain, noise2D, cell, x, z) {
  return Object.entries(cell.weights).reduce((height, [id, weight]) => {
    const params = registry.get(id).terrain.shape
    return height + weight * heightShapers[params.type]({
      x, z, noise2D, terrain, params, site: cell.sites[id]
    })
  }, 0)
}

test('forest terraced heights preserve the old curve and 0.95 scaling', () => {
  const params = new BiomeRegistry().get('forest').terrain.shape
  assert.equal(params.type, 'terraced')
  assert.equal(params.heightCurve.length, oldForestCurve.length)
  for (let i = 0; i < oldForestCurve.length; i++) {
    assert.equal(params.heightCurve[i].n, oldForestCurve[i].n)
    assert.ok(Math.abs(params.heightCurve[i].h - oldForestCurve[i].h * 0.95) < 1e-12)
  }
  const terrain = worldConfig.terrain
  for (const seed of [1, 42, 20260608]) {
    const noise2D = createNoise2D(mulberry32(seed))
    for (const [x, z] of [[0, 0], [-180, 240], [64, 64], [420, -340], [127, 91]]) {
      const actual = terraced({ x, z, noise2D, terrain, params: { ...params, noiseOffset: { x: 0, z: 0 } } })
      assert.ok(Math.abs(actual - oldForestHeight(noise2D, x, z, terrain)) < 1e-10)
    }
  }
})

test('fbm normalizes octave amplitudes', () => {
  const noise = { scale: 20, octaves: 4, gain: 0.5, lacunarity: 2 }
  assert.ok(Math.abs(fbm(() => 0.6, 31, -17, noise) - 0.6) < 1e-12)
  assert.equal(fbm(() => 0, 31, -17, noise), 0)
})

test('a shaper applies biome noise overrides and coordinate offsets with terrain defaults', () => {
  const samples = []
  const noise2D = (x, z) => {
    samples.push([x, z])
    return 0
  }
  const params = {
    heightCurve: [{ n: 0, h: 0 }, { n: 1, h: 10 }],
    noise: { scale: 10, octaves: 2 },
    noiseOffset: { x: 10, z: -5 }
  }
  const terrain = { noiseScale: 100, noiseOctaves: 4, noiseGain: 0.5, noiseLacunarity: 3 }
  assert.equal(terraced({ x: 10, z: 15, noise2D, terrain, params }), 5)
  assert.equal(samples.length, 2)
  for (const [i, expected] of [[0, [2, 1]], [1, [6, 3]]]) {
    assert.ok(Math.abs(samples[i][0] - expected[0]) < 1e-12)
    assert.ok(Math.abs(samples[i][1] - expected[1]) < 1e-12)
  }
})

test('volcano has a depressed crater, a higher rim and a low outer base', () => {
  const params = {
    heightCurve: [{ n: 0, h: 2 }, { n: 1, h: 2 }],
    coneRadius: 60, peak: 32, power: 1.4,
    craterRadius: 12, craterDepth: 24, roughness: 0, terraceStep: 1
  }
  const sample = distance => volcano({
    x: distance, z: 0, noise2D: () => 0, terrain: worldConfig.terrain, params,
    site: { x: 0, z: 0, distance }
  })
  assert.ok(sample(0) < sample(params.craterRadius))
  assert.ok(sample(params.craterRadius) > sample(params.coneRadius))
  assert.equal(sample(params.coneRadius), 2)
  assert.equal(sample(params.coneRadius + 10), 2)
  assert.equal(volcano({ x: 0, z: 0, noise2D: () => 0, terrain: worldConfig.terrain, params }), 2)
})

test('volcano meets its terraced base continuously at the cone radius', () => {
  const params = {
    heightCurve: [{ n: 0, h: 2.3 }, { n: 1, h: 2.3 }],
    coneRadius: 60, peak: 32, power: 1.4,
    craterRadius: 12, craterDepth: 24, roughness: 2, terraceStep: 1
  }
  const sample = distance => volcano({
    x: distance, z: 0, noise2D: () => 0.4, terrain: worldConfig.terrain, params,
    site: { x: 0, z: 0, distance }
  })
  assert.ok(Math.abs(sample(60 - 1e-6) - sample(60 + 1e-6)) < 1e-5)
})

test('dunes stretch ridges along the wind direction', () => {
  const params = {
    baseHeight: 3, baseAmplitude: 0, duneAmplitude: 8,
    duneScale: 24, duneStretch: 8, windAngle: 0,
    noiseOffset: { x: 0, z: 0 }
  }
  const noise2D = createNoise2D(mulberry32(42))
  const sample = (x, z) => dunes({ x, z, noise2D, terrain: worldConfig.terrain, params })
  let alongWind = 0
  let acrossWind = 0
  for (let i = 1; i <= 256; i++) {
    alongWind += Math.abs(sample(i, 0) - sample(i - 1, 0))
    acrossWind += Math.abs(sample(0, i) - sample(0, i - 1))
  }
  assert.ok(alongWind < acrossWind / 3, `wind variation ${alongWind}, crosswind variation ${acrossWind}`)
  const rotated = { ...params, windAngle: Math.PI / 2 }
  assert.ok(Math.abs(sample(17, 31) - dunes({ x: -31, z: 17, noise2D, terrain: worldConfig.terrain, params: rotated })) < 1e-10)
})

test('dunes use a low-frequency base independent of ridge amplitude', () => {
  const params = {
    baseHeight: 3, baseAmplitude: 8, duneAmplitude: 0,
    duneScale: 24, duneStretch: 8, windAngle: 0,
    noise: { scale: 10, octaves: 1 }, noiseOffset: { x: 0, z: 0 }
  }
  const noise2D = (x, z) => Math.sin(x + z)
  const origin = dunes({ x: 0, z: 0, noise2D, terrain: worldConfig.terrain, params })
  const shifted = dunes({ x: 10, z: 0, noise2D, terrain: worldConfig.terrain, params })
  assert.ok(Math.abs(origin - 7) < 1e-10)
  assert.ok(Math.abs(shifted - (3 + 8 * (0.5 + 0.5 * Math.sin(1)))) < 1e-10)
})

test('terrain blends floating heights before adding water level, flooring and clamping', () => {
  const constant = (id, height) => ({
    id, terrain: { shape: { type: 'terraced', heightCurve: [{ n: 0, h: height }, { n: 1, h: height }] } }
  })
  const config = structuredClone(worldConfig)
  config.terrain.waterLevel = 3.9
  config.terrain.maxHeight = 20
  const registry = new BiomeRegistry([constant('forest', 0.8), constant('desert', 2.8)])
  const generator = createGenerator(config, registry)
  generator.noise2D = () => 0
  const field = new HeightField(1, 1)
  const cell = { biomeId: 'forest', weights: { forest: 0.5, desert: 0.5 }, sites: {} }
  generator.writeHeightSample(field, 0, 0, cell, -50, 120)
  assert.equal(field.get(0, 0), 5)

  registry.get('forest').terrain.shape.heightCurve = [{ n: 0, h: -10 }, { n: 1, h: -10 }]
  registry.get('desert').terrain.shape.heightCurve = [{ n: 0, h: 30 }, { n: 1, h: 30 }]
  generator.writeHeightSample(field, 0, 0, cell)
  assert.equal(field.get(0, 0), 13)
  generator.writeHeightSample(field, 0, 0, { ...cell, weights: { forest: 1 } })
  assert.equal(field.get(0, 0), 0)
  generator.writeHeightSample(field, 0, 0, { ...cell, weights: { desert: 1 } })
  assert.equal(field.get(0, 0), 20)
})

test('biome boundaries blend smoothly without introducing height cliffs', () => {
  const config = structuredClone(worldConfig)
  config.seed = 42
  config.biomes.jitter = 0
  config.biomes.warp.amplitude = 0
  config.biomes.originBiome = null
  const mask = new BiomeMaskGenerator(config)
  const context = mask.createSamplingContext()
  const registry = new BiomeRegistry()
  const noise2D = () => 0
  const height = (x, z) => shapeHeight(registry, config.terrain, noise2D, mask.getCellBiome(x, z, context), x, z)
  let crossedBoundaries = 0
  for (let gx = -8; gx <= 8; gx++) {
    const x = gx * config.biomes.cellSize
    const z = config.biomes.cellSize / 2
    const a = mask.getCellBiome(x - 1, z, context)
    const b = mask.getCellBiome(x + 1, z, context)
    if (a.biomeId === b.biomeId) continue
    crossedBoundaries++
    assert.ok(Math.abs(height(x - 0.5, z) - height(x + 0.5, z)) < 2, `height cliff at ${x}, ${z}`)
    assert.ok(Math.abs(height(x - 1e-6, z) - height(x + 1e-6, z)) < 1e-4, `height discontinuity at ${x}, ${z}`)
  }
  assert.ok(crossedBoundaries >= 3)
})

test('all biome shapers remain continuous across boundaries with their seeded noise', () => {
  const config = structuredClone(worldConfig)
  config.biomes.jitter = 0
  config.biomes.warp.amplitude = 0
  config.biomes.originBiome = null
  const registry = new BiomeRegistry()
  for (const seed of [42, 73, 20260608]) {
    config.seed = seed
    const mask = new BiomeMaskGenerator(config)
    const context = mask.createSamplingContext()
    const noise2D = createNoise2D(mulberry32(seed))
    for (let gx = -4; gx <= 4; gx++) {
      const x = gx * config.biomes.cellSize
      const z = config.biomes.cellSize / 2
      const left = mask.getCellBiome(x - 1e-6, z, context)
      const right = mask.getCellBiome(x + 1e-6, z, context)
      const difference = Math.abs(shapeHeight(registry, config.terrain, noise2D, left, x - 1e-6, z) -
        shapeHeight(registry, config.terrain, noise2D, right, x + 1e-6, z))
      assert.ok(difference < 1e-3, `height discontinuity for seed ${seed} at ${x}, ${z}: ${difference}`)
    }
  }
})

test('seeded chunk heights are deterministic and match overlapping world positions', () => {
  for (const seed of [42, 73, 20260608]) {
    const config = structuredClone(worldConfig)
    config.seed = seed
    const generator = createGenerator(config)
    for (const origin of [{ x: -180, z: 215 }, { x: 320, z: -275 }, { x: -650, z: 480 }]) {
      const request = { origin, size: 16, halo: 2 }
      const first = generator.generateChunk(request)
      assert.deepEqual(generator.generateChunk(request).heightField.values, first.heightField.values)
      const secondOrigin = { x: origin.x + 9, z: origin.z + 7 }
      const second = generator.generateChunk({ origin: secondOrigin, size: 16, halo: 2 })
      for (let z = 0; z < 13; z++) {
        for (let x = 0; x < 11; x++) {
          assert.equal(first.getHeight(x + 9, z + 7), second.getHeight(x, z), `chunk seam for seed ${seed}`)
        }
      }
    }
    const map = generator.generate()
    const chunk = generator.generateChunk({ origin: { x: 8, z: 9 }, size: 16, halo: 2 })
    for (let z = 0; z < 20; z++) {
      for (let x = 0; x < 20; x++) assert.equal(map.getHeight(x + 6, z + 7), chunk.getHeight(x, z))
    }
  }
})
