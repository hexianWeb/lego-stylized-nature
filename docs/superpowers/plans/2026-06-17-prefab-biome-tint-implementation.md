# Prefab Biome Tint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional biome color tinting for prefab materials, initially configured for `commonRock` and `landGrass`.

**Architecture:** Keep prefab placement deterministic and instanced. Add a small material tint utility, configure tint data in the prefab manifest, and change `PrefabPlacer` to create biome-specific buckets only when a tint applies. Tinted buckets receive cloned materials; untinted buckets keep imported GLB materials and the existing bucket count.

**Tech Stack:** Three.js WebGPU entrypoint, native `node:test`, existing Vite build.

---

## File Structure

- Create `src/world/prefabs/prefabMaterialTint.js`
  - Owns tint normalization, material cloning, material array handling, and tinted clone disposal.
- Create `test/prefabMaterialTint.test.js`
  - Verifies strength-controlled tinting, material array behavior, invalid tint fallback, and texture-safe cleanup.
- Create `test/biomePrefabTintConfig.test.js`
  - Verifies `commonRock` and `landGrass` expose complete tint config and unrelated prefabs remain unconfigured.
- Create `test/prefabPlacerBiomeTint.test.js`
  - Verifies structured buckets, no biome split for untinted placements, build material application, and cleanup.
- Modify `src/assets/manifests/biomePrefabs.js`
  - Adds `biomeTints` to `commonRock` and `landGrass`.
- Modify `src/world/prefabs/PrefabPlacer.js`
  - Uses structured bucket values.
  - Includes biome in bucket identity only when an applicable tint exists.
  - Applies resolved materials during instanced mesh creation.
  - Disposes only cloned tinted materials during cleanup.

## Task 1: Material Tint Utility

**Files:**
- Create: `src/world/prefabs/prefabMaterialTint.js`
- Create: `test/prefabMaterialTint.test.js`

- [ ] **Step 1: Write material tint tests**

Create `test/prefabMaterialTint.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import {
  resolvePrefabMaterial,
  disposeBiomeTintMaterial
} from '../src/world/prefabs/prefabMaterialTint.js'

test('returns source material when tint is null', () => {
  const source = new THREE.MeshBasicMaterial({ color: '#808080' })

  const result = resolvePrefabMaterial(source, null)

  assert.equal(result, source)
})

test('clones and strength-tints material color without mutating source', () => {
  const source = new THREE.MeshBasicMaterial({ color: '#ffffff' })

  const result = resolvePrefabMaterial(source, { color: '#000000', strength: 0.5 })

  assert.notEqual(result, source)
  assert.equal(result.userData.isBiomeTintClone, true)
  assert.equal(source.color.getHexString(), 'ffffff')
  assert.equal(result.color.getHexString(), 'bcbcbc')
  assert.equal(result.version > 0, true)
})

test('clamps tint strength to the 0 to 1 range', () => {
  const source = new THREE.MeshBasicMaterial({ color: '#ffffff' })

  const overStrength = resolvePrefabMaterial(source, { color: '#000000', strength: 2 })
  const underStrength = resolvePrefabMaterial(source, { color: '#000000', strength: -1 })

  assert.equal(overStrength.color.getHexString(), '000000')
  assert.equal(underStrength.color.getHexString(), 'ffffff')
})

test('returns source material and warns when tint color is not usable', () => {
  const source = new THREE.MeshBasicMaterial({ color: '#808080' })
  const originalWarn = console.warn
  const warnings = []
  console.warn = (message) => warnings.push(message)

  try {
    const result = resolvePrefabMaterial(source, { color: null, strength: 0.5 })

    assert.equal(result, source)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /Invalid prefab biome tint color/)
  } finally {
    console.warn = originalWarn
  }
})

test('preserves material array order when tinting', () => {
  const first = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  const second = new THREE.MeshBasicMaterial({ color: '#808080' })

  const result = resolvePrefabMaterial([first, second], { color: '#000000', strength: 1 })

  assert.equal(Array.isArray(result), true)
  assert.equal(result.length, 2)
  assert.notEqual(result[0], first)
  assert.notEqual(result[1], second)
  assert.equal(result[0].color.getHexString(), '000000')
  assert.equal(result[1].color.getHexString(), '000000')
})

test('disposes only cloned tinted materials and not shared textures', () => {
  const texture = new THREE.Texture()
  const material = new THREE.MeshBasicMaterial({ map: texture })
  let materialDisposed = false
  let textureDisposed = false
  material.userData.isBiomeTintClone = true
  material.dispose = () => {
    materialDisposed = true
  }
  texture.dispose = () => {
    textureDisposed = true
  }

  disposeBiomeTintMaterial(material)

  assert.equal(materialDisposed, true)
  assert.equal(textureDisposed, false)
})

test('disposes marked entries inside material arrays only', () => {
  const tinted = new THREE.MeshBasicMaterial()
  const source = new THREE.MeshBasicMaterial()
  let tintedDisposed = false
  let sourceDisposed = false
  tinted.userData.isBiomeTintClone = true
  tinted.dispose = () => {
    tintedDisposed = true
  }
  source.dispose = () => {
    sourceDisposed = true
  }

  disposeBiomeTintMaterial([tinted, source])

  assert.equal(tintedDisposed, true)
  assert.equal(sourceDisposed, false)
})
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run: `npm test -- test/prefabMaterialTint.test.js`

Expected: FAIL with module-not-found for `src/world/prefabs/prefabMaterialTint.js`.

- [ ] **Step 3: Create the material tint utility**

Create `src/world/prefabs/prefabMaterialTint.js`:

```js
import * as THREE from 'three/webgpu'

const TINT_CLONE_FLAG = 'isBiomeTintClone'

export function resolvePrefabMaterial(sourceMaterial, tint) {
  if (Array.isArray(sourceMaterial)) {
    return sourceMaterial.map((material) => resolveSinglePrefabMaterial(material, tint))
  }

  return resolveSinglePrefabMaterial(sourceMaterial, tint)
}

export function disposeBiomeTintMaterial(material) {
  if (Array.isArray(material)) {
    material.forEach(disposeBiomeTintMaterial)
    return
  }

  if (material?.userData?.[TINT_CLONE_FLAG] === true) {
    material.dispose()
  }
}

function resolveSinglePrefabMaterial(sourceMaterial, tint) {
  if (!sourceMaterial || !tint) {
    return sourceMaterial
  }

  const normalized = normalizeTint(tint)
  if (!normalized) {
    return sourceMaterial
  }

  const clone = sourceMaterial.clone()
  const sourceColor = sourceMaterial.color?.clone?.() ?? new THREE.Color(0xffffff)
  const targetColor = sourceColor.clone().multiply(normalized.color)

  clone.color = sourceColor.clone().lerp(targetColor, normalized.strength)
  clone.userData = {
    ...clone.userData,
    [TINT_CLONE_FLAG]: true
  }
  clone.needsUpdate = true

  return clone
}

function normalizeTint(tint) {
  if (typeof tint.color !== 'string') {
    console.warn('Invalid prefab biome tint color:', tint.color)
    return null
  }

  const color = new THREE.Color()
  try {
    color.set(tint.color)
  } catch {
    console.warn('Invalid prefab biome tint color:', tint.color)
    return null
  }

  const strength = Number.isFinite(tint.strength) ? tint.strength : 1

  return {
    color,
    strength: THREE.MathUtils.clamp(strength, 0, 1)
  }
}
```

- [ ] **Step 4: Run material tint tests and verify they pass**

Run: `npm test -- test/prefabMaterialTint.test.js`

Expected: PASS for all tests in `prefabMaterialTint.test.js`.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/world/prefabs/prefabMaterialTint.js test/prefabMaterialTint.test.js
git commit -m "feat: add prefab material tint utility"
```

## Task 2: Manifest Tint Configuration

**Files:**
- Modify: `src/assets/manifests/biomePrefabs.js`
- Create: `test/biomePrefabTintConfig.test.js`

- [ ] **Step 1: Write manifest config tests**

Create `test/biomePrefabTintConfig.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { biomePrefabs } from '../src/assets/manifests/biomePrefabs.js'

const expectedTintedPrefabs = new Set(['commonRock', 'landGrass'])

test('commonRock defines biome tint config for all current land biomes', () => {
  assert.deepEqual(Object.keys(biomePrefabs.commonRock.biomeTints).sort(), [
    'autumnForest',
    'desert',
    'forest',
    'volcano'
  ])
})

test('landGrass defines biome tint config for grass-hosting land biomes', () => {
  assert.deepEqual(Object.keys(biomePrefabs.landGrass.biomeTints).sort(), [
    'autumnForest',
    'desert',
    'forest'
  ])
})

test('biome tint entries use color and normalized strength', () => {
  for (const prefabId of expectedTintedPrefabs) {
    for (const tint of Object.values(biomePrefabs[prefabId].biomeTints)) {
      assert.equal(typeof tint.color, 'string')
      assert.equal(typeof tint.strength, 'number')
      assert.equal(tint.strength >= 0, true)
      assert.equal(tint.strength <= 1, true)
    }
  }
})

test('unrelated prefabs do not opt into biome tinting', () => {
  const tintedPrefabIds = Object.entries(biomePrefabs)
    .filter(([, entry]) => entry.biomeTints)
    .map(([prefabId]) => prefabId)
    .sort()

  assert.deepEqual(tintedPrefabIds, [...expectedTintedPrefabs].sort())
})
```

- [ ] **Step 2: Run manifest config tests and verify they fail**

Run: `npm test -- test/biomePrefabTintConfig.test.js`

Expected: FAIL because `biomeTints` is not defined yet.

- [ ] **Step 3: Add biome tint config to the manifest**

Modify `src/assets/manifests/biomePrefabs.js`:

```js
  commonRock: {
    category: 'rock',
    placement: { surface: 'land' },
    variants: [
      { source: 'commonRock1Model', weight: 1 },
      { source: 'commonRock2Model', weight: 1 },
      { source: 'commonRock3Model', weight: 1 },
      { source: 'commonRock4Model', weight: 1 }
    ],
    randomRotation: true,
    biomeTints: {
      forest: { color: '#7a8178', strength: 0.35 },
      autumnForest: { color: '#9a7a55', strength: 0.4 },
      desert: { color: '#b59a68', strength: 0.45 },
      volcano: { color: '#3a3a3a', strength: 0.65 }
    }
  },
```

```js
  landGrass: {
    category: 'flora',
    placement: { surface: 'land' },
    variants: [
      { source: 'landGrassModel', weight: 1 },
      { source: 'landGrass2Model', weight: 1 }
    ],
    randomRotation: true,
    biomeTints: {
      forest: { color: '#67b65d', strength: 0.35 },
      autumnForest: { color: '#c99a42', strength: 0.55 },
      desert: { color: '#c6b56a', strength: 0.65 }
    }
  },
```

- [ ] **Step 4: Run manifest config tests and verify they pass**

Run: `npm test -- test/biomePrefabTintConfig.test.js`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/assets/manifests/biomePrefabs.js test/biomePrefabTintConfig.test.js
git commit -m "feat: configure prefab biome tints"
```

## Task 3: Structured Transform Buckets

**Files:**
- Modify: `src/world/prefabs/PrefabPlacer.js`
- Create: `test/prefabPlacerBiomeTint.test.js`

- [ ] **Step 1: Write collectTransforms tests**

Create `test/prefabPlacerBiomeTint.test.js` with these initial tests:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import PrefabPlacer from '../src/world/prefabs/PrefabPlacer.js'

function createPlacer({ manifest, biomes, width = 2, depth = 1 }) {
  return new PrefabPlacer({
    config: {
      seed: 1,
      terrain: { width, depth, cellSize: 1, layerHeight: 1, waterLevel: 0 },
      placement: { rotationStep: Math.PI / 2, enableTrees: true }
    },
    biomeRegistry: {
      get(id) {
        return biomes[id]
      }
    },
    prefabRegistry: {
      get(id) {
        const entry = manifest[id]
        return entry ? { id, entry } : null
      },
      getVariantAsset() {
        return null
      }
    }
  })
}

function createTerrainMap(biomeIds) {
  return {
    getBiomeCell(x, z) {
      const biomeId = biomeIds[z][x]
      return { biomeId, weights: { [biomeId]: 1 } }
    },
    getSurfaceCell() {
      return { height: 4, slope: 0, isWater: false, isShore: false, isLava: false }
    }
  }
}

test('collectTransforms stores structured bucket metadata for tinted placements', () => {
  const manifest = {
    testGrass: {
      category: 'flora',
      placement: { surface: 'land' },
      variants: [{ source: 'grassModel', weight: 1 }],
      randomRotation: false,
      biomeTints: {
        forest: { color: '#ffffff', strength: 0.5 }
      }
    }
  }
  const biomes = {
    forest: { prefabs: [{ id: 'testGrass', density: 1 }] }
  }
  const placer = createPlacer({ manifest, biomes, width: 1, depth: 1 })

  const buckets = [...placer.collectTransforms(createTerrainMap([['forest']])).values()]

  assert.equal(buckets.length, 1)
  assert.equal(buckets[0].prefabId, 'testGrass')
  assert.equal(buckets[0].variantIndex, 0)
  assert.equal(buckets[0].biomeId, 'forest')
  assert.deepEqual(buckets[0].tint, { color: '#ffffff', strength: 0.5 })
  assert.equal(buckets[0].transforms.length, 1)
})

test('collectTransforms does not split by biome when no tint applies', () => {
  const manifest = {
    testRock: {
      category: 'rock',
      placement: { surface: 'land' },
      variants: [{ source: 'rockModel', weight: 1 }],
      randomRotation: false
    }
  }
  const biomes = {
    forest: { prefabs: [{ id: 'testRock', density: 1 }] },
    desert: { prefabs: [{ id: 'testRock', density: 1 }] }
  }
  const placer = createPlacer({ manifest, biomes, width: 2, depth: 1 })

  const buckets = [...placer.collectTransforms(createTerrainMap([['forest', 'desert']])).values()]

  assert.equal(buckets.length, 1)
  assert.equal(buckets[0].prefabId, 'testRock')
  assert.equal(buckets[0].variantIndex, 0)
  assert.equal(buckets[0].biomeId, null)
  assert.equal(buckets[0].tint, null)
  assert.equal(buckets[0].transforms.length, 2)
})

test('collectTransforms uses untinted bucket when prefab lacks current biome tint', () => {
  const manifest = {
    testGrass: {
      category: 'flora',
      placement: { surface: 'land' },
      variants: [{ source: 'grassModel', weight: 1 }],
      randomRotation: false,
      biomeTints: {
        forest: { color: '#ffffff', strength: 0.5 }
      }
    }
  }
  const biomes = {
    desert: { prefabs: [{ id: 'testGrass', density: 1 }] }
  }
  const placer = createPlacer({ manifest, biomes, width: 1, depth: 1 })

  const buckets = [...placer.collectTransforms(createTerrainMap([['desert']])).values()]

  assert.equal(buckets.length, 1)
  assert.equal(buckets[0].biomeId, null)
  assert.equal(buckets[0].tint, null)
  assert.equal(buckets[0].transforms.length, 1)
})
```

- [ ] **Step 2: Run PrefabPlacer bucket tests and verify they fail**

Run: `npm test -- test/prefabPlacerBiomeTint.test.js`

Expected: FAIL because bucket values are arrays, not structured objects.

- [ ] **Step 3: Update imports in PrefabPlacer**

Modify the top of `src/world/prefabs/PrefabPlacer.js`:

```js
import * as THREE from 'three/webgpu'
import { placementRandom01 } from '../../utils/random.js'
import { canPlacePrefab, pickVariantIndex, makePrefabTransform } from './placementRules.js'
import { resolvePrefabMaterial, disposeBiomeTintMaterial } from './prefabMaterialTint.js'
```

- [ ] **Step 4: Replace build loop to consume structured bucket values**

Replace `build(terrainMap)` in `src/world/prefabs/PrefabPlacer.js`:

```js
    build(terrainMap) {
        this.clearInstances()

        const buckets = this.collectTransforms(terrainMap)

        for (const bucket of buckets.values()) {
            const prefab = this.prefabRegistry.get(bucket.prefabId)
            const gltf = this.prefabRegistry.getVariantAsset(bucket.prefabId, bucket.variantIndex)
            if (!prefab || !gltf?.scene) {
                continue
            }
            this.group.add(this.buildVariantInstances(gltf.scene, bucket.transforms, prefab.entry, bucket.tint))
        }

        return this.group
    }
```

- [ ] **Step 5: Replace bucket creation in collectTransforms**

Inside `collectTransforms(terrainMap)`, replace the key/set/push block with:

```js
                    const tint = prefab.entry.biomeTints?.[biomeCell.biomeId] ?? null
                    const bucketBiomeId = tint ? biomeCell.biomeId : null
                    const key = bucketBiomeId
                        ? `${rule.id}:${variantIndex}:${bucketBiomeId}`
                        : `${rule.id}:${variantIndex}`
                    if (!buckets.has(key)) {
                        buckets.set(key, {
                            prefabId: rule.id,
                            variantIndex,
                            biomeId: bucketBiomeId,
                            tint,
                            transforms: []
                        })
                    }
                    buckets.get(key).transforms.push(transform)
                    break
```

- [ ] **Step 6: Run PrefabPlacer bucket tests and verify they pass**

Run: `npm test -- test/prefabPlacerBiomeTint.test.js`

Expected: PASS for the three collectTransforms tests.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/world/prefabs/PrefabPlacer.js test/prefabPlacerBiomeTint.test.js
git commit -m "feat: bucket tinted prefabs by biome"
```

## Task 4: Build Integration And Cleanup

**Files:**
- Modify: `src/world/prefabs/PrefabPlacer.js`
- Modify: `test/prefabPlacerBiomeTint.test.js`

- [ ] **Step 1: Add build and cleanup tests**

Append these tests to `test/prefabPlacerBiomeTint.test.js`:

```js
test('buildVariantInstances applies tint clones to instanced meshes', () => {
  const sourceMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  const sourceScene = new THREE.Group()
  sourceScene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMaterial))
  const placer = createPlacer({ manifest: {}, biomes: {}, width: 1, depth: 1 })

  const group = placer.buildVariantInstances(
    sourceScene,
    [{ position: [0, 0, 0], rotationY: 0 }],
    {},
    { color: '#000000', strength: 1 }
  )

  const mesh = group.children[0]
  assert.equal(mesh.isInstancedMesh, true)
  assert.notEqual(mesh.material, sourceMaterial)
  assert.equal(mesh.material.userData.isBiomeTintClone, true)
  assert.equal(mesh.material.color.getHexString(), '000000')
})

test('buildVariantInstances preserves untinted source material', () => {
  const sourceMaterial = new THREE.MeshBasicMaterial({ color: '#808080' })
  const sourceScene = new THREE.Group()
  sourceScene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMaterial))
  const placer = createPlacer({ manifest: {}, biomes: {}, width: 1, depth: 1 })

  const group = placer.buildVariantInstances(
    sourceScene,
    [{ position: [0, 0, 0], rotationY: 0 }],
    {},
    null
  )

  assert.equal(group.children[0].material, sourceMaterial)
})

test('buildVariantInstances preserves material array order when tinting', () => {
  const first = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  const second = new THREE.MeshBasicMaterial({ color: '#808080' })
  const sourceScene = new THREE.Group()
  sourceScene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [first, second]))
  const placer = createPlacer({ manifest: {}, biomes: {}, width: 1, depth: 1 })

  const group = placer.buildVariantInstances(
    sourceScene,
    [{ position: [0, 0, 0], rotationY: 0 }],
    {},
    { color: '#000000', strength: 1 }
  )

  assert.equal(Array.isArray(group.children[0].material), true)
  assert.equal(group.children[0].material.length, 2)
  assert.notEqual(group.children[0].material[0], first)
  assert.notEqual(group.children[0].material[1], second)
})

test('clearInstances disposes tinted material clones without disposing textures', () => {
  const texture = new THREE.Texture()
  const material = new THREE.MeshBasicMaterial({ map: texture })
  let materialDisposed = false
  let textureDisposed = false
  material.userData.isBiomeTintClone = true
  material.dispose = () => {
    materialDisposed = true
  }
  texture.dispose = () => {
    textureDisposed = true
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, 1)
  const placer = createPlacer({ manifest: {}, biomes: {}, width: 1, depth: 1 })
  placer.group.add(mesh)

  placer.clearInstances()

  assert.equal(materialDisposed, true)
  assert.equal(textureDisposed, false)
  assert.equal(placer.group.children.length, 0)
})
```

- [ ] **Step 2: Run PrefabPlacer integration tests and verify they fail**

Run: `npm test -- test/prefabPlacerBiomeTint.test.js`

Expected: FAIL because `buildVariantInstances()` still accepts only `sourceScene, transforms` and does not dispose cloned materials.

- [ ] **Step 3: Update buildVariantInstances signature and material resolution**

Replace the function declaration and mesh creation inside `src/world/prefabs/PrefabPlacer.js`:

```js
    buildVariantInstances(sourceScene, transforms, prefabEntry, tint) {
        sourceScene.updateMatrixWorld(true)

        const variantGroup = new THREE.Group()
        const instanceMatrix = new THREE.Matrix4()
        const composed = new THREE.Matrix4()
        const position = new THREE.Vector3()
        const quaternion = new THREE.Quaternion()
        const unitScale = new THREE.Vector3(1, 1, 1)
        const yAxis = new THREE.Vector3(0, 1, 0)

        sourceScene.traverse((child) => {
            if (!child.isMesh) {
                return
            }

            const material = resolvePrefabMaterial(child.material, tint)
            const mesh = new THREE.InstancedMesh(child.geometry, material, transforms.length)
            mesh.castShadow = true
            mesh.receiveShadow = true
            transforms.forEach((t, i) => {
                position.fromArray(t.position)
                quaternion.setFromAxisAngle(yAxis, t.rotationY)
                instanceMatrix.compose(position, quaternion, unitScale)
                composed.multiplyMatrices(instanceMatrix, child.matrixWorld)
                mesh.setMatrixAt(i, composed)
            })
            mesh.instanceMatrix.needsUpdate = true
            variantGroup.add(mesh)
        })

        return variantGroup
    }
```

The `prefabEntry` parameter is accepted for call-site clarity and future extension, even though the first implementation uses `tint` directly.

- [ ] **Step 4: Update clearInstances to dispose tinted material clones**

Replace the inner `child.traverse()` block in `clearInstances()`:

```js
            child.traverse((node) => {
                if (node.isInstancedMesh) {
                    disposeBiomeTintMaterial(node.material)
                    node.dispose()
                }
            })
```

- [ ] **Step 5: Run PrefabPlacer integration tests and verify they pass**

Run: `npm test -- test/prefabPlacerBiomeTint.test.js`

Expected: PASS for all PrefabPlacer biome tint tests.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/world/prefabs/PrefabPlacer.js test/prefabPlacerBiomeTint.test.js
git commit -m "feat: apply prefab biome tint materials"
```

## Task 5: Full Verification

**Files:**
- No planned source edits.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: Vite build completes without errors.

- [ ] **Step 3: Start the local app for manual inspection**

Run: `npm run dev -- --host 127.0.0.1`

Expected: Vite prints a local URL. Open it and inspect:

- `commonRock` has different tint in forest, autumn forest, desert, and volcano.
- `landGrass` has different tint in forest, autumn forest, and desert.
- Mushrooms, flowers, water plants, trees, and other untinted prefabs look unchanged.
- Rebuilding or refreshing the world does not produce visible material loss.

- [ ] **Step 4: Final status check**

Run: `git status --short`

Expected: no uncommitted implementation changes.
