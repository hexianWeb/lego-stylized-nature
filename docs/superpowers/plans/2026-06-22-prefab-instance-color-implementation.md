# Prefab Instance Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic palette colors to selected child meshes of instanced flower and mushroom prefabs, while removing redundant mushroom color-variant assets.

**Architecture:** Add a focused `prefabInstanceColor.js` utility for palette validation, deterministic color selection, object-name matching, white-base material cloning, and cleanup. `PrefabPlacer` stores an optional color index on each transform and writes one `instanceColor` attribute per matching child `InstancedMesh`; palette values never enter bucket keys, so batching is preserved.

**Tech Stack:** JavaScript ES modules, Three.js WebGPU `InstancedMesh`, Node test runner, Vite.

---

## File Structure

- Create `src/world/prefabs/prefabInstanceColor.js`: instance-color configuration normalization, deterministic palette selection, Blender object-name matching, material cloning, and clone disposal.
- Create `test/prefabInstanceColor.test.js`: focused unit tests for validation, deterministic selection, matching, material handling, and cleanup.
- Modify `src/world/prefabs/PrefabPlacer.js`: attach color indices to opted-in transforms and populate matching `InstancedMesh.instanceColor` attributes.
- Modify `test/prefabPlacerBiomeTint.test.js`: integration tests for stable colors, same-plant consistency, suffix matching, bucket preservation, and biome-tint interaction.
- Modify `src/assets/manifests/biomePrefabs.js`: configure mushroom and flower palettes and reduce mushrooms to one model variant.
- Modify `src/assets/sources.js`: unregister redundant mushroom assets.
- Create `test/prefabInstanceColorConfig.test.js`: manifest and source cleanup tests.
- Delete `public/model/prefab/mushroom_2.glb`, `public/model/prefab/mushroom_3.glb`, and `public/model/prefab/mushroom_4.glb`.

### Task 1: Instance-color utility

**Files:**
- Create: `src/world/prefabs/prefabInstanceColor.js`
- Create: `test/prefabInstanceColor.test.js`

- [ ] **Step 1: Write failing utility tests**

Create tests covering:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import {
  normalizeInstanceColors,
  pickInstanceColorIndex,
  matchesInstanceColorMesh,
  resolveInstanceColorMaterial,
  disposeInstanceColorMaterial
} from '../src/world/prefabs/prefabInstanceColor.js'

test('normalizes valid colors and excludes invalid entries with one warning', () => {
  const warnings = []
  const result = normalizeInstanceColors({
    meshNameSuffix: '_InstanceColor',
    palette: ['#ff0000', 'bad', '#00ff00']
  }, (message) => warnings.push(message))

  assert.equal(result.meshNameSuffix, '_InstanceColor')
  assert.deepEqual(result.palette.map((color) => color.getHexString()), ['ff0000', '00ff00'])
  assert.equal(warnings.length, 1)
})

test('returns null for an empty valid palette', () => {
  assert.equal(normalizeInstanceColors({ meshNameSuffix: '_InstanceColor', palette: [] }, () => {}), null)
})

test('selects a stable palette index from coordinates, seed, and prefab id', () => {
  const first = pickInstanceColorIndex(12, 7, 42, 'landFlower', 4)
  const second = pickInstanceColorIndex(12, 7, 42, 'landFlower', 4)
  assert.equal(first, second)
  assert.equal(first >= 0 && first < 4, true)
})

test('matches exact and Blender-numbered object names', () => {
  assert.equal(matchesInstanceColorMesh('flower_InstanceColor', '_InstanceColor'), true)
  assert.equal(matchesInstanceColorMesh('flower_InstanceColor.001', '_InstanceColor'), true)
  assert.equal(matchesInstanceColorMesh('flower_InstanceColorExtra', '_InstanceColor'), false)
})

test('clones and whitens source material without mutating it', () => {
  const source = new THREE.MeshBasicMaterial({ color: '#cc2255' })
  const result = resolveInstanceColorMaterial(source)
  assert.notEqual(result, source)
  assert.equal(source.color.getHexString(), 'cc2255')
  assert.equal(result.color.getHexString(), 'ffffff')
  assert.equal(result.userData.isInstanceColorClone, true)
})

test('preserves material array order and disposes clones without textures', () => {
  const texture = new THREE.Texture()
  const first = new THREE.MeshBasicMaterial({ color: '#ff0000', map: texture })
  const second = new THREE.MeshBasicMaterial({ color: '#00ff00' })
  const result = resolveInstanceColorMaterial([first, second])
  let textureDisposed = false
  texture.dispose = () => { textureDisposed = true }
  disposeInstanceColorMaterial(result)
  assert.equal(result.length, 2)
  assert.equal(textureDisposed, false)
})
```

- [ ] **Step 2: Run tests and verify module-not-found failure**

Run:

```bash
npm test -- test/prefabInstanceColor.test.js
```

Expected: FAIL because `src/world/prefabs/prefabInstanceColor.js` does not exist.

- [ ] **Step 3: Implement the utility**

Create exports with these exact responsibilities:

```js
import * as THREE from 'three/webgpu'
import { random01, hashString } from '../../utils/random.js'

const INSTANCE_COLOR_CLONE_FLAG = 'isInstanceColorClone'

export function normalizeInstanceColors(config, warn = console.warn) {
  if (!config || typeof config.meshNameSuffix !== 'string' || config.meshNameSuffix.length === 0) {
    return null
  }

  const palette = []
  let warned = false
  for (const value of Array.isArray(config.palette) ? config.palette : []) {
    if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value.trim())) {
      if (!warned) {
        warn('Invalid prefab instance color palette entry')
        warned = true
      }
      continue
    }
    palette.push(new THREE.Color(value.trim()))
  }

  if (palette.length === 0) {
    warn('Prefab instance color palette has no valid colors')
    return null
  }

  return { meshNameSuffix: config.meshNameSuffix, palette }
}

export function pickInstanceColorIndex(x, z, seed, prefabId, paletteLength) {
  if (paletteLength <= 0) return null
  const value = random01(x, z, seed + hashString(`${prefabId}:instanceColor`))
  return Math.min(paletteLength - 1, Math.floor(value * paletteLength))
}

export function matchesInstanceColorMesh(name, suffix) {
  if (typeof name !== 'string' || typeof suffix !== 'string') return false
  const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}(?:\\.\\d{3})?$`).test(name)
}

export function resolveInstanceColorMaterial(sourceMaterial) {
  if (Array.isArray(sourceMaterial)) {
    return sourceMaterial.map(resolveSingleMaterial)
  }
  return resolveSingleMaterial(sourceMaterial)
}

export function disposeInstanceColorMaterial(material) {
  if (Array.isArray(material)) {
    material.forEach(disposeInstanceColorMaterial)
  } else if (material?.userData?.[INSTANCE_COLOR_CLONE_FLAG] === true) {
    material.dispose()
  }
}

function resolveSingleMaterial(sourceMaterial) {
  if (!sourceMaterial) return sourceMaterial
  const clone = sourceMaterial.clone()
  if (clone.color?.set) clone.color.set(0xffffff)
  clone.userData = { ...clone.userData, [INSTANCE_COLOR_CLONE_FLAG]: true }
  clone.needsUpdate = true
  return clone
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- test/prefabInstanceColor.test.js
```

Expected: all instance-color utility tests PASS.

- [ ] **Step 5: Commit utility**

```bash
git add src/world/prefabs/prefabInstanceColor.js test/prefabInstanceColor.test.js
git commit -m "feat: add prefab instance color utilities"
```

### Task 2: PrefabPlacer integration

**Files:**
- Modify: `src/world/prefabs/PrefabPlacer.js`
- Modify: `test/prefabPlacerBiomeTint.test.js`

- [ ] **Step 1: Add failing placement and rendering tests**

Add tests that assert:

```js
test('collectTransforms stores color indices without splitting buckets', () => {
  // Use two placements of one prefab with a four-color palette.
  // Assert one bucket, two transforms, and integer instanceColorIndex values.
})

test('matching child receives per-instance palette colors', () => {
  // Build a source scene with child.name = 'flower_InstanceColor'.
  // Supply transforms with instanceColorIndex 0 and 1.
  // Assert mesh.instanceColor exists and getColorAt() returns both palette colors.
  // Assert the cloned material base color is white.
})

test('multiple matching children use the same transform color', () => {
  // Create '_InstanceColor' and '_InstanceColor.001' children.
  // Assert color i is identical across both generated InstancedMeshes.
})

test('nonmatching child retains biome tint and has no instance color', () => {
  // Create a child named 'flower_root', pass a biome tint and instanceColors config.
  // Assert its material has the biome-tinted color and instanceColor is null.
})
```

Update the test helper so `buildVariantInstances()` receives transform objects that may include `instanceColorIndex`.

- [ ] **Step 2: Run integration tests and verify failure**

Run:

```bash
npm test -- test/prefabPlacerBiomeTint.test.js
```

Expected: FAIL because transforms have no color indices and matching children do not receive `instanceColor`.

- [ ] **Step 3: Integrate normalized palette data into collection**

Import the new helpers. In `collectTransforms()`:

```js
const instanceColors = normalizeInstanceColors(prefab.entry.instanceColors)
if (instanceColors) {
  transform.instanceColorIndex = pickInstanceColorIndex(
    x,
    z,
    seed,
    rule.id,
    instanceColors.palette.length
  )
}
```

Do not change the bucket key. Do not add color data for prefabs without valid `instanceColors`.

- [ ] **Step 4: Integrate instance colors into mesh construction**

In `buildVariantInstances()` normalize the prefab configuration once. For each child:

```js
const usesInstanceColor = instanceColors &&
  matchesInstanceColorMesh(child.name, instanceColors.meshNameSuffix)

const material = usesInstanceColor
  ? resolveInstanceColorMaterial(child.material)
  : resolvePrefabMaterial(child.material, tint)

const mesh = new THREE.InstancedMesh(child.geometry, material, transforms.length)
```

Inside the transform loop:

```js
if (usesInstanceColor) {
  const colorIndex = Number.isInteger(t.instanceColorIndex) ? t.instanceColorIndex : 0
  mesh.setColorAt(i, instanceColors.palette[colorIndex] ?? instanceColors.palette[0])
}
```

After the loop:

```js
if (mesh.instanceColor) {
  mesh.instanceColor.needsUpdate = true
}
```

Track whether any child matched. If configuration is valid but no child matched, emit one warning after traversal, not once per instance.

- [ ] **Step 5: Dispose both owned material types**

In `clearInstances()` call:

```js
disposeBiomeTintMaterial(node.material)
disposeInstanceColorMaterial(node.material)
```

Each disposer only acts on its own marker, so shared source materials and textures remain untouched.

- [ ] **Step 6: Run placement integration tests**

Run:

```bash
npm test -- test/prefabPlacerBiomeTint.test.js
```

Expected: all PrefabPlacer tests PASS.

- [ ] **Step 7: Commit integration**

```bash
git add src/world/prefabs/PrefabPlacer.js test/prefabPlacerBiomeTint.test.js
git commit -m "feat: apply deterministic prefab instance colors"
```

### Task 3: Manifest configuration and redundant resource removal

**Files:**
- Modify: `src/assets/manifests/biomePrefabs.js`
- Modify: `src/assets/sources.js`
- Create: `test/prefabInstanceColorConfig.test.js`
- Delete: `public/model/prefab/mushroom_2.glb`
- Delete: `public/model/prefab/mushroom_3.glb`
- Delete: `public/model/prefab/mushroom_4.glb`

- [ ] **Step 1: Write failing configuration tests**

Create tests that assert:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { biomePrefabs } from '../src/assets/manifests/biomePrefabs.js'
import sources from '../src/assets/sources.js'

test('flower and mushroom define instance color palettes', () => {
  assert.deepEqual(biomePrefabs.landMushroom.instanceColors, {
    meshNameSuffix: '_InstanceColor',
    palette: ['#c9110e', '#0158b8', '#ea9202', '#03b1a0']
  })
  assert.deepEqual(biomePrefabs.landFlower.instanceColors, {
    meshNameSuffix: '_InstanceColor',
    palette: ['#f97ba8', '#f695b5', '#ed4e90']
  })
})

test('mushroom uses only its first model', () => {
  assert.deepEqual(biomePrefabs.landMushroom.variants, [
    { source: 'landMushroom1Model', weight: 1 }
  ])
})

test('redundant mushroom sources and files are removed', () => {
  const names = new Set(sources.map((source) => source.name))
  for (const index of [2, 3, 4]) {
    assert.equal(names.has(`landMushroom${index}Model`), false)
    assert.equal(existsSync(`public/model/prefab/mushroom_${index}.glb`), false)
  }
})
```

- [ ] **Step 2: Run config tests and verify failure**

Run:

```bash
npm test -- test/prefabInstanceColorConfig.test.js
```

Expected: FAIL because palettes are absent and redundant sources/files still exist.

- [ ] **Step 3: Update manifest and sources**

Set:

```js
landMushroom.instanceColors = {
  meshNameSuffix: '_InstanceColor',
  palette: ['#c9110e', '#0158b8', '#ea9202', '#03b1a0']
}

landFlower.instanceColors = {
  meshNameSuffix: '_InstanceColor',
  palette: ['#f97ba8', '#f695b5', '#ed4e90']
}
```

Keep only `landMushroom1Model` in the mushroom variants and source list.

- [ ] **Step 4: Delete redundant GLB files**

Delete only:

```text
public/model/prefab/mushroom_2.glb
public/model/prefab/mushroom_3.glb
public/model/prefab/mushroom_4.glb
```

Preserve the user's modified `flower.glb` and `mushroom_1.glb`.

- [ ] **Step 5: Run config tests**

Run:

```bash
npm test -- test/prefabInstanceColorConfig.test.js
```

Expected: all configuration and resource cleanup tests PASS.

- [ ] **Step 6: Commit configuration and cleanup**

```bash
git add src/assets/manifests/biomePrefabs.js src/assets/sources.js test/prefabInstanceColorConfig.test.js
git add -u public/model/prefab/mushroom_2.glb public/model/prefab/mushroom_3.glb public/model/prefab/mushroom_4.glb
git commit -m "feat: configure flower and mushroom instance colors"
```

### Task 4: Full verification

**Files:**
- Verify all modified files

- [ ] **Step 1: Run targeted tests together**

```bash
npm test -- test/prefabInstanceColor.test.js test/prefabPlacerBiomeTint.test.js test/prefabInstanceColorConfig.test.js test/biomePrefabTintConfig.test.js
```

Expected: all targeted tests PASS.

- [ ] **Step 2: Run the complete test suite**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: Vite build completes successfully. If the known Windows sandbox `EPERM` against `C:\Users\f1686533` occurs, rerun with approved elevated execution and report it separately from code failures.

- [ ] **Step 4: Inspect final scope**

```bash
git status --short
git diff --check
rg -n "landMushroom[234]Model|mushroom_[234]\\.glb" src test
```

Expected:

- no whitespace errors
- no stale mushroom source references
- only intended implementation changes plus the user's modified `flower.glb` and `mushroom_1.glb`

- [ ] **Step 5: Commit any verification-only corrections**

If verification required code corrections, stage only those corrections and commit:

```bash
git commit -m "fix: complete prefab instance color integration"
```
