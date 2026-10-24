import assert from 'node:assert/strict'
import test from 'node:test'
import { getSunGateCandidate, planSunGate, applyLandmarkTerraces, isLandmarkReserved } from '../src/world/landmarks/landmarkPlacement.js'
import { worldConfig } from '../src/world/WorldConfig.js'
import BiomeMaskGenerator from '../src/world/biomes/BiomeMaskGenerator.js'
import BiomeRegistry from '../src/world/biomes/BiomeRegistry.js'
import TerrainGenerator from '../src/world/terrain/TerrainGenerator.js'
import TerrainMap from '../src/world/terrain/TerrainMap.js'
import HeightField from '../src/world/terrain/HeightField.js'
import PrefabPlacer from '../src/world/prefabs/PrefabPlacer.js'
import { buildPackedChunk, createChunkBuilder, getChunkBuildTransfer, unpackChunkBuild } from '../src/world/chunks/chunkBuildData.js'

const config = structuredClone(worldConfig)
config.landmarks = { ...config.landmarks, enabled: true, targetHeight: 7.6, terrainTopOffset: 0.12 }
const origin = { x: 72, z: 360 }
const bounds = { origin, size: 72, halo: 8 }

function generator(settings = config) {
  return new TerrainGenerator({ config: settings, biomeMaskGenerator: new BiomeMaskGenerator(settings), biomeRegistry: new BiomeRegistry() })
}

function flatMap(height = 14) {
  const width = bounds.size + bounds.halo * 2
  const heightField = new HeightField(width, width)
  for (const row of heightField.values) row.fill(height)
  return new TerrainMap({
    heightField, origin, visibleSize: bounds.size, halo: bounds.halo,
    biomeCells: Array.from({ length: width }, () => Array.from({ length: width }, () => ({ biomeId: 'desert', weights: { desert: 1 } }))),
    surfaceCells: Array.from({ length: width }, (_, z) => Array.from({ length: width }, (_, x) => ({ x, z, height, slope: 0, isWater: false, isShore: false, isLava: false }))),
  })
}

test('candidate has one stable regional owner and full terrace stays outside every neighbour halo', () => {
  for (const region of [{ x: 0, z: 1 }, { x: -2, z: -3 }, { x: 0, z: 2 }]) {
    const coords = []
    for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) coords.push({ x: (region.x * 3 + x) * 72, z: (region.z * 3 + z) * 72 })
    const sites = coords.map(origin => getSunGateCandidate({ ...bounds, origin }, config)).filter(Boolean)
    assert.equal(sites.length, 1)
    assert.deepEqual(coords.reverse().map(origin => getSunGateCandidate({ ...bounds, origin }, config)).filter(Boolean), sites)
    const site = sites[0]
    assert.ok(site.minX >= 8 && site.minZ >= 8)
    assert.ok(site.maxX <= 63 && site.maxZ <= 63)
    assert.ok(site.halfWidth > 2 && site.halfDepth > 2)
  }
  assert.equal(getSunGateCandidate(bounds, { ...config, landmarks: { enabled: false } }), null)
  assert.equal(getSunGateCandidate({ ...bounds, size: 32, origin: { x: 32, z: 160 } }, config), null)
})

test('single invalid sample anywhere in the complete terrace rejects the site', () => {
  const candidate = getSunGateCandidate(bounds, config)
  for (const invalid of [{ isWater: true }, { isLava: true }, { isShore: true }, { height: 45 }]) {
    const map = flatMap()
    Object.assign(map.surfaceCells[candidate.maxZ + 8][candidate.maxX + 8], invalid)
    assert.equal(planSunGate(map, config).length, 0)
  }
  const foreign = flatMap()
  foreign.biomeCells[candidate.minZ + 8][candidate.minX + 8] = { biomeId: 'forest', weights: { forest: 1 } }
  assert.equal(planSunGate(foreign, config).length, 0)
  const lavaBlend = flatMap()
  lavaBlend.biomeCells[candidate.minZ + 8][candidate.minX + 8].weights = { desert: 0.9, volcano: 0.1 }
  assert.equal(planSunGate(lavaBlend, config).length, 0)
})

test('whole foundation is flat and sits on actual brick stud tops, with a smooth outer transition', () => {
  const map = flatMap()
  const candidate = getSunGateCandidate(bounds, config)
  for (let z = 0; z < map.heightField.depth; z++) {
    for (let x = 0; x < map.heightField.width; x++) {
      const height = 10 + Math.round((x - 8) / 12)
      map.heightField.set(x, z, height)
      map.surfaceCells[z][x].height = height
    }
  }
  const before = structuredClone(map.heightField.values)
  const [site] = planSunGate(map, config)
  assert.ok(site)
  applyLandmarkTerraces(map.heightField, [site], 8, config)
  let changedBlendSamples = 0
  for (let z = 0; z < 72; z++) {
    for (let x = 0; x < 72; x++) {
      const height = map.heightField.get(x + 8, z + 8)
      const inFoundation = Math.abs((x + 0.5 - site.x) * 0.2) <= site.platformHalfWidth
        && Math.abs((z + 0.5 - site.z) * 0.2) <= site.platformHalfDepth
      if (inFoundation) assert.equal(height, site.terraceHeight)
      if (x < candidate.minX || x > candidate.maxX || z < candidate.minZ || z > candidate.maxZ)
        assert.equal(height, before[z + 8][x + 8])
      else if (!inFoundation && height !== before[z + 8][x + 8]) changedBlendSamples++
      if (x < 8 || z < 8 || x >= 64 || z >= 64) assert.equal(height, before[z + 8][x + 8])
    }
  }
  assert.ok(changedBlendSamples > 0)
  assert.equal(site.baseY, site.terraceHeight * 0.095 + 0.12)
})

test('generated site is available at the default seed and all final surface data agrees with platform heights', () => {
  const map = generator().generateChunk(bounds)
  assert.equal(map.landmarks.length, 1)
  const [site] = map.landmarks
  assert.equal(site.worldX, 21.659372275501312)
  assert.equal(site.worldZ, 79.4)
  assert.deepEqual(generator().generateChunk(bounds).landmarks, map.landmarks)
  for (let z = site.minZ; z <= site.maxZ; z++) {
    for (let x = site.minX; x <= site.maxX; x++) {
      const surface = map.getSurfaceCell(x + 8, z + 8)
      assert.equal(surface.height, map.heightField.get(x + 8, z + 8))
      assert.equal(surface.slope, map.heightField.getSlope(x + 8, z + 8))
      assert.equal(surface.isWater || surface.isLava || surface.isShore, false)
    }
  }
})

test('deformed terrain cannot alter another chunk halo, including negative coordinates', () => {
  const enabled = generator()
  const disabledConfig = structuredClone(config)
  disabledConfig.landmarks.enabled = false
  const disabled = generator(disabledConfig)
  for (const testOrigin of [origin, { x: -72, z: -144 }, { x: 144, z: 504 }]) {
    const map = enabled.generateChunk({ ...bounds, origin: testOrigin })
    const original = disabled.generateChunk({ ...bounds, origin: testOrigin })
    for (let z = 0; z < 88; z++) for (let x = 0; x < 88; x++) {
      if (x < 16 || z < 16 || x >= 72 || z >= 72)
        assert.equal(map.heightField.get(x, z), original.heightField.get(x, z))
    }
  }
})

test('worker packed transfer preserves site metadata, terrace, surface placements and AO exactly', () => {
  const packed = buildPackedChunk(createChunkBuilder(config), bounds)
  const direct = generator().generateChunk(bounds)
  const originalSites = structuredClone(packed.landmarks)
  const transferred = structuredClone(packed, { transfer: getChunkBuildTransfer(packed) })
  const unpacked = unpackChunkBuild(transferred)
  assert.deepEqual(unpacked.terrainMap.landmarks, originalSites)
  assert.deepEqual(unpacked.terrainMap.landmarks, direct.landmarks)
  assert.deepEqual(unpacked.terrainMap.heightField.values, direct.heightField.values)
  assert.ok(unpacked.aoValues.length > 0)
  for (const p of unpacked.placements) {
    assert.equal(p.surfaceCell, unpacked.terrainMap.getSurfaceCell(p.x + 8, p.z + 8))
    assert.equal(p.surfaceCell.height, direct.getSurfaceCell(p.x + 8, p.z + 8).height)
  }
})

test('prefab placement reserves the complete rotated building plus vegetation buffer', () => {
  const map = flatMap()
  map.landmarks = planSunGate(map, config)
  const site = map.landmarks[0]
  assert.equal(isLandmarkReserved(Math.floor(site.x), Math.floor(site.z), map.landmarks, 0.2), true)
  let evaluated = 0
  map.getBiomeCell = (x, z) => {
    assert.equal(isLandmarkReserved(x - 8, z - 8, map.landmarks, 0.2), false)
    evaluated++
    return { biomeId: 'desert' }
  }
  const placer = new PrefabPlacer({ config, biomeRegistry: { get: () => ({ prefabs: [] }) }, prefabRegistry: {} })
  assert.equal(placer.collectTransforms(map).size, 0)
  assert.ok(evaluated < 72 ** 2)
  placer.dispose()
})

test('quarter-turn placement swaps the footprint and leaves vegetation clear along the new long axis', () => {
  const map = flatMap()
  map.origin = { x: 144, z: 504 }
  const sites = planSunGate(map, config)
  assert.equal(sites.length, 1)
  const [site] = sites
  assert.equal(site.rotation, Math.PI / 2)
  assert.ok(site.halfDepth > site.halfWidth)
  const longZ = Math.floor(site.z + (site.halfDepth + site.vegetationPadding - 0.2) / 0.2)
  const outsideX = Math.ceil(site.x + (site.halfWidth + site.vegetationPadding) / 0.2)
  assert.equal(isLandmarkReserved(Math.floor(site.x), longZ, sites, 0.2), true)
  assert.equal(isLandmarkReserved(outsideX, Math.floor(site.z), sites, 0.2), false)
})
