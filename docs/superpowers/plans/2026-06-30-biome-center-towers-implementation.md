# Biome Center Towers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render one authored `tower.glb` at each biome center, tint/emissively light only its `light` mesh per biome, and log once when the aircraft enters each trigger radius.

**Architecture:** Add a focused `BiomeCenterSystem` owned by `World`, separate from `PrefabPlacer` and chunk slots. The system clones the registered tower GLB for each biome region, samples terrain height with the existing terrain generator, applies cloned light materials only to the configured light mesh, and checks player distance each frame.

**Tech Stack:** Three.js WebGPU, native `node --test`, Vite resource loading, existing `WorldConfig` biome region data.

---

### Task 1: Failing Tests for Config, Light Materials, Placement, and Triggers

**Files:**
- Create: `test/biomeCenterSystem.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/biomeCenterSystem.test.js` with tests that import `BiomeCenterSystem`, `matchesTowerLightMesh`, `applyTowerLightMaterial`, `disposeTowerLightMaterial`, `worldConfig`, and `sources`. The tests should verify:

- `sources` registers `biomeTowerModel` at `model/tower/tower.glb`.
- `worldConfig.biomeCenters` defines `assetName`, `lightMeshName`, and per-biome light colors.
- only meshes named `light` or `light.001` receive cloned emissive materials.
- non-light meshes keep their source materials.
- runtime cloned light materials are disposed without disposing shared textures.
- one tower is built for each biome region, placed at `center * terrain.cellSize`, with Y equal to sampled height times `terrain.layerHeight`.
- trigger logs fire once per center.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/biomeCenterSystem.test.js`

Expected: FAIL because `src/world/biomes/BiomeCenterSystem.js`, `worldConfig.biomeCenters`, and `biomeTowerModel` are not implemented yet.

### Task 2: Implement Biome Center Runtime

**Files:**
- Create: `src/world/biomes/BiomeCenterSystem.js`
- Modify: `src/assets/sources.js`
- Modify: `src/world/WorldConfig.js`
- Modify: `src/world/world.js`

- [ ] **Step 1: Register tower asset and config**

Add `{ name: 'biomeTowerModel', type: 'gltfModel', path: 'model/tower/tower.glb' }` to `src/assets/sources.js`.

Add `worldConfig.biomeCenters` with:

- `enabled: true`
- `assetName: 'biomeTowerModel'`
- `triggerRadius: 3`
- `lightMeshName: 'light'`
- per-biome `light.color`, `light.emissiveIntensity`, and `log` strings matching the spec.

- [ ] **Step 2: Add `BiomeCenterSystem`**

Create `BiomeCenterSystem` with:

- `group = new THREE.Group()`
- `build()` that clones the configured asset scene once per region.
- terrain height sampling via `terrainGenerator.generateForBounds({ x: centerX, z: centerZ }, 1, 1, { origin: { x: centerX, z: centerZ }, visibleSize: 1, halo: 0 })`.
- tower position `{ x: centerX * cellSize, y: height * layerHeight, z: centerZ * cellSize }`.
- light material helpers exported for tests.
- `update(playerPosition)` that logs each center once when within `triggerRadius`.
- `dispose()` that disposes cloned light materials and clears the group.

- [ ] **Step 3: Wire into `World`**

In `World.build()`, construct `BiomeCenterSystem` after terrain generation dependencies exist and add it with `addSystem()`.

In `World.update()`, call `biomeCenterSystem.update(this.playerAircraft.state.position)` when the aircraft is enabled.

In `World.dispose()`, rely on the existing child-system disposal loop.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- test/biomeCenterSystem.test.js`

Expected: PASS.

### Task 3: Full Verification and Commit

**Files:**
- Verify all intended files.

- [ ] **Step 1: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: PASS, allowing the existing Vite chunk-size warning if present.

- [ ] **Step 3: Review git diff**

Run: `git status --short` and `git diff --stat`.

Expected: changes are limited to the tower implementation, tests, plan, config, source registration, and the required `public/model/tower/tower.glb` asset; unrelated `%SystemDrive%/` remains untracked and unstaged.

---

## Self-Review

- Spec coverage: The plan covers GLB asset use, 2x2 base-origin placement, light-only biome emission, no prefab/chunk ownership, one-shot logs, and validation.
- Placeholder scan: No TBD/TODO placeholders are required for implementation.
- Type consistency: The plan consistently uses `biomeCenters`, `biomeTowerModel`, `lightMeshName`, `BiomeCenterSystem`, and `triggerRadius`.
