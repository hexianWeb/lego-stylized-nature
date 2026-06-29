# Visible Prefab Chunk Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep terrain/water/lava loaded in the 3x3 chunk window, but build and show prefabs only for camera-visible chunks so invisible pending/outer chunks cannot consume prefab capacity or appear to move visible prefab resources away from the player.

**Architecture:** `ChunkRenderSlot.populate()` will build terrain, water, lava, and AO immediately, while resetting prefab state for the new chunk. `ChunkManager.updateVisibility()` will decide which loaded slots are render-visible and call a new slot API to lazily build/show prefabs only for visible slots. Invisible loaded slots remain loaded terrain slots but keep prefab groups hidden.

**Tech Stack:** JavaScript ES modules, Three.js WebGPU groups, Node `node:test`, existing `ChunkManager`, `ChunkRenderSlot`, and `PrefabPlacer`.

**Execution note:** Do not commit automatically. Ask before committing implementation code.

---

## File Structure

- Modify: `src/world/chunks/ChunkRenderSlot.js`
  - Add prefab lifecycle state.
  - Stop building prefabs unconditionally during `populate()`.
  - Add `ensurePrefabsBuilt()` and `setPrefabsVisible()`.
  - Keep water/lava overlay visibility behavior unchanged.
- Modify: `src/world/chunks/ChunkManager.js`
  - Track which loaded slots are terrain-visible from camera bounds.
  - Call `ensurePrefabsBuilt()` only for visible loaded slots.
  - Hide prefabs for invisible loaded slots without releasing terrain slots.
- Modify: `test/chunkManager.test.js`
  - Extend test slot doubles to record prefab builds and visibility.
  - Add tests for invisible loaded chunk not building prefab.
  - Add tests for newly visible loaded chunk building prefab exactly once.
- Optional Modify: `test/chunkRenderSlot.test.js`
  - Add direct slot tests if manager-level test doubles are not enough.

---

### Task 1: Add Lazy Prefab API to ChunkRenderSlot

**Files:**
- Modify: `src/world/chunks/ChunkRenderSlot.js`
- Modify: `test/chunkManager.test.js`

- [ ] **Step 1: Add failing manager-level prefab lifecycle test**

Update the slot double in `test/chunkManager.test.js` to include prefab behavior:

```js
prefabBuilds: 0,
prefabsVisible: false,
ensurePrefabsBuilt() {
  this.prefabBuilds++
},
setPrefabsVisible(visible) {
  this.prefabsVisible = visible
},
```

Add this test:

```js
test('camera visibility builds prefabs only for visible loaded slots', () => {
  const manager = createManager()
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

  const visibleSlots = [...manager.activeSlots.values()].filter((slot) => slot.group.visible)
  const hiddenSlots = [...manager.activeSlots.values()].filter((slot) => !slot.group.visible)

  assert.ok(visibleSlots.length > 0)
  assert.ok(hiddenSlots.length > 0)
  assert.ok(visibleSlots.every((slot) => slot.prefabBuilds === 1 && slot.prefabsVisible === true))
  assert.ok(hiddenSlots.every((slot) => slot.prefabBuilds === 0 && slot.prefabsVisible === false))
})
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npm test -- test/chunkManager.test.js`

Expected: FAIL because `ChunkManager.updateVisibility()` does not call the new prefab APIs yet.

- [ ] **Step 3: Add slot prefab lifecycle state**

Modify `src/world/chunks/ChunkRenderSlot.js` constructor:

```js
    this.prefabsBuiltForKey = null
    this.prefabsVisible = false
```

Modify `populate()` to reset prefab state for the new coord:

```js
    this.prefabsBuiltForKey = null
    this.prefabsVisible = false
    if (this.prefabPlacer?.group) {
      this.prefabPlacer.group.visible = false
    }
```

Remove the unconditional call:

```js
    this.prefabPlacer?.build(terrainMap)
```

- [ ] **Step 4: Add slot methods**

Add to `src/world/chunks/ChunkRenderSlot.js`:

```js
  ensurePrefabsBuilt() {
    if (!this.prefabPlacer || !this.terrainMap || !this.key) {
      return
    }

    if (this.prefabsBuiltForKey === this.key) {
      return
    }

    this.prefabPlacer.build(this.terrainMap)
    this.prefabsBuiltForKey = this.key
  }

  setPrefabsVisible(visible) {
    this.prefabsVisible = visible
    if (this.prefabPlacer?.group) {
      this.prefabPlacer.group.visible = visible
    }
  }
```

- [ ] **Step 5: Keep overlay visibility from forcing prefab visibility**

Change `setOverlaysVisible(visible)` in `ChunkRenderSlot.js` so prefab visibility is not managed with water/lava overlays:

```js
  setOverlaysVisible(visible) {
    if (this.waterRenderer?.group) {
      this.waterRenderer.group.visible = visible
    }
    if (this.lavaRenderer?.group) {
      this.lavaRenderer.group.visible = visible
    }
  }
```

`show()` should continue to call `syncOverlayVisibility()` for water/lava only. Prefab visibility is controlled by `ChunkManager`.

- [ ] **Step 6: Run manager tests**

Run: `npm test -- test/chunkManager.test.js`

Expected: still FAIL until Task 2 wires manager visibility to prefab APIs.

---

### Task 2: Activate Prefabs Only for Visible Slots

**Files:**
- Modify: `src/world/chunks/ChunkManager.js`
- Modify: `test/chunkManager.test.js`

- [ ] **Step 1: Update `ChunkManager.updateVisibility()`**

Modify `src/world/chunks/ChunkManager.js`:

```js
  updateVisibility(camera = null) {
    const cameraBounds = getCameraWorldBounds(camera, this.visibilityPadding)

    for (const slot of this.activeSlots.values()) {
      const visible = !cameraBounds || boundsIntersect(
        getChunkBounds(slot.coord, this.chunkSize, this.cellSize, this.visibilityPadding),
        cameraBounds
      )

      if (visible) {
        slot.show()
        slot.ensurePrefabsBuilt?.()
        slot.setPrefabsVisible?.(true)
      } else {
        slot.hide()
        slot.setPrefabsVisible?.(false)
      }
    }
  }
```

- [ ] **Step 2: Run manager tests**

Run: `npm test -- test/chunkManager.test.js`

Expected: PASS, including `camera visibility builds prefabs only for visible loaded slots`.

- [ ] **Step 3: Add regression for visible slot not rebuilding prefab every frame**

Add test:

```js
test('visible loaded slots build prefabs once per chunk key', () => {
  const manager = createManager()

  manager.bootstrap(6.4, 6.4)
  while (manager.pendingQueue.length > 0) {
    manager.update(6.4, 6.4)
  }

  const visibleSlots = [...manager.activeSlots.values()].filter((slot) => slot.group.visible)
  manager.update(6.4, 6.4)
  manager.update(6.4, 6.4)

  assert.ok(visibleSlots.every((slot) => slot.prefabBuilds === 1))
})
```

- [ ] **Step 4: Run manager tests again**

Run: `npm test -- test/chunkManager.test.js`

Expected: PASS.

---

### Task 3: Verify Real ChunkRenderSlot Prefab Reset

**Files:**
- Modify: `test/chunkManager.test.js`
- Optional Modify: `test/chunkRenderSlot.test.js`

- [ ] **Step 1: Add direct fake slot test if needed**

If manager test doubles do not prove real slot behavior, create `test/chunkRenderSlot.test.js` with simple fake renderer objects and a fake `prefabPlacer`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import ChunkRenderSlot from '../src/world/chunks/ChunkRenderSlot.js'

function createRenderer(name) {
  return {
    group: new THREE.Group(),
    build() {},
    updateInstanceColors() {},
    dispose() {}
  }
}

test('chunk render slot delays prefab build until requested and resets on repopulate', () => {
  let prefabBuilds = 0
  const prefabPlacer = {
    group: new THREE.Group(),
    build() {
      prefabBuilds++
    },
    dispose() {}
  }
  const slot = new ChunkRenderSlot({
    index: 0,
    chunkSize: 64,
    cellSize: 0.2,
    terrainRenderer: createRenderer('terrain'),
    heightfieldAO: { build() {}, isActive() { return false } },
    prefabPlacer,
    waterRenderer: createRenderer('water'),
    lavaRenderer: createRenderer('lava')
  })

  slot.populate({
    coord: { x: 0, z: 0 },
    terrainMap: {},
    placements: [],
    colorResolver: {}
  })

  assert.equal(prefabBuilds, 0)
  assert.equal(prefabPlacer.group.visible, false)

  slot.ensurePrefabsBuilt()
  slot.ensurePrefabsBuilt()
  assert.equal(prefabBuilds, 1)

  slot.populate({
    coord: { x: 1, z: 0 },
    terrainMap: {},
    placements: [],
    colorResolver: {}
  })
  assert.equal(prefabPlacer.group.visible, false)

  slot.ensurePrefabsBuilt()
  assert.equal(prefabBuilds, 2)
})
```

- [ ] **Step 2: Run slot and manager tests**

Run: `npm test -- test/chunkManager.test.js test/chunkRenderSlot.test.js`

Expected: PASS if `test/chunkRenderSlot.test.js` exists. If no direct slot test was needed, run `npm test -- test/chunkManager.test.js`.

---

### Task 4: Focused Verification

**Files:**
- Modify only if tests expose issues in touched files.

- [ ] **Step 1: Run focused chunk tests**

Run: `npm test -- test/chunkCoordinates.test.js test/chunkManager.test.js test/worldChunkMode.test.js test/terrainChunkPingPong.test.js`

Expected: PASS.

- [ ] **Step 2: Run prefab focused tests**

Run: `npm test -- test/prefabPlacerBiomeTint.test.js test/prefabInstanceColor.test.js`

Expected: PASS. If unrelated manifest expectation failures remain in `test/prefabInstanceColorConfig.test.js`, report separately and do not mix with this chunk-prefab visibility fix.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: PASS with only the existing Vite large chunk warning.

---

## Acceptance Criteria

- Loading an off-camera outer chunk does not build prefab instances.
- Camera-visible loaded chunks build prefabs lazily and show them.
- A visible chunk builds prefabs once per chunk key, not every frame.
- Reusing a slot for a new coord hides old prefabs and marks prefab data stale.
- Terrain/water/lava remain loaded and visible according to existing camera bounds behavior.
- AO preview still hides water/lava overlays and does not accidentally show prefabs.
