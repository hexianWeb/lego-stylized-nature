import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import VoxelTerrainPlaceholder from '../src/world/chunks/VoxelTerrainPlaceholder.js'
import ChunkManager from '../src/world/chunks/ChunkManager.js'
import ChunkColumnTransition, { CHUNK_TRANSITION_DEFAULTS } from '../src/world/chunks/ChunkColumnTransition.js'
import { buildPackedChunk, createChunkBuilder } from '../src/world/chunks/chunkBuildData.js'
import { worldConfig } from '../src/world/WorldConfig.js'

function createConfig() {
  const config = structuredClone(worldConfig)
  Object.assign(config.chunks, { size: 16, halo: 0, placeholder: { enabled: true, radius: 3, cellSpan: 4 } })
  config.placement = { enablePrefabs: false, enableTrees: false }
  config.terrain.ao.enabled = false
  return config
}

function createPlaceholder(t, config = createConfig()) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#89bfb1')
  const parentGroup = new THREE.Group()
  scene.add(parentGroup)
  const placeholder = new VoxelTerrainPlaceholder({ config, parentGroup })
  t.after(() => placeholder.dispose())
  return { placeholder, config, parentGroup }
}

function chunkMatrices(placeholder, key) {
  const chunk = placeholder.cache.get(key)
  return placeholder.mesh.instanceMatrix.array.slice(chunk.start * 16, (chunk.start + chunk.voxels.length) * 16)
}

test('large boxes cover every cell exactly once, including negative chunks and clipped edge boxes', (t) => {
  const config = createConfig()
  config.chunks.placeholder.cellSpan = 6
  const { placeholder } = createPlaceholder(t, config)
  placeholder.update({ x: -1, z: 0 })
  for (const coord of [{ x: -1, z: 0 }, { x: 0, z: 0 }]) {
    const chunk = placeholder.createChunk(coord)
    const coverage = new Uint8Array(config.chunks.size ** 2)
    assert.equal(chunk.voxels.length, 9, 'the placeholder uses a coarse 3 by 3 grid')
    for (const voxel of chunk.voxels) {
      const x0 = Math.round((voxel.x - voxel.size / 2) / config.terrain.cellSize) - coord.x * config.chunks.size
      const z0 = Math.round((voxel.z - voxel.sizeZ / 2) / config.terrain.cellSize) - coord.z * config.chunks.size
      const width = Math.round(voxel.size / config.terrain.cellSize)
      const depth = Math.round(voxel.sizeZ / config.terrain.cellSize)
      assert.ok(x0 >= 0 && z0 >= 0 && x0 + width <= 16 && z0 + depth <= 16)
      for (let z = z0; z < z0 + depth; z++)
        for (let x = x0; x < x0 + width; x++) coverage[z * 16 + x]++
      assert.ok(Math.abs(voxel.y - voxel.sizeY / 2 + placeholder.heightStep) < 1e-8, 'boxes stand on a shared base')
      assert.ok(voxel.cells.every(cell => cell >= 0 && cell < coverage.length))
    }
    assert.ok(coverage.every(count => count === 1), 'no empty strips or overlapping ownership at chunk seams')
    assert.deepEqual(placeholder.createChunk(coord), chunk, 'world-space samples are deterministic')
  }
  assert.equal(placeholder.mesh.count, 49 * 9)
  assert.equal(placeholder.mesh.count, placeholder.capacity)
})

test('every biome uses its real terrain heights and surface palette at the coarse sample positions', (t) => {
  const signatures = new Set()
  for (const biomeId of ['forest', 'autumnForest', 'desert', 'volcano', 'snowForest', 'meadow', 'wetland']) {
    const config = createConfig()
    config.biomes.previewBiome = biomeId
    const { placeholder } = createPlaceholder(t, config)
    const coord = { x: -1, z: 2 }
    placeholder.update(coord)
    const chunk = placeholder.cache.get('-1:2')
    const terrain = createChunkBuilder(config).terrainGenerator.generateChunk({ origin: { x: -16, z: 32 }, size: 16, halo: 0 })
    const actual = new THREE.Color()
    const expected = new THREE.Color()
    for (const [index, voxel] of chunk.voxels.entries()) {
      const sample = voxel.sample
      assert.equal(sample.biomeCell.biomeId, biomeId)
      assert.equal(sample.y, terrain.getHeight(sample.x + 16, sample.z - 32), 'coarse relief samples the same seeded terrain')
      placeholder.colorResolver.resolveColor(sample, expected)
      placeholder.mesh.getColorAt(chunk.start + index, actual)
      assert.ok(actual.toArray().every((value, channel) => Math.abs(value - expected.toArray()[channel]) < 1e-6), 'nearby boxes retain the actual surface palette')
    }
    signatures.add(actual.getHexString())
    const matrices = chunkMatrices(placeholder, '-1:2')
    chunk.voxels.forEach((voxel, index) => {
      for (const [axis, dimension] of [[0, voxel.size], [5, voxel.sizeY], [10, voxel.sizeZ]])
        assert.ok(Math.abs(matrices[index * 16 + axis] - dimension) < 1e-5)
    })
  }
  assert.equal(signatures.size, 7, 'biomes do not collapse to one generic placeholder color')
})

test('a large box stays intact until its trailing terrain column starts, in all four directions', (t) => {
  const { placeholder, config } = createPlaceholder(t)
  for (const direction of [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }]) {
    const transition = new ChunkColumnTransition({ chunkSize: config.chunks.size, cellSize: config.terrain.cellSize })
    transition.start(1, direction, { columnDuration: 0.4, waveDuration: 0.65 })
    const slots = new Map([['0:0', { columnTransition: transition }]])
    placeholder.update({ x: 0, z: 0 }, slots)
    const initial = chunkMatrices(placeholder, '0:0')
    transition.update(0.17)
    placeholder.update({ x: 0, z: 0 }, slots)
    const partial = chunkMatrices(placeholder, '0:0')
    for (const [index, voxel] of placeholder.cache.get('0:0').voxels.entries()) {
      if (voxel.cells.some(cell => transition.progress[cell] === 0))
        assert.equal(partial[index * 16], initial[index * 16], 'unrevealed columns retain full cover')
    }
    transition.update(1.05)
    placeholder.update({ x: 0, z: 0 }, slots)
    assert.ok(chunkMatrices(placeholder, '0:0').every((value, index) => index % 16 !== 0 || value === 0))
  }
})

test('coarse boxes follow each rising column while queued neighbors remain fully covered', (t) => {
  const { placeholder, config } = createPlaceholder(t)
  const transition = new ChunkColumnTransition({ chunkSize: config.chunks.size, cellSize: config.terrain.cellSize })
  transition.start(1, { x: 1, z: 0 }, { columnDuration: 1, waveDuration: 1, riseDistance: 3 })
  const slots = new Map([['0:0', { columnTransition: transition }]])
  placeholder.update({ x: 0, z: 0 }, slots)
  const initial = chunkMatrices(placeholder, '0:0')
  const pending = chunkMatrices(placeholder, '1:0')
  const geometry = placeholder.mesh.geometry
  transition.update(0.55)
  placeholder.update({ x: 0, z: 0 }, slots)
  const partial = chunkMatrices(placeholder, '0:0')
  let shrinking = 0
  let waiting = 0
  placeholder.cache.get('0:0').voxels.forEach((voxel, index) => {
    const offset = index * 16
    if (partial[offset] < initial[offset]) {
      assert.ok(Math.min(...voxel.cells.map(cell => transition.progress[cell])) > 0, 'only columns that have started rising dissolve')
      assert.ok(partial[offset + 13] > initial[offset + 13], 'shrinking pieces float gently upward')
      shrinking++
    }
    if (Math.min(...voxel.cells.map(cell => transition.progress[cell])) === 0) {
      assert.deepEqual(partial.slice(offset, offset + 16), initial.slice(offset, offset + 16))
      waiting++
    }
  })
  assert.ok(shrinking > 0 && waiting > 0, 'the placeholder never disappears as a whole chunk at the start')
  assert.deepEqual(chunkMatrices(placeholder, '1:0'), pending)
  transition.update(3)
  placeholder.update({ x: 0, z: 0 }, slots)
  const finished = chunkMatrices(placeholder, '0:0')
  for (let index = 0; index < finished.length; index += 16)
    assert.equal(finished[index], 0, 'fully revealed terrain has no remaining placeholder boxes')
  assert.equal(placeholder.mesh.geometry, geometry, 'dissolving never rebuilds geometry')
  slots.clear()
  placeholder.update({ x: 0, z: 0 }, slots)
  assert.deepEqual(chunkMatrices(placeholder, '0:0'), initial, 'recycled terrain immediately regains its coarse cover')
})

test('turning around and teleporting reuse deterministic placeholder without growing caches or uploads', (t) => {
  const { placeholder } = createPlaceholder(t)
  placeholder.update({ x: 0, z: 0 })
  const initial = placeholder.cache.get('0:0').voxels
  const retained = placeholder.cache.get('1:0')
  const geometry = placeholder.mesh.geometry
  const matrixBuffer = placeholder.mesh.instanceMatrix.array
  const colorBuffer = placeholder.mesh.instanceColor.array
  const version = placeholder.mesh.instanceMatrix.version
  placeholder.update({ x: 0, z: 0 })
  assert.equal(placeholder.mesh.instanceMatrix.version, version, 'idle placeholder do not upload transforms')
  placeholder.update({ x: 1, z: 0 })
  assert.equal(placeholder.cache.get('1:0'), retained)
  for (let x = 2; x < 18; x++) {
    placeholder.update({ x: x * 3, z: -x * 4 })
    assert.equal(placeholder.cache.size, 49)
    assert.ok(placeholder.mesh.count <= placeholder.capacity)
    assert.ok(placeholder.mesh.instanceMatrix.updateRanges.length <= 1)
  }
  placeholder.update({ x: 0, z: 0 })
  assert.deepEqual(placeholder.cache.get('0:0').voxels, initial)
  assert.equal(placeholder.mesh.geometry, geometry)
  assert.equal(placeholder.mesh.instanceMatrix.array, matrixBuffer)
  assert.equal(placeholder.mesh.instanceColor.array, colorBuffer)
  assert.ok(matrixBuffer.every(Number.isFinite))
})

test('preview, spacing, regeneration, and disposal do not leave stale placeholder or graphics resources', () => {
  const config = createConfig()
  const parentGroup = new THREE.Group()
  const placeholder = new VoxelTerrainPlaceholder({ config, parentGroup })
  let geometryDisposed = false
  let materialDisposed = false
  let meshDisposed = false
  placeholder.geometry.addEventListener('dispose', () => { geometryDisposed = true })
  placeholder.material.addEventListener('dispose', () => { materialDisposed = true })
  placeholder.mesh.addEventListener('dispose', () => { meshDisposed = true })
  placeholder.update({ x: 0, z: 0 })
  placeholder.refresh(false)
  assert.equal(placeholder.mesh.visible, false)
  placeholder.refresh(true)
  assert.equal(placeholder.mesh.visible, true)
  config.chunks.debugSpacing = 1
  placeholder.update({ x: 0, z: 0 })
  assert.equal(placeholder.mesh.visible, false)
  config.chunks.debugSpacing = 0
  placeholder.update({ x: 0, z: 0 })
  assert.equal(placeholder.mesh.visible, true)
  const oldVoxels = placeholder.cache.get('0:0').voxels
  placeholder.reset()
  assert.equal(placeholder.cache.size, 0)
  assert.equal(placeholder.mesh.count, 0)
  assert.equal(placeholder.mesh.visible, false)
  config.seed++
  placeholder.update({ x: 0, z: 0 })
  assert.notDeepEqual(placeholder.cache.get('0:0').voxels, oldVoxels)
  placeholder.dispose()
  assert.ok(geometryDisposed && materialDisposed && meshDisposed)
  assert.equal(parentGroup.children.length, 0)
})

function createManager(t) {
  const config = createConfig()
  config.chunks.transition = { ...CHUNK_TRANSITION_DEFAULTS }
  const builder = createChunkBuilder(config)
  const jobs = []
  const parentGroup = new THREE.Group()
  const manager = new ChunkManager({
    config,
    terrainGenerator: builder.terrainGenerator,
    layeredTerrainBuilder: builder.layeredTerrainBuilder,
    brickColorResolver: {},
    parentGroup,
    buildWorkers: {
      hasIdleWorker: () => jobs.length === 0,
      run(task, callback) { jobs.push({ task, callback }) },
      terminate() { jobs.length = 0 },
    },
    createSlot(index) {
      return {
        index,
        group: new THREE.Group(),
        populate({ coord }) { this.coord = { ...coord } },
        show() { this.group.visible = true },
        hide() { this.group.visible = false },
        setPrefabsVisible() {},
        startLoading(direction, settings) {
          this.columnTransition = new ChunkColumnTransition({ chunkSize: config.chunks.size, cellSize: config.terrain.cellSize })
          this.columnTransition.start(1, direction, settings)
        },
        updateTransition(delta) { return this.columnTransition?.update(delta) ?? true },
        resetTransition() { this.columnTransition?.reset(); this.columnTransition = null },
        discardTransition() { this.columnTransition?.discard(); this.columnTransition = null },
        dispose() { this.resetTransition() },
      }
    },
  })
  t.after(() => manager.dispose())
  return { manager, jobs, builder }
}

test('worker wait and reveal share coarse coverage while preserving the original rise animation', (t) => {
  const { manager, jobs, builder } = createManager(t)
  manager.bootstrap(0, 0)
  const placeholder = manager.terrainPlaceholder
  const job = jobs[0]
  const coord = { x: job.task.origin.x / manager.chunkSize, z: job.task.origin.z / manager.chunkSize }
  const key = `${coord.x}:${coord.z}`
  const waiting = chunkMatrices(placeholder, key)
  manager.update(0, 0, null, 0.5)
  assert.deepEqual(chunkMatrices(placeholder, key), waiting, 'in-flight terrain retains all its placeholder')
  job.callback(buildPackedChunk(builder, job.task))
  jobs.shift()
  manager.update(0, 0, null, 0)
  const slot = manager.activeSlots.get(key)
  assert.deepEqual(slot.columnTransition.settings, CHUNK_TRANSITION_DEFAULTS, 'rise duration, wave, scaling and height are unchanged')
  assert.deepEqual(chunkMatrices(placeholder, key), waiting, 'worker completion begins the reveal with placeholder intact')
  manager.update(0, 0, null, 0.4)
  const partial = chunkMatrices(placeholder, key)
  assert.ok(partial.some((value, index) => index % 16 === 0 && value < waiting[index]))
  assert.ok(partial.some((value, index) => index % 16 === 0 && value === waiting[index] && value > 0))
  manager.transitionSettings.enabled = false
  manager.update(0, 0, null, 0)
  const finished = chunkMatrices(placeholder, key)
  assert.ok(finished.every((value, index) => index % 16 !== 0 || value === 0))
  assert.equal(manager.slots.length, 9)
})

test('teleport and regeneration reject obsolete worker placeholder and retain the nine-slot pool', (t) => {
  const { manager, jobs, builder } = createManager(t)
  manager.bootstrap(0, 0)
  const oldJob = jobs[0]
  const oldResult = buildPackedChunk(builder, oldJob.task)
  manager.update(100, -100, null, 0.1)
  assert.equal(manager.slots.length, 9)
  assert.equal(manager.terrainPlaceholder.cache.size, 49)
  assert.ok([...manager.terrainPlaceholder.cache.keys()].every(key => key !== '0:0'))
  manager.bootstrap(-100, 100)
  oldJob.callback(oldResult)
  assert.equal(manager.completedBuilds.length, 0, 'old epochs cannot replace placeholder after regeneration')
  assert.equal(manager.slots.length, 9)
  assert.equal(manager.activeSlots.size, 1)
  assert.equal(manager.terrainPlaceholder.cache.size, 49)
})
