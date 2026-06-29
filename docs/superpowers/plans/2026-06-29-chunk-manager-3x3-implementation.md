# Chunk Manager 3x3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 2-slot chunk ping-pong runtime with a 3x3 loaded chunk manager that builds the center chunk immediately, fills the outer ring through a bounded pending queue, culls rendering by camera bounds, and skips full-map terrain generation in chunk mode.

**Architecture:** Keep `ChunkRenderSlot` as the single-chunk rendering container and add `ChunkManager` as the lifecycle owner for loaded, pending, and visible chunk states. Add small pure helpers for chunk windows and bounds so lifecycle and visibility behavior can be tested without WebGPU rendering. Wire `World` to use `ChunkManager` behind a neutral `terrainChunkManager` field and keep the non-chunk full-map path unchanged.

**Tech Stack:** JavaScript ES modules, Three.js WebGPU, Node `node:test`, existing terrain/prefab renderer classes.

**Execution note:** Do not commit automatically. The user has stated the design docs are ignored and does not want them committed; ask before committing implementation code.

---

## File Structure

- Modify: `src/world/chunks/chunkCoordinates.js`
  - Add `getChunkWindowCoords(centerCoord, radius)`.
  - Add `getChunkBounds(coord, chunkSize, cellSize, padding = 0)`.
  - Add `boundsIntersect(a, b)`.
  - Add `getCameraWorldBounds(camera, padding = 0)` for conservative orthographic X/Z bounds.
- Create: `src/world/chunks/ChunkManager.js`
  - Own fixed slot pool, active loaded map, free slots, pending queue, and center coord.
  - Reuse slot creation logic from `TerrainChunkPingPong`.
  - Expose `bootstrap()`, `update()`, `refreshAOPreview()`, `getDebugMaterials()`, and `dispose()`.
- Modify: `src/world/WorldConfig.js`
  - Change `chunks.size` to `64`.
  - Add `windowRadius`, `maxPendingBuildsPerFrame`, and `visibilityPadding`.
  - Remove or ignore `prefetchThreshold` for the new manager.
- Modify: `src/world/world.js`
  - Import `ChunkManager`.
  - Rename `terrainChunkPingPong` ownership to `terrainChunkManager`.
  - In chunk mode, skip full-map `terrainGenerator.generate()` and full-map `buildPlacements()`.
  - Pass `this.experience.worldCamera.instance` to `ChunkManager.update()`.
- Modify: `test/chunkCoordinates.test.js`
  - Add tests for window coords and bounds helpers.
- Create: `test/chunkManager.test.js`
  - Test bootstrap, pending queue, center fast path, reuse, visibility, and AO refresh behavior.
- Create: `test/worldChunkMode.test.js`
  - Test that chunk mode `World.regenerate()` does not call full-map terrain generation.

---

### Task 1: Add Chunk Window and Bounds Helpers

**Files:**
- Modify: `src/world/chunks/chunkCoordinates.js`
- Modify: `test/chunkCoordinates.test.js`

- [ ] **Step 1: Add failing tests for 3x3 window ordering and negative coords**

Append this test to `test/chunkCoordinates.test.js` imports and body.

```js
import {
  boundsIntersect,
  coordsEqual,
  getCameraWorldBounds,
  getChunkBounds,
  getChunkWindowCoords,
  getPrefetchChunkCoord,
  getRenderChunkCoord,
  getRenderChunkKey,
  getRenderChunkOrigin,
  getWorldBlockFromPosition,
  parseRenderChunkKey,
  toLocalCell
} from '../src/world/chunks/chunkCoordinates.js'

test('builds stable chunk window coords with cardinal neighbors before diagonals', () => {
  assert.deepEqual(getChunkWindowCoords({ x: 0, z: 0 }, 1), [
    { x: 0, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: -1 },
    { x: 0, z: 1 },
    { x: 1, z: 0 },
    { x: -1, z: -1 },
    { x: -1, z: 1 },
    { x: 1, z: -1 },
    { x: 1, z: 1 }
  ])

  assert.deepEqual(getChunkWindowCoords({ x: -2, z: 3 }, 1)[0], { x: -2, z: 3 })
  assert.equal(getChunkWindowCoords({ x: -2, z: 3 }, 1).length, 9)
})
```

- [ ] **Step 2: Run focused coordinate tests and verify failure**

Run: `npm test -- test/chunkCoordinates.test.js`

Expected: FAIL with an export error for `getChunkWindowCoords`.

- [ ] **Step 3: Implement `getChunkWindowCoords()`**

Add this function to `src/world/chunks/chunkCoordinates.js`.

```js
export function getChunkWindowCoords(centerCoord, radius = 1) {
  const coords = []

  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      coords.push({
        x: centerCoord.x + dx,
        z: centerCoord.z + dz
      })
    }
  }

  coords.sort((a, b) => {
    const aDistance = Math.abs(a.x - centerCoord.x) + Math.abs(a.z - centerCoord.z)
    const bDistance = Math.abs(b.x - centerCoord.x) + Math.abs(b.z - centerCoord.z)
    if (aDistance !== bDistance) {
      return aDistance - bDistance
    }
    if (a.x !== b.x) {
      return a.x - b.x
    }
    return a.z - b.z
  })

  return coords
}
```

- [ ] **Step 4: Run focused coordinate tests and verify pass**

Run: `npm test -- test/chunkCoordinates.test.js`

Expected: PASS for all coordinate tests.

- [ ] **Step 5: Add failing tests for chunk bounds, bounds intersection, and camera bounds**

Append these tests to `test/chunkCoordinates.test.js`.

```js
test('computes padded chunk world bounds', () => {
  assert.deepEqual(getChunkBounds({ x: 2, z: -1 }, 64, 0.2, 0.4), {
    minX: 25.2,
    maxX: 38.8,
    minZ: -13.200000000000001,
    maxZ: 0.4
  })
})

test('detects xz bounds intersections', () => {
  const chunk = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }
  assert.equal(boundsIntersect(chunk, { minX: 9, maxX: 12, minZ: 2, maxZ: 4 }), true)
  assert.equal(boundsIntersect(chunk, { minX: 11, maxX: 12, minZ: 2, maxZ: 4 }), false)
  assert.equal(boundsIntersect(chunk, { minX: 2, maxX: 4, minZ: -4, maxZ: -1 }), false)
})

test('computes conservative orthographic camera xz bounds', () => {
  const camera = {
    isOrthographicCamera: true,
    left: -4,
    right: 4,
    top: 3,
    bottom: -3,
    zoom: 2,
    position: { x: 10, z: 20 }
  }

  assert.deepEqual(getCameraWorldBounds(camera, 1), {
    minX: 5,
    maxX: 15,
    minZ: 16,
    maxZ: 24
  })
})
```

- [ ] **Step 6: Run focused coordinate tests and verify failure**

Run: `npm test -- test/chunkCoordinates.test.js`

Expected: FAIL with export errors for bounds helpers.

- [ ] **Step 7: Implement bounds helpers**

Add this code to `src/world/chunks/chunkCoordinates.js`.

```js
export function getChunkBounds(coord, chunkSize, cellSize, padding = 0) {
  const origin = getRenderChunkOrigin(coord, chunkSize)
  const minX = origin.x * cellSize - padding
  const minZ = origin.z * cellSize - padding
  const size = chunkSize * cellSize

  return {
    minX,
    maxX: minX + size + padding * 2,
    minZ,
    maxZ: minZ + size + padding * 2
  }
}

export function boundsIntersect(a, b) {
  return a.minX <= b.maxX &&
    a.maxX >= b.minX &&
    a.minZ <= b.maxZ &&
    a.maxZ >= b.minZ
}

export function getCameraWorldBounds(camera, padding = 0) {
  if (!camera?.isOrthographicCamera) {
    return null
  }

  const zoom = camera.zoom || 1
  const halfWidth = (camera.right - camera.left) / zoom * 0.5
  const halfDepth = (camera.top - camera.bottom) / zoom * 0.5
  const x = camera.position.x
  const z = camera.position.z

  return {
    minX: x - halfWidth - padding,
    maxX: x + halfWidth + padding,
    minZ: z - halfDepth - padding,
    maxZ: z + halfDepth + padding
  }
}
```

- [ ] **Step 8: Run focused coordinate tests and verify pass**

Run: `npm test -- test/chunkCoordinates.test.js`

Expected: PASS.

---

### Task 2: Build `ChunkManager` Bootstrap and Pending Queue

**Files:**
- Create: `src/world/chunks/ChunkManager.js`
- Create: `test/chunkManager.test.js`

- [ ] **Step 1: Write failing bootstrap and pending tests**

Create `test/chunkManager.test.js` with this content.

```js
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
```

- [ ] **Step 2: Run manager tests and verify failure**

Run: `npm test -- test/chunkManager.test.js`

Expected: FAIL with module not found for `ChunkManager.js`.

- [ ] **Step 3: Implement `ChunkManager` constructor, slot factory injection, bootstrap, pending queue**

Create `src/world/chunks/ChunkManager.js`.

```js
import TerrainBrickRenderer from '../bricks/TerrainBrickRenderer.js'
import WaterBrickRenderer from '../bricks/WaterBrickRenderer.js'
import LavaBrickRenderer from '../bricks/LavaBrickRenderer.js'
import HeightfieldAO from '../bricks/HeightfieldAO.js'
import PrefabPlacer from '../prefabs/PrefabPlacer.js'
import ChunkRenderSlot from './ChunkRenderSlot.js'
import {
  getChunkWindowCoords,
  getRenderChunkCoord,
  getRenderChunkKey,
  getRenderChunkOrigin,
  getWorldBlockFromPosition
} from './chunkCoordinates.js'

export default class ChunkManager {
  constructor({
    config,
    terrainGenerator,
    layeredTerrainBuilder,
    brickColorResolver,
    brickGeometry,
    parentGroup,
    biomeRegistry = null,
    prefabRegistry = null,
    waterNoiseTexture = null,
    lavaConfig = {},
    lavaNoiseTexture = null,
    createSlot = null
  }) {
    this.config = config
    this.terrainGenerator = terrainGenerator
    this.layeredTerrainBuilder = layeredTerrainBuilder
    this.brickColorResolver = brickColorResolver
    this.parentGroup = parentGroup
    this.biomeRegistry = biomeRegistry
    this.prefabRegistry = prefabRegistry
    this.waterNoiseTexture = waterNoiseTexture
    this.lavaConfig = lavaConfig
    this.lavaNoiseTexture = lavaNoiseTexture

    const chunkConfig = config.chunks ?? {}
    this.chunkSize = chunkConfig.size ?? 64
    this.halo = chunkConfig.halo ?? 1
    this.windowRadius = chunkConfig.windowRadius ?? 1
    this.maxPendingBuildsPerFrame = chunkConfig.maxPendingBuildsPerFrame ?? 1
    this.visibilityPadding = chunkConfig.visibilityPadding ?? 0
    this.cellSize = config.terrain.cellSize

    this.activeSlots = new Map()
    this.pendingQueue = []
    this.pendingKeys = new Set()
    this.centerCoord = null

    const slotCount = (this.windowRadius * 2 + 1) ** 2
    this.slots = Array.from({ length: slotCount }, (_, index) => {
      return createSlot ? createSlot(index) : this.createSlot(index, brickGeometry)
    })
    this.freeSlots = [...this.slots]

    for (const slot of this.slots) {
      slot.hide?.()
      this.parentGroup.add(slot.group)
    }
  }

  createSlot(index, brickGeometry) {
    const prefabsEnabled = this.config.placement?.enablePrefabs !== false
    const prefabPlacer = prefabsEnabled && this.prefabRegistry && this.biomeRegistry
      ? new PrefabPlacer({
        config: this.config,
        biomeRegistry: this.biomeRegistry,
        prefabRegistry: this.prefabRegistry
      })
      : null

    const waterEnabled = this.config.water?.enableWater !== false
    return new ChunkRenderSlot({
      index,
      chunkSize: this.chunkSize,
      cellSize: this.cellSize,
      terrainRenderer: new TerrainBrickRenderer({
        config: this.config,
        brickGeometry
      }),
      heightfieldAO: new HeightfieldAO({ config: this.config }),
      prefabPlacer,
      waterRenderer: waterEnabled
        ? new WaterBrickRenderer({
          config: this.config,
          brickGeometry,
          waterNoiseTexture: this.waterNoiseTexture
        })
        : null,
      lavaRenderer: new LavaBrickRenderer({
        config: this.config,
        brickGeometry,
        lavaConfig: this.lavaConfig,
        lavaNoiseTexture: this.lavaNoiseTexture
      })
    })
  }

  bootstrap(worldX, worldZ, camera = null) {
    const centerCoord = this.getCenterCoord(worldX, worldZ)
    this.centerCoord = centerCoord
    const requiredCoords = getChunkWindowCoords(centerCoord, this.windowRadius)
    const [center, ...outerCoords] = requiredCoords

    this.loadCoordNow(center)
    this.queuePendingCoords(outerCoords)
    this.updateVisibility(camera)
  }

  update(worldX, worldZ, camera = null) {
    if (!this.centerCoord) {
      this.bootstrap(worldX, worldZ, camera)
      return
    }

    this.buildPendingChunks()
    this.updateVisibility(camera)
  }

  getCenterCoord(worldX, worldZ) {
    const worldBlock = getWorldBlockFromPosition(worldX, worldZ, this.cellSize)
    return getRenderChunkCoord(worldBlock.x, worldBlock.z, this.chunkSize)
  }

  queuePendingCoords(coords) {
    for (const coord of coords) {
      const key = getRenderChunkKey(coord)
      if (this.activeSlots.has(key) || this.pendingKeys.has(key)) {
        continue
      }
      this.pendingQueue.push({ ...coord })
      this.pendingKeys.add(key)
    }
  }

  buildPendingChunks() {
    const count = Math.max(0, this.maxPendingBuildsPerFrame)
    for (let i = 0; i < count && this.pendingQueue.length > 0; i++) {
      const coord = this.pendingQueue.shift()
      this.pendingKeys.delete(getRenderChunkKey(coord))
      this.loadCoordNow(coord)
    }
  }

  loadCoordNow(coord) {
    const key = getRenderChunkKey(coord)
    if (this.activeSlots.has(key)) {
      return this.activeSlots.get(key)
    }

    const slot = this.freeSlots.shift()
    if (!slot) {
      throw new Error(`[ChunkManager] No free slot available for chunk ${key}`)
    }

    this.fillSlot(slot, coord)
    this.activeSlots.set(key, slot)
    return slot
  }

  fillSlot(slot, coord) {
    const origin = getRenderChunkOrigin(coord, this.chunkSize)
    const terrainMap = this.terrainGenerator.generateChunk({
      origin,
      size: this.chunkSize,
      halo: this.halo
    })
    const placements = this.layeredTerrainBuilder.buildPlacements(terrainMap)

    slot.populate({
      coord,
      terrainMap,
      placements,
      colorResolver: this.brickColorResolver
    })
  }

  updateVisibility() {
    for (const slot of this.activeSlots.values()) {
      slot.show()
    }
  }

  refreshAOPreview(showOverlays = true) {
    for (const slot of this.slots) {
      slot.updateInstanceColors?.()
      slot.setOverlaysVisible?.(showOverlays && slot.group.visible)
    }
  }

  getDebugMaterials() {
    const slot = this.activeSlots.values().next().value ?? this.slots[0]
    return {
      legoMaterial: slot?.terrainRenderer?.material ?? null,
      waterMaterial: slot?.waterRenderer?.material ?? null
    }
  }

  dispose() {
    for (const slot of this.slots) {
      slot.dispose()
    }
    this.slots.length = 0
    this.freeSlots.length = 0
    this.activeSlots.clear()
    this.pendingQueue.length = 0
    this.pendingKeys.clear()
  }
}
```

- [ ] **Step 4: Run manager tests and verify pass**

Run: `npm test -- test/chunkManager.test.js`

Expected: PASS.

---

### Task 3: Implement Required Window Reconciliation and Center Fast Path

**Files:**
- Modify: `src/world/chunks/ChunkManager.js`
- Modify: `test/chunkManager.test.js`

- [ ] **Step 1: Add failing tests for one-step move, diagonal move, stale pending cleanup, and center fast path**

Append these tests to `test/chunkManager.test.js`.

```js
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
})

test('diagonal movement keeps 2x2 overlap and queues five newly exposed coords', () => {
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
})

test('new center chunk is built synchronously when it was not already loaded', () => {
  const calls = []
  const manager = createManager({ calls })

  manager.bootstrap(6.4, 6.4)
  manager.update(32, 6.4)

  assert.ok(manager.activeSlots.has('5:1'))
  assert.deepEqual(calls.at(-1).coord, { x: 5, z: 1 })
})

test('stale pending coords are removed after a large move', () => {
  const calls = []
  const manager = createManager({ calls })

  manager.bootstrap(6.4, 6.4)
  assert.equal(manager.pendingKeys.has('0:1'), true)

  manager.update(32, 32)

  assert.equal(manager.pendingKeys.has('0:1'), false)
  assert.ok([...manager.pendingKeys].every((key) => key.startsWith('4:') || key.startsWith('5:') || key.startsWith('6:')))
})
```

- [ ] **Step 2: Run manager tests and verify failure**

Run: `npm test -- test/chunkManager.test.js`

Expected: FAIL because `ChunkManager.update()` does not reconcile changed center coords.

- [ ] **Step 3: Replace `update()` and add reconciliation helpers**

Modify `src/world/chunks/ChunkManager.js`.

```js
  update(worldX, worldZ, camera = null) {
    if (!this.centerCoord) {
      this.bootstrap(worldX, worldZ, camera)
      return
    }

    const nextCenterCoord = this.getCenterCoord(worldX, worldZ)
    if (!this.coordsEqual(nextCenterCoord, this.centerCoord)) {
      this.reconcileRequiredWindow(nextCenterCoord)
    }

    this.buildPendingChunks()
    this.updateVisibility(camera)
  }

  coordsEqual(a, b) {
    return a.x === b.x && a.z === b.z
  }

  reconcileRequiredWindow(nextCenterCoord) {
    this.centerCoord = nextCenterCoord
    const requiredCoords = getChunkWindowCoords(nextCenterCoord, this.windowRadius)
    const requiredKeys = new Set(requiredCoords.map((coord) => getRenderChunkKey(coord)))

    for (const [key, slot] of [...this.activeSlots.entries()]) {
      if (requiredKeys.has(key)) {
        continue
      }
      slot.hide()
      this.activeSlots.delete(key)
      this.freeSlots.push(slot)
    }

    this.pendingQueue = this.pendingQueue.filter((coord) => requiredKeys.has(getRenderChunkKey(coord)))
    this.pendingKeys = new Set(this.pendingQueue.map((coord) => getRenderChunkKey(coord)))

    const centerKey = getRenderChunkKey(nextCenterCoord)
    if (!this.activeSlots.has(centerKey)) {
      this.pendingQueue = this.pendingQueue.filter((coord) => getRenderChunkKey(coord) !== centerKey)
      this.pendingKeys.delete(centerKey)
      this.loadCoordNow(nextCenterCoord)
    }

    this.queuePendingCoords(requiredCoords.filter((coord) => {
      return !this.activeSlots.has(getRenderChunkKey(coord))
    }))
  }
```

- [ ] **Step 4: Run manager tests and verify pass**

Run: `npm test -- test/chunkManager.test.js`

Expected: PASS.

---

### Task 4: Add Camera Bounds Visibility

**Files:**
- Modify: `src/world/chunks/ChunkManager.js`
- Modify: `test/chunkManager.test.js`

- [ ] **Step 1: Add failing tests for loaded-but-not-visible chunks and overlay refresh**

Append these tests to `test/chunkManager.test.js`.

```js
test('camera visibility hides loaded required slots without releasing them', () => {
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
  assert.ok(visibleCount < loadedCount)
  assert.equal(manager.freeSlots.length, 0)
})

test('ao preview updates all slots and only shows overlays on visible slots', () => {
  const calls = []
  const manager = createManager({ calls })

  manager.bootstrap(6.4, 6.4)
  manager.refreshAOPreview(false)

  assert.ok(manager.slots.every((slot) => slot.instanceColorsUpdated))
  assert.ok(manager.slots.every((slot) => slot.overlaysVisible === false))
})
```

- [ ] **Step 2: Run manager tests and verify failure**

Run: `npm test -- test/chunkManager.test.js`

Expected: FAIL because `updateVisibility()` currently shows every loaded slot.

- [ ] **Step 3: Import bounds helpers**

Modify the import in `src/world/chunks/ChunkManager.js`.

```js
import {
  boundsIntersect,
  getCameraWorldBounds,
  getChunkBounds,
  getChunkWindowCoords,
  getRenderChunkCoord,
  getRenderChunkKey,
  getRenderChunkOrigin,
  getWorldBlockFromPosition
} from './chunkCoordinates.js'
```

- [ ] **Step 4: Replace `updateVisibility()`**

Modify `src/world/chunks/ChunkManager.js`.

```js
  updateVisibility(camera = null) {
    const cameraBounds = getCameraWorldBounds(camera, this.visibilityPadding)

    for (const slot of this.activeSlots.values()) {
      if (!cameraBounds) {
        slot.show()
        continue
      }

      const chunkBounds = getChunkBounds(
        slot.coord,
        this.chunkSize,
        this.cellSize,
        this.visibilityPadding
      )
      if (boundsIntersect(chunkBounds, cameraBounds)) {
        slot.show()
      } else {
        slot.hide()
      }
    }
  }
```

- [ ] **Step 5: Run manager tests and verify pass**

Run: `npm test -- test/chunkManager.test.js`

Expected: PASS.

---

### Task 5: Update Chunk Configuration

**Files:**
- Modify: `src/world/WorldConfig.js`

- [ ] **Step 1: Modify chunk config**

Change `chunks` in `src/world/WorldConfig.js` to this shape.

```js
  chunks: {
    enabled: true,
    size: 64,
    halo: 1,
    windowRadius: 1,
    maxPendingBuildsPerFrame: 1,
    visibilityPadding: 1
  },
```

- [ ] **Step 2: Run existing chunk-focused tests**

Run: `npm test -- test/chunkCoordinates.test.js test/chunkManager.test.js test/terrainChunkPingPong.test.js`

Expected: PASS. The old ping-pong tests should still pass because `TerrainChunkPingPong` falls back to its internal default `prefetchThreshold` when the config key is absent.

---

### Task 6: Wire `World` to Use `ChunkManager` and Skip Full-Map Generation

**Files:**
- Modify: `src/world/world.js`
- Create: `test/worldChunkMode.test.js`

- [ ] **Step 1: Add failing test for chunk-mode full-map skip**

Create `test/worldChunkMode.test.js`.

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import World from '../src/world/world.js'

function createExperience() {
  return {
    scene: new THREE.Group(),
    resources: {
      items: {
        brick2x2Model: new THREE.Group(),
        waterNoiseTexture: null,
        lavaNoiseTexture: null
      }
    },
    worldCamera: {
      instance: {
        isOrthographicCamera: true,
        left: -10,
        right: 10,
        top: 10,
        bottom: -10,
        zoom: 1,
        position: { x: 12.8, z: 12.8 }
      },
      lookAtTarget: null,
      lookAt(target) {
        this.lookAtTarget = target.clone()
      }
    },
    environment: {
      shadowConfig: null,
      configureShadows(config) {
        this.shadowConfig = config
      }
    }
  }
}

test('chunk mode regenerate skips full terrain generation', () => {
  const world = new World(createExperience())
  let generatedFullMap = false

  world.brickGeometry = new THREE.BoxGeometry(0.2, 0.095, 0.2)
  world.biomeRegistry = { get: () => ({ lava: {} }) }
  world.terrainGenerator = {
    generate() {
      generatedFullMap = true
      return {}
    },
    generateChunk({ origin, size, halo }) {
      return { origin, visibleSize: size, halo }
    }
  }
  world.layeredTerrainBuilder = {
    buildPlacements() {
      return []
    }
  }
  world.brickColorResolver = {}
  world.terrainBrickRenderer = { updateInstanceColors() {} }
  world.playerAircraft = {
    enabled: true,
    state: { position: { x: 12.8, z: 12.8 } },
    group: new THREE.Group()
  }
  world.terrainChunkManager = {
    bootstrapped: false,
    refreshed: false,
    bootstrap(x, z, camera) {
      this.bootstrapped = { x, z, camera }
    },
    refreshAOPreview() {
      this.refreshed = true
    },
    getDebugMaterials() {
      return { legoMaterial: null, waterMaterial: null }
    }
  }

  world.regenerate()

  assert.equal(generatedFullMap, false)
  assert.deepEqual(
    { x: world.terrainChunkManager.bootstrapped.x, z: world.terrainChunkManager.bootstrapped.z },
    { x: 12.8, z: 12.8 }
  )
  assert.ok(world.experience.environment.shadowConfig)
})
```

- [ ] **Step 2: Run world chunk-mode test and verify failure**

Run: `npm test -- test/worldChunkMode.test.js`

Expected: FAIL because `World` still uses `terrainChunkPingPong` and still calls full-map generation.

- [ ] **Step 3: Replace ping-pong import and field names**

Modify `src/world/world.js`.

```js
import ChunkManager from './chunks/ChunkManager.js'
```

Change constructor field:

```js
        this.terrainChunkManager = null
```

Replace chunk creation in `build()`:

```js
                this.terrainChunkManager = new ChunkManager({
                    config: this.config,
                    terrainGenerator: this.terrainGenerator,
                    layeredTerrainBuilder: this.layeredTerrainBuilder,
                    brickColorResolver: this.brickColorResolver,
                    brickGeometry: this.brickGeometry,
                    parentGroup: this.group,
                    biomeRegistry: this.biomeRegistry,
                    prefabRegistry,
                    waterNoiseTexture: resources.items.waterNoiseTexture,
                    lavaConfig: this.biomeRegistry.get('volcano').lava,
                    lavaNoiseTexture: resources.items.lavaNoiseTexture
                })
```

- [ ] **Step 4: Refactor `regenerate()` chunk branch**

Modify `src/world/world.js` so chunk mode returns before full-map generation.

```js
    regenerate() {
        if (!this.terrainGenerator || !this.terrainBrickRenderer) {
            return
        }

        const useChunkTerrain = Boolean(this.terrainChunkManager)
        if (!useChunkTerrain && !this.waterBrickRenderer && !this.lavaBrickRenderer) {
            return
        }

        const { width, depth, cellSize, maxHeight, layerHeight } = this.config.terrain
        const playerPosition = this.playerAircraft?.state?.position
        const centerX = playerPosition?.x ?? width * cellSize * 0.5
        const centerZ = playerPosition?.z ?? depth * cellSize * 0.5
        const halfExtent = Math.max(width, depth) * cellSize * 0.55

        this.experience.worldCamera.lookAt(new THREE.Vector3(centerX, 0, centerZ))
        this.experience.environment.configureShadows({
            centerX,
            centerZ,
            halfExtent,
            maxHeight: maxHeight * layerHeight + 8
        })

        if (useChunkTerrain) {
            this.terrainMap = null
            this.terrainPlacements = []
            this.terrainChunkManager.bootstrap(
                centerX,
                centerZ,
                this.experience.worldCamera.instance
            )
            this.refreshAOPreview()
            return
        }

        this.terrainMap = this.terrainGenerator.generate()
        this.terrainPlacements = this.layeredTerrainBuilder.buildPlacements(this.terrainMap)
        this.heightfieldAO.build(this.terrainMap)

        this.terrainBrickRenderer.build(
            this.terrainPlacements,
            this.brickColorResolver,
            this.heightfieldAO
        )
        this.waterBrickRenderer?.build(this.terrainMap)
        this.lavaBrickRenderer.build(this.terrainMap)
        this.prefabPlacer?.build(this.terrainMap)

        this.refreshAOPreview()
    }
```

- [ ] **Step 5: Update remaining world references**

Replace remaining `terrainChunkPingPong` references in `src/world/world.js`.

```js
        this.terrainChunkManager?.refreshAOPreview(!preview)
```

```js
            legoMaterial: this.terrainChunkManager?.getDebugMaterials().legoMaterial
                ?? this.terrainBrickRenderer?.material,
            waterMaterial: this.terrainChunkManager?.getDebugMaterials().waterMaterial
                ?? this.waterBrickRenderer?.material
```

```js
        if (this.terrainChunkManager && this.playerAircraft?.enabled) {
            const { x, z } = this.playerAircraft.state.position
            this.terrainChunkManager.update(x, z, this.experience.worldCamera.instance)
        }
```

```js
        this.terrainChunkManager?.dispose()
        this.terrainChunkManager = null
```

- [ ] **Step 6: Run world chunk-mode test and verify pass**

Run: `npm test -- test/worldChunkMode.test.js`

Expected: PASS.

---

### Task 7: Full Verification and Cleanup

**Files:**
- Modify only if verification exposes a real issue in touched files.

- [ ] **Step 1: Run focused tests**

Run: `npm test -- test/chunkCoordinates.test.js test/chunkManager.test.js test/worldChunkMode.test.js`

Expected: PASS.

- [ ] **Step 2: Run legacy chunk tests**

Run: `npm test -- test/terrainChunkPingPong.test.js`

Expected: PASS while `TerrainChunkPingPong` remains in the repo.

- [ ] **Step 3: Run full test suite**

Run: `npm test`

Expected: PASS. If Windows reports the known `EPERM: operation not permitted, lstat 'C:\Users\f1686533'`, record it separately as environment noise and rerun focused tests.

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: PASS. Existing Vite large chunk warnings are acceptable if no new build errors appear.

- [ ] **Step 5: Inspect changed files**

Run: `git diff -- src/world/chunks/chunkCoordinates.js src/world/chunks/ChunkManager.js src/world/WorldConfig.js src/world/world.js test/chunkCoordinates.test.js test/chunkManager.test.js test/worldChunkMode.test.js`

Expected: Diff shows only the chunk manager implementation, config update, world wiring, and tests.

---

## Self-Review

Spec coverage:

- 3x3 loaded window: Task 1 and Task 2.
- Center immediate build: Task 2 bootstrap and Task 3 center fast path.
- Pending outer queue with one build per frame: Task 2 and Task 3.
- Loaded state separate from render visibility: Task 4.
- Chunk mode full-map skip: Task 6.
- Config tuning: Task 5.
- Per-slot renderer reuse: Task 2 keeps `ChunkRenderSlot` and renderer creation localized.
- Tests for lifecycle, visibility, and world regenerate: Tasks 1, 2, 3, 4, and 6.

Placeholder scan:

- No `TODO`, `TBD`, or unspecified implementation steps are intentionally left.
- Every new helper, class, and test referenced by later tasks is introduced in an earlier task.

Type consistency:

- `ChunkManager.bootstrap(worldX, worldZ, camera = null)` and `update(worldX, worldZ, camera = null)` match the spec.
- `terrainChunkManager` is the neutral `World` property used after wiring.
- `activeSlots`, `freeSlots`, `pendingQueue`, `pendingKeys`, and `centerCoord` are consistently named across tests and implementation.
