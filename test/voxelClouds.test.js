import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import VoxelClouds from '../src/world/chunks/VoxelClouds.js'
import ChunkManager from '../src/world/chunks/ChunkManager.js'
import ChunkColumnTransition, { CHUNK_TRANSITION_DEFAULTS } from '../src/world/chunks/ChunkColumnTransition.js'
import { buildPackedChunk, createChunkBuilder } from '../src/world/chunks/chunkBuildData.js'
import { worldConfig } from '../src/world/WorldConfig.js'

function createConfig() {
  const config = structuredClone(worldConfig)
  Object.assign(config.chunks, { size: 16, halo: 0, clouds: { enabled: true, radius: 3 } })
  config.placement = { enablePrefabs: false, enableTrees: false }
  config.terrain.ao.enabled = false
  return config
}

function createClouds(t, config = createConfig()) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#89bfb1')
  const parentGroup = new THREE.Group()
  scene.add(parentGroup)
  const clouds = new VoxelClouds({ config, parentGroup })
  t.after(() => clouds.dispose())
  return { clouds, config, parentGroup }
}

function chunkMatrices(clouds, key) {
  const chunk = clouds.cache.get(key)
  return clouds.mesh.instanceMatrix.array.slice(chunk.start * 16, (chunk.start + chunk.voxels.length) * 16)
}

test('cloud silhouettes have flat bases, stepped towers, and white tops over blue shadows', (t) => {
  const { clouds, parentGroup } = createClouds(t)
  clouds.update({ x: 0, z: 0 })
  const voxels = clouds.cache.get('0:0').voxels
  const cloud = clouds.createCloud(0, 0)
  assert.ok(cloud.length >= 12 && cloud.length <= 32, 'each silhouette uses a small authored group of blocks')
  assert.ok(cloud.some(voxel => voxel.sizeY < Math.min(voxel.size, voxel.sizeZ) * 0.9), 'clouds have a broad, flatter base')
  assert.ok(cloud.some(voxel => Math.abs(voxel.sizeY / voxel.size - 1) < 0.1
    && Math.abs(voxel.sizeZ / voxel.size - 1) < 0.1), 'upper puffs retain square cube shapes')
  assert.ok(new Set(cloud.map(voxel => voxel.y.toFixed(3))).size >= 3, 'several stepped levels form the cloud crown')

  const normals = clouds.geometry.getAttribute('normal')
  const faceColors = clouds.geometry.getAttribute('color')
  function averageFaceColor(normalY) {
    const colors = []
    for (let index = 0; index < normals.count; index++) {
      if (normals.getY(index) === normalY)
        colors.push([faceColors.getX(index), faceColors.getY(index), faceColors.getZ(index)])
    }
    return [0, 1, 2].map(channel => colors.reduce((sum, color) => sum + color[channel], 0) / colors.length)
  }
  const top = averageFaceColor(1)
  const bottom = averageFaceColor(-1)
  assert.ok(Math.min(...top) > 0.85, 'top faces remain a bright, nearly white highlight')
  assert.ok(top[0] > bottom[0] + 0.1, 'bottom faces have readable depth')
  assert.ok(bottom[2] > bottom[0] + 0.02, 'shadow faces are blue rather than neutral grey')
  assert.equal(parentGroup.children.length, 1)
  assert.equal(clouds.mesh.castShadow, false)
  assert.ok(clouds.mesh.count > 0 && clouds.mesh.count <= clouds.capacity)
  assert.deepEqual(clouds.createChunk({ x: 0, z: 0 }).voxels, voxels)
  clouds.config.seed++
  assert.notDeepEqual(clouds.createChunk({ x: 0, z: 0 }).voxels, voxels)
})

test('cloud transforms preserve the different dimensions of flat bases and cubic towers', (t) => {
  const { clouds } = createClouds(t)
  clouds.update({ x: 0, z: 0 })
  const chunk = clouds.cache.get('0:0')
  const matrices = chunkMatrices(clouds, '0:0')
  assert.ok(chunk.voxels.length > 0)
  chunk.voxels.forEach((voxel, index) => {
    const offset = index * 16
    for (const [axis, dimension] of [[0, voxel.size], [5, voxel.sizeY], [10, voxel.sizeZ]]) {
      assert.ok(Number.isFinite(dimension) && dimension > 0)
      assert.ok(Math.abs(matrices[offset + axis] - dimension) < 1e-5, 'instance dimensions match the authored silhouette')
    }
  })
})

test('adjacent chunks partition the same global cloud without missing or duplicating blocks', (t) => {
  const { clouds, config } = createClouds(t)
  const chunkWorldSize = config.chunks.size * config.terrain.cellSize
  const owner = voxel => ({ x: Math.floor(voxel.x / chunkWorldSize), z: Math.floor(voxel.z / chunkWorldSize) })
  const key = coord => `${coord.x}:${coord.z}`
  let complete
  for (let anchorZ = -2; anchorZ <= 2 && !complete; anchorZ++) {
    for (let anchorX = -2; anchorX <= 2 && !complete; anchorX++) {
      const candidate = clouds.createCloud(anchorX, anchorZ)
      if (new Set(candidate.map(voxel => key(owner(voxel)))).size > 1)
        complete = candidate
    }
  }
  assert.ok(complete, 'at least one cloud crosses a chunk boundary')
  const cloudId = complete[0].cloudId
  const coords = [...new Map(complete.map(voxel => [key(owner(voxel)), owner(voxel)])).values()]
  const chunks = coords.map(coord => clouds.createChunk(coord))
  const partition = chunks.flatMap(chunk => chunk.voxels.filter(voxel => voxel.cloudId === cloudId))
  const sortVoxels = voxels => [...voxels].sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z)
  const worldVoxels = partition.map(({ cell, ...voxel }) => voxel)
  assert.deepEqual(sortVoxels(worldVoxels), sortVoxels(complete), 'chunk clipping preserves every block of the original world-space silhouette')
  assert.equal(new Set(partition.map(voxel => `${voxel.x}:${voxel.y}:${voxel.z}`)).size, complete.length)
  for (const chunk of chunks) {
    for (const voxel of chunk.voxels) {
      assert.deepEqual(owner(voxel), chunk.coord, 'each block has exactly one chunk owner')
      const cellX = Math.floor(voxel.x / config.terrain.cellSize) - chunk.coord.x * config.chunks.size
      const cellZ = Math.floor(voxel.z / config.terrain.cellSize) - chunk.coord.z * config.chunks.size
      assert.equal(voxel.cell, cellZ * config.chunks.size + cellX, 'dissolve follows the world column under this block')
    }
  }
  for (const chunk of [...chunks].reverse())
    assert.deepEqual(clouds.createChunk(chunk.coord).voxels, chunk.voxels, 'reversing generation order cannot move the cloud at a seam')
})

test('cloud fragments follow each rising column while queued neighbors remain fully covered', (t) => {
  const { clouds, config } = createClouds(t)
  const transition = new ChunkColumnTransition({ chunkSize: config.chunks.size, cellSize: config.terrain.cellSize })
  transition.start(1, { x: 1, z: 0 }, { columnDuration: 1, waveDuration: 1, riseDistance: 3 })
  const slots = new Map([['0:0', { columnTransition: transition }]])
  clouds.update({ x: 0, z: 0 }, slots)
  const initial = chunkMatrices(clouds, '0:0')
  const pending = chunkMatrices(clouds, '1:0')
  const geometry = clouds.mesh.geometry
  transition.update(0.55)
  clouds.update({ x: 0, z: 0 }, slots)
  const partial = chunkMatrices(clouds, '0:0')
  let shrinking = 0
  let waiting = 0
  clouds.cache.get('0:0').voxels.forEach((voxel, index) => {
    const offset = index * 16
    if (partial[offset] < initial[offset]) {
      assert.ok(transition.progress[voxel.cell] > 0, 'only columns that have started rising dissolve')
      assert.ok(partial[offset + 13] > initial[offset + 13], 'shrinking pieces float gently upward')
      shrinking++
    }
    if (transition.progress[voxel.cell] === 0) {
      assert.deepEqual(partial.slice(offset, offset + 16), initial.slice(offset, offset + 16))
      waiting++
    }
  })
  assert.ok(shrinking > 0 && waiting > 0, 'the cloud never disappears as a whole chunk at the start')
  assert.deepEqual(chunkMatrices(clouds, '1:0'), pending)
  transition.update(3)
  clouds.update({ x: 0, z: 0 }, slots)
  const finished = chunkMatrices(clouds, '0:0')
  for (let index = 0; index < finished.length; index += 16)
    assert.equal(finished[index], 0, 'fully revealed terrain has no remaining cloud cubes')
  assert.equal(clouds.mesh.geometry, geometry, 'dissolving never rebuilds geometry')
  slots.clear()
  clouds.update({ x: 0, z: 0 }, slots)
  assert.deepEqual(chunkMatrices(clouds, '0:0'), initial, 'recycled terrain immediately regains its cloud cover')
})

test('turning around and teleporting reuse deterministic clouds without growing caches or uploads', (t) => {
  const { clouds } = createClouds(t)
  clouds.update({ x: 0, z: 0 })
  const initial = clouds.cache.get('0:0').voxels
  const retained = clouds.cache.get('1:0')
  const geometry = clouds.mesh.geometry
  const matrixBuffer = clouds.mesh.instanceMatrix.array
  const colorBuffer = clouds.mesh.instanceColor.array
  const version = clouds.mesh.instanceMatrix.version
  clouds.update({ x: 0, z: 0 })
  assert.equal(clouds.mesh.instanceMatrix.version, version, 'idle clouds do not upload transforms')
  clouds.update({ x: 1, z: 0 })
  assert.equal(clouds.cache.get('1:0'), retained)
  for (let x = 2; x < 18; x++) {
    clouds.update({ x: x * 3, z: -x * 4 })
    assert.equal(clouds.cache.size, 49)
    assert.ok(clouds.mesh.count <= clouds.capacity)
    assert.ok(clouds.mesh.instanceMatrix.updateRanges.length <= 1)
  }
  clouds.update({ x: 0, z: 0 })
  assert.deepEqual(clouds.cache.get('0:0').voxels, initial)
  assert.equal(clouds.mesh.geometry, geometry)
  assert.equal(clouds.mesh.instanceMatrix.array, matrixBuffer)
  assert.equal(clouds.mesh.instanceColor.array, colorBuffer)
  assert.ok(matrixBuffer.every(Number.isFinite))
})

test('preview, spacing, regeneration, and disposal do not leave stale clouds or graphics resources', () => {
  const config = createConfig()
  const parentGroup = new THREE.Group()
  const clouds = new VoxelClouds({ config, parentGroup })
  let geometryDisposed = false
  let materialDisposed = false
  let meshDisposed = false
  clouds.geometry.addEventListener('dispose', () => { geometryDisposed = true })
  clouds.material.addEventListener('dispose', () => { materialDisposed = true })
  clouds.mesh.addEventListener('dispose', () => { meshDisposed = true })
  clouds.update({ x: 0, z: 0 })
  clouds.refresh(false)
  assert.equal(clouds.mesh.visible, false)
  clouds.refresh(true)
  assert.equal(clouds.mesh.visible, true)
  config.chunks.debugSpacing = 1
  clouds.update({ x: 0, z: 0 })
  assert.equal(clouds.mesh.visible, false)
  config.chunks.debugSpacing = 0
  clouds.update({ x: 0, z: 0 })
  assert.equal(clouds.mesh.visible, true)
  const oldVoxels = clouds.cache.get('0:0').voxels
  clouds.reset()
  assert.equal(clouds.cache.size, 0)
  assert.equal(clouds.mesh.count, 0)
  assert.equal(clouds.mesh.visible, false)
  config.seed++
  clouds.update({ x: 0, z: 0 })
  assert.notDeepEqual(clouds.cache.get('0:0').voxels, oldVoxels)
  clouds.dispose()
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

test('worker wait and reveal share cloud coverage while preserving the original rise animation', (t) => {
  const { manager, jobs, builder } = createManager(t)
  manager.bootstrap(0, 0)
  const clouds = manager.voxelClouds
  const job = jobs[0]
  const coord = { x: job.task.origin.x / manager.chunkSize, z: job.task.origin.z / manager.chunkSize }
  const key = `${coord.x}:${coord.z}`
  const waiting = chunkMatrices(clouds, key)
  manager.update(0, 0, null, 0.5)
  assert.deepEqual(chunkMatrices(clouds, key), waiting, 'in-flight terrain retains all its clouds')
  job.callback(buildPackedChunk(builder, job.task))
  jobs.shift()
  manager.update(0, 0, null, 0)
  const slot = manager.activeSlots.get(key)
  assert.deepEqual(slot.columnTransition.settings, CHUNK_TRANSITION_DEFAULTS, 'rise duration, wave, scaling and height are unchanged')
  assert.deepEqual(chunkMatrices(clouds, key), waiting, 'worker completion begins the reveal with clouds intact')
  manager.update(0, 0, null, 0.4)
  const partial = chunkMatrices(clouds, key)
  assert.ok(partial.some((value, index) => index % 16 === 0 && value < waiting[index]))
  assert.ok(partial.some((value, index) => index % 16 === 0 && value === waiting[index] && value > 0))
  manager.transitionSettings.enabled = false
  manager.update(0, 0, null, 0)
  const finished = chunkMatrices(clouds, key)
  assert.ok(finished.every((value, index) => index % 16 !== 0 || value === 0))
  assert.equal(manager.slots.length, 9)
})

test('teleport and regeneration reject obsolete worker clouds and retain the nine-slot pool', (t) => {
  const { manager, jobs, builder } = createManager(t)
  manager.bootstrap(0, 0)
  const oldJob = jobs[0]
  const oldResult = buildPackedChunk(builder, oldJob.task)
  manager.update(100, -100, null, 0.1)
  assert.equal(manager.slots.length, 9)
  assert.equal(manager.voxelClouds.cache.size, 49)
  assert.ok([...manager.voxelClouds.cache.keys()].every(key => key !== '0:0'))
  manager.bootstrap(-100, 100)
  oldJob.callback(oldResult)
  assert.equal(manager.completedBuilds.length, 0, 'old epochs cannot replace clouds after regeneration')
  assert.equal(manager.slots.length, 9)
  assert.equal(manager.activeSlots.size, 1)
  assert.equal(manager.voxelClouds.cache.size, 49)
})
