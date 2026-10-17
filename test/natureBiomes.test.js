import test from 'node:test'
import assert from 'node:assert/strict'
import { worldConfig } from '../src/world/WorldConfig.js'
import WorldMaterials from '../src/world/WorldMaterials.js'
import BiomeRegistry from '../src/world/biomes/BiomeRegistry.js'
import BiomeMaskGenerator from '../src/world/biomes/BiomeMaskGenerator.js'
import { buildPackedChunk, createChunkBuilder, unpackChunkBuild } from '../src/world/chunks/chunkBuildData.js'
import PrefabRegistry from '../src/world/prefabs/PrefabRegistry.js'
import PrefabPlacer from '../src/world/prefabs/PrefabPlacer.js'
import { canPlacePrefab, samplePlacementDensity } from '../src/world/prefabs/placementRules.js'

const biomeIds = ['snowForest', 'meadow', 'wetland']

function createConfig(biomeId) {
  const config = structuredClone(worldConfig)
  config.biomes.previewBiome = biomeId
  return config
}

function placementRecords(placer, map, include = () => true) {
  return [...placer.collectTransforms(map).values()]
    .flatMap(bucket => bucket.transforms.filter(include).map(({ position, ...transform }) => ({
      prefabId: bucket.prefabId,
      variantIndex: bucket.variantIndex,
      ...transform,
    })))
    .sort((a, b) => a.z - b.z || a.x - b.x)
}

test('new biomes produce snowy relief, open hills and shallow wetland islands', () => {
  const stats = {}
  for (const id of biomeIds) {
    const config = createConfig(id)
    const map = createChunkBuilder(config).terrainGenerator.generateChunk({ origin: { x: -64, z: -64 }, size: 128, halo: 8 })
    const cells = map.surfaceCells.slice(8, 136).flatMap(row => row.slice(8, 136))
    stats[id] = {
      water: cells.filter(cell => cell.isWater).length / cells.length,
      max: Math.max(...cells.map(cell => cell.height)),
    }
    assert.ok(cells.every(cell => Number.isInteger(cell.height) && cell.height >= 0 && cell.height <= config.terrain.maxHeight))
  }
  assert.ok(stats.wetland.water > 0.3 && stats.wetland.water < 0.85, 'wetlands must contain both water and islands')
  assert.ok(stats.meadow.water < 0.15, 'meadows should be mostly open land')
  assert.ok(stats.snowForest.max > stats.wetland.max)
  assert.ok(stats.meadow.max >= 27, 'flower hills need a pronounced silhouette')
  assert.ok(stats.meadow.max > stats.wetland.max)
})

for (const id of biomeIds) {
  test(`${id} terrain and vegetation agree across chunk overlaps and worker transfers`, () => {
    const config = createConfig(id)
    const builder = createChunkBuilder(config)
    const registry = new PrefabRegistry({ items: {} })
    const placer = new PrefabPlacer({ config, biomeRegistry: new BiomeRegistry(), prefabRegistry: registry, materials: {} })
    const job = { origin: { x: -40, z: -32 }, size: 64, halo: 8 }
    const first = builder.terrainGenerator.generateChunk(job)
    const second = builder.terrainGenerator.generateChunk({ ...job, origin: { x: -8, z: -32 } })
    const restored = unpackChunkBuild(structuredClone(buildPackedChunk(builder, job))).terrainMap
    try {
      const records = placementRecords(placer, first)
      assert.ok(records.length > 0)
      assert.deepEqual(placementRecords(placer, restored), records)
      assert.deepEqual(restored.heightField.values, first.heightField.values)
      assert.deepEqual(
        placementRecords(placer, first, t => t.x >= -8),
        placementRecords(placer, second, t => t.x < 24),
      )
      for (let z = 8; z < 72; z++) {
        for (let x = 8; x < 40; x++) {
          assert.equal(first.getHeight(x + 32, z), second.getHeight(x, z))
          assert.deepEqual(first.getBiomeCell(x + 32, z), second.getBiomeCell(x, z))
        }
      }
    }
    finally {
      placer.dispose()
      registry.dispose()
    }
  })
}

test('wetland reeds reject deep water and shore vegetation remains opt-in', () => {
  const biome = { biomeId: 'wetland' }
  const water = { height: 6, slope: 0, isWater: true, isShore: false }
  const reeds = { placement: { surface: 'water' } }
  assert.equal(canPlacePrefab({ maxWaterDepth: 1 }, reeds, biome, water, 7), true)
  assert.equal(canPlacePrefab({ maxWaterDepth: 1 }, reeds, biome, { ...water, height: 5 }, 7), false)
  const land = { placement: { surface: 'land' } }
  const shore = { height: 8, slope: 0, isWater: false, isShore: true }
  assert.equal(canPlacePrefab({}, land, biome, shore, 7), false)
  assert.equal(canPlacePrefab({ allowShore: true }, land, biome, shore, 7), true)
  assert.equal(canPlacePrefab({ allowShore: true }, land, biome, water, 7), false)
  assert.equal(canPlacePrefab({ allowShore: true }, land, biome, { ...shore, isLava: true }, 7), false)
})

test('plant patches have dense and sparse areas without seams at negative grid boundaries', () => {
  const rule = new BiomeRegistry().get('meadow').prefabs.find(rule => rule.id === 'meadowFlower')
  const densities = []
  for (let z = -120; z <= 120; z += 4) {
    for (let x = -120; x <= 120; x += 4) {
      const density = samplePlacementDensity(rule, x, z, 42)
      assert.ok(density >= rule.patch.minDensity && density <= rule.density)
      densities.push(density)
    }
  }
  assert.ok(Math.min(...densities) < 0.01)
  assert.ok(Math.max(...densities) > 0.08)
  for (const x of [-52, -26, 0, 26, 52]) {
    const left = samplePlacementDensity(rule, x - 1e-5, -17, 42)
    const right = samplePlacementDensity(rule, x + 1e-5, -17, 42)
    assert.ok(Math.abs(left - right) < 1e-6)
  }
})

test('compact meadow regions reduce actual land coverage and blend continuously across grid edges', () => {
  const config = createConfig('')
  config.biomes.cellSize = 96
  config.biomes.blendWidth = 16
  config.biomes.warp = { amplitude: 12, scale: 80 }
  config.biomes.originBiome = null
  config.biomes.table = [{ id: 'forest', weight: 1 }, { id: 'meadow', weight: 1, regionScale: 0.6 }]
  const original = structuredClone(config)
  original.biomes.table[1].regionScale = 1
  const compact = new BiomeMaskGenerator(config)
  const broad = new BiomeMaskGenerator(original)
  let compactCount = 0
  let broadCount = 0
  for (let z = -768; z <= 768; z += 16) {
    for (let x = -768; x <= 768; x += 16) {
      compactCount += compact.getCellBiome(x, z).biomeId === 'meadow' ? 1 : 0
      broadCount += broad.getCellBiome(x, z).biomeId === 'meadow' ? 1 : 0
    }
  }
  assert.ok(compactCount > broadCount * 0.2, 'small meadow regions should remain discoverable')
  assert.ok(compactCount < broadCount * 0.8, 'region size must shrink even with unchanged selection weights')
  for (let gx = -4; gx <= 4; gx++) {
    for (let z = -384; z <= 384; z += 7) {
      const left = compact.getCellBiome(gx * 96 - 1e-5, z).weights.meadow ?? 0
      const right = compact.getCellBiome(gx * 96 + 1e-5, z).weights.meadow ?? 0
      assert.ok(Math.abs(left - right) < 1e-4)
    }
  }
})

test('biome preview works away from spawn and restores the seeded mixed world', () => {
  const config = createConfig('')
  const mask = new BiomeMaskGenerator(config)
  const origin = { x: -800, z: 600 }
  const mixed = mask.generateForBounds(origin, 12, 12)
  for (const id of biomeIds) {
    config.biomes.previewBiome = id
    const cells = mask.generateForBounds(origin, 12, 12).flat()
    assert.ok(cells.every(cell => cell.biomeId === id && cell.weights[id] === 1))
    assert.ok(cells.every(cell => Number.isFinite(cell.sites[id].distance)))
  }
  config.biomes.previewBiome = ''
  assert.deepEqual(mask.generateForBounds(origin, 12, 12), mixed)
})

test('new prefab builders instantiate with valid bounds and keep snow separate from tree tint', () => {
  const config = structuredClone(worldConfig)
  const registry = new PrefabRegistry({ items: {} })
  const materials = new WorldMaterials({ config })
  const placer = new PrefabPlacer({ config, biomeRegistry: new BiomeRegistry(), prefabRegistry: registry, materials })
  const groups = []
  try {
    for (const [id, biomeId] of [
      ['snowPine', 'snowForest'], ['iceCluster', 'snowForest'],
      ['waterLily', 'wetland'], ['meadowFlower', 'meadow'],
    ]) {
      const entry = registry.get(id).entry
      for (let variant = 0; variant < entry.variants.length; variant++) {
        const source = registry.getVariantAsset(id, variant).scene
        const group = placer.buildVariantInstances(source, [{ position: [0, 0, 0], rotationY: 0, x: 0, y: 0, z: 0, instanceColorIndex: 1 }], entry, null, id, biomeId)
        groups.push(group)
        assert.ok(group.children.length > 0 && group.children.length <= 3)
        for (const mesh of group.children) {
          assert.ok(Number.isFinite(mesh.boundingSphere.radius) && mesh.boundingSphere.radius > 0)
          assert.ok([...mesh.geometry.attributes.position.array].every(Number.isFinite))
        }
        if (id === 'snowPine') {
          const snowIndex = source.children.findIndex(child => child.name === 'snowPine_snow')
          assert.equal(group.children[snowIndex].instanceColor, null)
          assert.equal(group.children[snowIndex].material, source.children[snowIndex].material)
        }
        if (entry.instanceColors) {
          const index = source.children.findIndex(child => child.name.endsWith('_InstanceColor'))
          assert.ok(group.children[index].instanceColor)
        }
      }
    }
  }
  finally {
    for (const group of groups) group.traverse(node => node.isInstancedMesh && node.dispose())
    placer.dispose()
    materials.dispose()
    registry.dispose()
  }
})
