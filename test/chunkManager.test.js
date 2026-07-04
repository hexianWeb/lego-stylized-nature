import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import ChunkManager from '../src/world/chunks/ChunkManager.js'

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
  placement: { enablePrefabs: false },
  water: { enableWater: false },
  chunks: {
    size: 32,
    halo: 1,
    windowRadius: 1,
    maxPendingBuildsPerFrame: 1,
    visibilityPadding: 0
  }
}

function createSlotFactory(calls = []) {
  return (index) => {
    const group = new THREE.Group()
    group.visible = false
    return {
      index,
      coord: null,
      group,
      terrainRenderer: { material: { name: `terrain-${index}` } },
      waterRenderer: null,
      prefabBuilds: 0,
      prefabsBuiltForKey: null,
      prefabsVisible: false,
      isLoadedFor(coord) {
        return this.coord !== null && this.coord.x === coord.x && this.coord.z === coord.z
      },
      populate({ coord }) {
        this.coord = { ...coord }
        calls.push({ slot: index, coord: { ...coord } })
      },
      show() {
        this.group.visible = true
      },
      hide() {
        this.group.visible = false
      },
      setOverlaysVisible(visible) {
        this.overlaysVisible = visible
      },
      ensurePrefabsBuilt() {
        const key = `${this.coord.x}:${this.coord.z}`
        if (this.prefabsBuiltForKey === key) {
          return
        }
        this.prefabBuilds++
        this.prefabsBuiltForKey = key
      },
      setPrefabsVisible(visible) {
        this.prefabsVisible = visible
      },
      updateInstanceColors() {
        this.instanceColorsUpdated = true
      },
      dispose() {
        this.disposed = true
      }
    }
  }
}

function createManager({ calls = [], overrides = {} } = {}) {
  return new ChunkManager({
    config: { ...config, chunks: { ...config.chunks, ...overrides } },
    terrainGenerator: {
      generateChunk({ origin, size, halo }) {
        return { origin, visibleSize: size, halo }
      }
    },
    layeredTerrainBuilder: {
      buildPlacements() {
        return []
      }
    },
    brickColorResolver: {},
    brickGeometry: new THREE.BoxGeometry(0.2, 0.095, 0.2),
    parentGroup: new THREE.Group(),
    createSlot: createSlotFactory(calls)
  })
}

function assertManagerInvariants(manager) {
  const activeSlots = new Set(manager.activeSlots.values())
  const freeSlots = new Set(manager.freeSlots)

  assert.equal(activeSlots.size, manager.activeSlots.size)
  assert.equal(freeSlots.size, manager.freeSlots.length)

  for (const slot of activeSlots) {
    assert.equal(freeSlots.has(slot), false)
  }

  assert.deepEqual(
    new Set(manager.pendingQueue.map((coord) => `${coord.x}:${coord.z}`)),
    manager.pendingKeys
  )
}

function updateUntilTerrainLoaded(manager, worldX, worldZ) {
  while (manager.pendingQueue.length > 0) {
    manager.update(worldX, worldZ)
  }
}

function updateUntilPrefabQueueDrained(manager, worldX, worldZ) {
  while (manager.pendingPrefabBuildQueue.length > 0) {
    manager.update(worldX, worldZ)
  }
}

function settleChunkAndPrefabQueues(manager, worldX, worldZ) {
  updateUntilTerrainLoaded(manager, worldX, worldZ)
  updateUntilPrefabQueueDrained(manager, worldX, worldZ)
}

test('bootstrap creates fixed slot pool, loads center, and queues outer window', () => {
  const calls = []
  const manager = createManager({ calls })

  manager.bootstrap(6.4, 6.4)

  assert.equal(manager.slots.length, 9)
  assert.equal(manager.activeSlots.size, 1)
  assert.equal(manager.pendingQueue.length, 8)
  assert.deepEqual(calls.map((call) => call.coord), [{ x: 1, z: 1 }])
  assert.equal(manager.freeSlots.length, 8)
})

test('update builds at most one pending outer chunk per frame', () => {
  const calls = []
  const manager = createManager({ calls })

  manager.bootstrap(6.4, 6.4)
  manager.update(6.4, 6.4)

  assert.equal(calls.length, 2)
  assert.equal(manager.activeSlots.size, 2)
  assert.equal(manager.pendingQueue.length, 7)
})

test('bootstrap resets previously loaded and pending chunk state', () => {
  const calls = []
  const manager = createManager({ calls })

  manager.bootstrap(6.4, 6.4)
  manager.update(6.4, 6.4)
  manager.bootstrap(19.2, 19.2)

  assert.equal(manager.activeSlots.size, 1)
  assert.equal(manager.pendingQueue.length, 8)
  assert.equal(manager.freeSlots.length, 8)
  assert.deepEqual(calls.at(-1).coord, { x: 3, z: 3 })
})

test('loadCoordNow throws when the fixed slot pool is exhausted', () => {
  const manager = createManager({ overrides: { windowRadius: 0 } })

  manager.bootstrap(0, 0)

  assert.throws(
    () => manager.loadCoordNow({ x: 1, z: 0 }),
    /No free slot available for chunk 1:0/
  )
})

test('loadCoordNow removes directly loaded coords from pending state', () => {
  const manager = createManager()

  manager.bootstrap(6.4, 6.4)
  assert.equal(manager.pendingKeys.has('0:0'), true)

  manager.loadCoordNow({ x: 0, z: 0 })

  assert.equal(manager.pendingKeys.has('0:0'), false)
  assert.equal(manager.pendingQueue.some((coord) => coord.x === 0 && coord.z === 0), false)
  assert.equal(manager.pendingQueue.length, 7)
  assertManagerInvariants(manager)
})

test('moving one chunk reuses overlap and queues newly exposed coords', () => {
  const calls = []
  const manager = createManager({ calls })

  manager.bootstrap(6.4, 6.4)
  while (manager.pendingQueue.length > 0) {
    manager.update(6.4, 6.4)
  }
  assert.equal(manager.activeSlots.size, 9)

  manager.update(12.8, 6.4)

  assert.equal(manager.activeSlots.size, 7)
  assert.equal(manager.freeSlots.length, 2)
  assert.equal(manager.pendingQueue.length, 2)
  assert.ok(manager.activeSlots.has('2:1'))
  assertManagerInvariants(manager)
})

test('diagonal movement keeps 2x2 overlap, builds center, and queues remaining exposed coords', () => {
  const calls = []
  const manager = createManager({ calls })

  manager.bootstrap(6.4, 6.4)
  while (manager.pendingQueue.length > 0) {
    manager.update(6.4, 6.4)
  }

  manager.update(12.8, 12.8)

  assert.equal(manager.activeSlots.size, 5)
  assert.equal(manager.freeSlots.length, 4)
  assert.equal(manager.pendingQueue.length, 4)
  assert.ok(manager.activeSlots.has('2:2'))
  assertManagerInvariants(manager)
})

test('new center chunk is built synchronously when it was not already loaded', () => {
  const calls = []
  const manager = createManager({ calls })

  manager.bootstrap(6.4, 6.4)
  manager.update(32, 6.4)

  assert.ok(manager.activeSlots.has('5:1'))
  assert.deepEqual(calls[1].coord, { x: 5, z: 1 })
  assertManagerInvariants(manager)
})

test('stale pending coords are removed after a large move', () => {
  const calls = []
  const manager = createManager({ calls })

  manager.bootstrap(6.4, 6.4)
  assert.equal(manager.pendingKeys.has('0:1'), true)

  manager.update(32, 32)

  assert.equal(manager.pendingKeys.has('0:1'), false)
  assert.ok([...manager.pendingKeys].every((key) => key.startsWith('4:') || key.startsWith('5:') || key.startsWith('6:')))
  assertManagerInvariants(manager)
})

test('loaded required slots stay visible without camera culling', () => {
  const calls = []
  const manager = createManager({ calls })
  const camera = {
    isOrthographicCamera: true,
    left: -2,
    right: 2,
    top: 2,
    bottom: -2,
    zoom: 1,
    position: { x: 6.4, z: 6.4 }
  }

  manager.bootstrap(6.4, 6.4, camera)
  while (manager.pendingQueue.length > 0) {
    manager.update(6.4, 6.4, camera)
  }

  const loadedCount = manager.activeSlots.size
  const visibleCount = [...manager.activeSlots.values()].filter((slot) => slot.group.visible).length

  assert.equal(loadedCount, 9)
  assert.equal(visibleCount, loadedCount)
  assert.equal(manager.freeSlots.length, 0)
})

test('player position builds prefabs only for the nearest 2x2 loaded slots', () => {
  const manager = createManager()

  manager.bootstrap(6.4, 6.4)
  settleChunkAndPrefabQueues(manager, 6.4, 6.4)

  const prefabActiveSlots = [...manager.activeSlots.entries()]
    .filter(([, slot]) => slot.prefabsVisible)
    .map(([key]) => key)
    .sort()
  const prefabInactiveSlots = [...manager.activeSlots.values()].filter((slot) => !slot.prefabsVisible)

  assert.deepEqual(prefabActiveSlots, ['0:0', '0:1', '1:0', '1:1'])
  assert.ok(prefabInactiveSlots.every((slot) => slot.prefabBuilds === 0))
})

test('player 2x2 prefab window shifts by local chunk half', () => {
  const manager = createManager()

  manager.bootstrap(9.6, 9.6)
  settleChunkAndPrefabQueues(manager, 9.6, 9.6)

  const prefabActiveSlots = [...manager.activeSlots.entries()]
    .filter(([, slot]) => slot.prefabsVisible)
    .map(([key]) => key)
    .sort()

  assert.deepEqual(prefabActiveSlots, ['1:1', '1:2', '2:1', '2:2'])
})

test('player active 2x2 loaded slots build prefabs once per chunk key', () => {
  const manager = createManager()

  manager.bootstrap(6.4, 6.4)
  settleChunkAndPrefabQueues(manager, 6.4, 6.4)

  const visibleSlots = [...manager.activeSlots.values()].filter((slot) => slot.prefabsVisible)
  manager.update(6.4, 6.4)
  manager.update(6.4, 6.4)

  assert.equal(visibleSlots.length, 4)
  assert.ok(visibleSlots.every((slot) => slot.prefabBuilds === 1))
})

test('player prefab window shift builds at most one newly active prefab chunk per frame', () => {
  const manager = createManager()

  manager.bootstrap(6.4, 6.4)
  settleChunkAndPrefabQueues(manager, 6.4, 6.4)

  const buildsBeforeMove = new Map(
    [...manager.activeSlots.entries()].map(([key, slot]) => [key, slot.prefabBuilds])
  )

  manager.update(9.6, 9.6)

  const newBuilds = [...manager.activeSlots.entries()]
    .filter(([key, slot]) => slot.prefabBuilds > (buildsBeforeMove.get(key) ?? 0))
    .map(([key]) => key)

  assert.equal(newBuilds.length, 1)
})

test('update skips prefab builds on frames that build pending terrain chunks', () => {
  const manager = createManager()

  manager.bootstrap(6.4, 6.4)
  const buildCountAfterBootstrap = [...manager.activeSlots.values()]
    .reduce((sum, slot) => sum + slot.prefabBuilds, 0)
  manager.pendingQueue = [manager.pendingQueue[0]]
  manager.pendingKeys = new Set(manager.pendingQueue.map((coord) => `${coord.x}:${coord.z}`))

  manager.update(6.4, 6.4)

  const prefabBuildsAfterTerrainFrame = [...manager.activeSlots.values()]
    .reduce((sum, slot) => sum + slot.prefabBuilds, 0)

  manager.update(6.4, 6.4)
  const prefabBuildsAfterNextFrame = [...manager.activeSlots.values()]
    .reduce((sum, slot) => sum + slot.prefabBuilds, 0)

  assert.equal(prefabBuildsAfterTerrainFrame, buildCountAfterBootstrap)
  assert.equal(prefabBuildsAfterNextFrame, buildCountAfterBootstrap + 1)
})

test('ao preview updates all slots and only shows overlays on visible slots', () => {
  const calls = []
  const manager = createManager({ calls })

  manager.bootstrap(6.4, 6.4)
  manager.refreshAOPreview(false)

  assert.ok(manager.slots.every((slot) => slot.instanceColorsUpdated))
  assert.ok(manager.slots.every((slot) => slot.overlaysVisible === false))
})
