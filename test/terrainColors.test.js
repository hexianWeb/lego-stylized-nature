import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import BiomeRegistry from '../src/world/biomes/BiomeRegistry.js'
import BiomeBlender from '../src/world/biomes/BiomeBlender.js'
import BrickColorResolver from '../src/world/bricks/BrickColorResolver.js'
import TerrainBrickRenderer from '../src/world/bricks/TerrainBrickRenderer.js'
import ChunkRenderSlot from '../src/world/chunks/ChunkRenderSlot.js'
import WorldMaterials from '../src/world/WorldMaterials.js'
import World from '../src/world/world.js'
import {
  createTerrainColorSettings,
  exportTerrainColorScheme,
  importTerrainColorScheme,
  prepareColorPalette,
  sampleColorPalette
} from '../src/world/bricks/terrainColorScheme.js'

function createResolver(overrides = {}) {
  const config = {
    seed: 123,
    terrain: {
      cellSize: 0.2,
      layerHeight: 0.095,
      ao: { enabled: false, previewGrayscale: false },
      color: { ...createTerrainColorSettings(), ...overrides }
    }
  }
  const biomeRegistry = new BiomeRegistry()
  const resolver = new BrickColorResolver({
    config,
    biomeRegistry,
    biomeBlender: new BiomeBlender(biomeRegistry)
  })
  return { config, resolver, biomeRegistry }
}

function placement(x, y, z, layer = 'deep') {
  return {
    x, y, z, layer,
    biomeCell: { weights: { forest: 1 } },
    surfaceCell: { isShore: false, height: 18 }
  }
}

test('discrete selection returns exact authored colors, including at region boundaries', () => {
  const entries = [
    { at: 0, color: '#267532' },
    { at: 0.5, color: '#2e8b3c' },
    { at: 1, color: '#39984a' }
  ]
  const palette = prepareColorPalette(entries)
  const allowed = new Set(entries.map((entry) => entry.color.slice(1)))
  const color = new THREE.Color()
  for (let i = -10; i <= 110; i++) {
    assert.ok(allowed.has(sampleColorPalette(palette, i / 100, color).getHexString()))
  }
  assert.equal(sampleColorPalette(palette, 0.249, color).getHexString(), '267532')
  assert.equal(sampleColorPalette(palette, 0.25, color).getHexString(), '2e8b3c')
  assert.equal(sampleColorPalette(palette, 0.749, color).getHexString(), '2e8b3c')
  assert.equal(sampleColorPalette(palette, 0.75, color).getHexString(), '39984a')

  const plateau = prepareColorPalette([
    { at: 0, color: '#222222' }, { at: 0.35, color: '#8c8c8c' },
    { at: 0.65, color: '#8c8c8c' }, { at: 1, color: '#dddddd' }
  ])
  assert.equal(sampleColorPalette(plateau, 0.47, color).getHexString(), '8c8c8c')
})

test('authored biome palettes are used as editable copies', () => {
  const { config, biomeRegistry } = createResolver()
  const forest = biomeRegistry.get('forest')
  for (const layer of ['surface', 'subsurface', 'deep', 'shore']) {
    assert.deepEqual(config.terrain.color.palettes.forest[layer], forest.terrain.palettes[layer])
    assert.notEqual(config.terrain.color.palettes.forest[layer], forest.terrain.palettes[layer])
  }
})

test('biome layers without authored palettes are centered on their existing base colors', () => {
  const { config, resolver, biomeRegistry } = createResolver({ contrast: 0, microVariation: 0, heightInfluence: 0 })
  const color = new THREE.Color()
  for (const biome of biomeRegistry.getAll()) {
    for (const layer of ['surface', 'subsurface', 'deep', 'shore']) {
      if (biome.terrain.palettes?.[layer]) continue
      const sample = placement(3, 8, 7, layer === 'shore' ? 'surface' : layer)
      sample.biomeCell.weights = { [biome.id]: 1 }
      sample.surfaceCell.isShore = layer === 'shore'
      resolver.resolveColor(sample, color)
      assert.equal(color.getHexString(), new THREE.Color(biome.terrain.colors[layer]).getHexString())
      assert.equal(config.terrain.color.palettes[biome.id][layer].length, 3)
    }
  }
})

test('world-grid noise is repeatable, spatially coherent, and the color seed is independent of terrain generation', () => {
  const { config, resolver } = createResolver({ microVariation: 0, layerStrength: 0 })
  const sample = placement(-37, 14, 129)
  const original = resolver.resolve(sample)
  const originalTone = resolver.sampleTone(sample)
  resolver.resolve(placement(901, 4, -43))
  assert.equal(resolver.resolve(sample), original)

  config.terrain.color.seed++
  assert.notEqual(resolver.sampleTone(sample), originalTone)
  assert.equal(config.seed, 123)
  config.terrain.color.seed--
  assert.equal(resolver.resolve(sample), original)

  let adjacentDifference = 0
  let distantDifference = 0
  for (let i = 0; i < 64; i++) {
    const p = placement(i * 7 - 128, 10, i * 11 - 64)
    const tone = resolver.sampleTone(p)
    adjacentDifference += Math.abs(tone - resolver.sampleTone({ ...p, x: p.x + 1 }))
    distantDifference += Math.abs(tone - resolver.sampleTone({ ...p, x: p.x + 20 }))
  }
  assert.ok(distantDifference > adjacentDifference * 3)
})

test('surface regions use 2D noise while rock color also varies vertically', () => {
  const { resolver } = createResolver({ microVariation: 0, layerStrength: 0 })
  assert.equal(resolver.sampleTone(placement(13, 5, 27, 'surface')),
    resolver.sampleTone(placement(13, 24, 27, 'surface')))
  assert.notEqual(resolver.sampleTone(placement(13, 5, 27)),
    resolver.sampleTone(placement(13, 24, 27)))
})

test('height adds a bounded bias from the generated terrain surface, preserving the noise field', () => {
  const { config, resolver } = createResolver({ contrast: 0.4, microVariation: 0, heightInfluence: 0.25 })
  const sample = placement(13, 5, 27, 'surface')
  const middle = resolver.sampleTone(sample)
  sample.surfaceCell.height = 0
  const low = resolver.sampleTone(sample)
  sample.surfaceCell.height = 36
  const high = resolver.sampleTone(sample)
  assert.ok(Math.abs(low - (middle - 0.125)) < 0.000001)
  assert.ok(Math.abs(high - (middle + 0.125)) < 0.000001)
  assert.equal(resolver.sampleTone({ ...sample, y: 40 }), high)

  sample.surfaceCell.height = 80
  assert.equal(resolver.sampleTone(sample), high)
  sample.surfaceCell.height = -10
  assert.equal(resolver.sampleTone(sample), low)
  config.terrain.color.heightInfluence = 0
  assert.equal(resolver.sampleTone(sample), middle)
})

test('equal-height terrain still has multiple noise-driven regions, using only palette colors', () => {
  const { config, resolver } = createResolver({ microVariation: 0, layerStrength: 0, heightInfluence: 0.5 })
  config.terrain.color.palettes.forest.deep = [
    { at: 0, color: '#123456' }, { at: 0.5, color: '#556677' }, { at: 1, color: '#aabbcc' }
  ]
  const colors = new Set()
  const allowed = new Set(['123456', '556677', 'aabbcc'])
  let minTone = 1
  let maxTone = 0
  const target = new THREE.Color()
  for (let i = 0; i < 256; i++) {
    const sample = placement(i * 7 - 128, 10, i * 11 - 64)
    resolver.resolveColor(sample, target)
    const hex = target.getHexString()
    assert.ok(allowed.has(hex))
    colors.add(hex)
    minTone = Math.min(minTone, resolver.lastTone)
    maxTone = Math.max(maxTone, resolver.lastTone)
  }
  assert.ok(colors.size > 1)
  assert.ok(maxTone - minTone > 0.3)
})

test('chunk instances receive the same colors as the same world bricks in a full map', (t) => {
  const { config, resolver } = createResolver()
  const geometry = new THREE.BoxGeometry(0.2, 0.095, 0.2)
  const materials = new WorldMaterials()
  const chunkRenderer = new TerrainBrickRenderer({ config, brickGeometry: geometry, materials })
  const fullRenderer = new TerrainBrickRenderer({ config, brickGeometry: geometry, materials })
  const slot = new ChunkRenderSlot({
    index: 0, chunkSize: 64, cellSize: 0.2,
    terrainRenderer: chunkRenderer,
    heightfieldAO: { build() {}, isActive: () => false }
  })
  t.after(() => { slot.dispose(); fullRenderer.dispose(); materials.dispose(); geometry.dispose() })

  const local = [placement(0, 12, 63), placement(63, 7, 0, 'surface')]
  local[0].surfaceCell.height = 35
  local[1].surfaceCell.height = 9
  slot.populate({ coord: { x: 1, z: -2 }, terrainMap: {}, placements: local, colorResolver: resolver })
  fullRenderer.build(local.map((p) => ({ ...p, x: p.x + 64, z: p.z - 128 })), resolver)
  const a = new THREE.Color()
  const b = new THREE.Color()
  for (let i = 0; i < local.length; i++) {
    chunkRenderer.mesh.getColorAt(i, a)
    fullRenderer.mesh.getColorAt(i, b)
    assert.deepEqual(a.toArray(), b.toArray())
  }
  assert.equal(chunkRenderer.colorHistogram.reduce((sum, count) => sum + count, 0), local.length)
})

test('color editing and previews reuse the mesh and transforms, and base-color/noise previews bypass AO', (t) => {
  const { config, resolver } = createResolver()
  config.terrain.ao.enabled = true
  const geometry = new THREE.BoxGeometry()
  const materials = new WorldMaterials()
  const renderer = new TerrainBrickRenderer({ config, brickGeometry: geometry, materials })
  t.after(() => { renderer.dispose(); materials.dispose(); geometry.dispose() })
  let aoReads = 0
  const ao = { isActive: () => true, get: () => { aoReads++; return 0.2 } }
  renderer.build([placement(4, 9, 11)], resolver, ao)
  const mesh = renderer.mesh
  const matrixVersion = mesh.instanceMatrix.version
  const matrixData = [...mesh.instanceMatrix.array]
  const shaded = new THREE.Color()
  mesh.getColorAt(0, shaded)
  assert.equal(aoReads, 1)

  config.terrain.color.preview = 'baseColor'
  renderer.updateInstanceColors()
  const base = new THREE.Color()
  mesh.getColorAt(0, base)
  assert.equal(mesh.material, materials.previewMaterial)
  assert.equal(aoReads, 1)
  for (const [i, channel] of base.toArray().entries()) {
    assert.ok(Math.abs(channel * 0.2 - shaded.toArray()[i]) < 0.000001)
  }

  config.terrain.color.contrast = 0
  config.terrain.color.microVariation = 0
  config.terrain.color.palettes.forest.deep = [
    { at: 0, color: '#123456' }, { at: 0.5, color: '#998877' }, { at: 1, color: '#aabbcc' }
  ]
  resolver.invalidatePalettes()
  renderer.updateInstanceColors()
  mesh.getColorAt(0, base)
  const edited = new THREE.Color('#998877')
  for (const [i, channel] of base.toArray().entries()) {
    assert.ok(Math.abs(channel - edited.toArray()[i]) < 0.000001)
  }

  config.terrain.color.preview = 'noise'
  renderer.updateInstanceColors()
  mesh.getColorAt(0, base)
  assert.equal(base.r, base.g)
  assert.equal(base.g, base.b)
  assert.equal(aoReads, 1)
  assert.equal(renderer.mesh, mesh)
  assert.equal(mesh.instanceMatrix.version, matrixVersion)
  assert.deepEqual([...mesh.instanceMatrix.array], matrixData)
})

test('scheme JSON round-trips and invalid imports are atomic', () => {
  const { config, resolver } = createResolver()
  const settings = config.terrain.color
  settings.name = 'Warm rock study'
  settings.seed = 41
  settings.heightInfluence = 0.4
  settings.heightMin = 8
  settings.heightMax = 40
  settings.palettes.forest.deep[1].color = '#998877'
  const document = JSON.parse(JSON.stringify(exportTerrainColorScheme(settings)))
  assert.equal(document.version, 2)
  assert.equal(document.selection, 'nearest')
  assert.equal(Object.hasOwn(document, 'interpolation'), false)
  const other = createResolver().config.terrain.color
  importTerrainColorScheme(other, document)
  assert.deepEqual(exportTerrainColorScheme(other), document)
  assert.equal(other.preview, 'final')

  const before = structuredClone(settings)
  document.settings.seed = 100
  document.palettes.forest.deep[1].at = 1.1
  assert.throws(() => importTerrainColorScheme(settings, document), /Invalid color/)
  assert.deepEqual(settings, before)
  document.palettes.forest.deep[1].at = 0.5
  document.settings.heightMin = 40
  document.settings.heightMax = 8
  assert.throws(() => importTerrainColorScheme(settings, document), /Height range/)
  assert.deepEqual(settings, before)
  resolver.invalidatePalettes()
})

test('legacy schemes and runtime ramps retain their authored colors as discrete palettes', () => {
  const current = exportTerrainColorScheme(createResolver().config.terrain.color)
  const legacySettings = { ...current.settings }
  delete legacySettings.heightInfluence
  delete legacySettings.heightMin
  delete legacySettings.heightMax
  const legacy = {
    version: 1, interpolation: 'oklab', name: 'Legacy palette',
    settings: legacySettings, ramps: current.palettes
  }
  const { config } = createResolver()
  importTerrainColorScheme(config.terrain.color, legacy)
  assert.deepEqual(config.terrain.color.palettes, legacy.ramps)
  assert.equal(config.terrain.color.heightInfluence, 0.25)
  assert.equal(exportTerrainColorScheme(config.terrain.color).version, 2)

  const runtime = createResolver({ palettes: undefined, ramps: structuredClone(legacy.ramps) })
  assert.deepEqual(runtime.config.terrain.color.palettes, legacy.ramps)
  assert.equal(Object.hasOwn(runtime.config.terrain.color, 'ramps'), false)
})

test('terrain preview remains isolated when a chunk is shown again and restores its requested prefab visibility', (t) => {
  const { config, resolver } = createResolver()
  const geometry = new THREE.BoxGeometry()
  const materials = new WorldMaterials()
  const renderer = new TerrainBrickRenderer({ config, brickGeometry: geometry, materials })
  const overlay = () => ({ group: new THREE.Group(), build() {}, dispose() {} })
  const slot = new ChunkRenderSlot({
    index: 0, chunkSize: 64, cellSize: 0.2,
    terrainRenderer: renderer,
    heightfieldAO: { build() {}, isActive: () => false },
    prefabPlacer: overlay(), waterRenderer: overlay(), lavaRenderer: overlay()
  })
  t.after(() => { slot.dispose(); materials.dispose(); geometry.dispose() })
  slot.populate({ coord: { x: 0, z: 0 }, terrainMap: {}, placements: [placement(0, 3, 0)], colorResolver: resolver })
  slot.setPrefabsVisible(true)
  config.terrain.color.preview = 'noise'
  slot.updateInstanceColors()
  slot.show()
  for (const system of [slot.waterRenderer, slot.lavaRenderer, slot.prefabPlacer]) {
    assert.equal(system.group.visible, false)
  }
  config.terrain.color.preview = 'final'
  slot.updateInstanceColors()
  slot.show()
  for (const system of [slot.waterRenderer, slot.lavaRenderer, slot.prefabPlacer]) {
    assert.equal(system.group.visible, true)
  }
})

test('World color refresh updates loaded slots without rebuilding terrain or AO', () => {
  const { config } = createResolver()
  config.chunks = { enabled: true }
  config.terrain.color.preview = 'baseColor'
  let refreshed = 0
  let invalidated = 0
  const group = () => new THREE.Group()
  const slot = {
    terrainRenderer: { colorHistogram: Uint32Array.from([0, 0, 0, 0, 1, 1, 0, 0, 0, 0]) }
  }
  const world = Object.assign(Object.create(World.prototype), {
    config,
    terrainGenerator: { generate() { assert.fail('Color editing rebuilt terrain') } },
    heightfieldAO: { build() { assert.fail('Color editing rebuilt AO') } },
    brickColorResolver: { invalidatePalettes() { invalidated++ } },
    terrainChunkManager: {
      activeSlots: new Map([['0:0', slot]]),
      refreshAOPreview(showOverlays) { refreshed++; assert.equal(showOverlays, false) }
    },
    playerAircraft: { group: group() },
    biomeCenterSystem: { group: group() }
  })
  world.refreshTerrainColors()
  assert.equal(refreshed, 1)
  assert.equal(invalidated, 1)
  assert.equal(world.playerAircraft.group.visible, false)
  assert.equal(world.biomeCenterSystem.group.visible, false)
  assert.deepEqual(world.getTerrainColorHistogram(), [...slot.terrainRenderer.colorHistogram])
})
