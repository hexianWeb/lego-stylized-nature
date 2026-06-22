# Water Depth Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace uniform water bricks with three depth-derived color buckets and synchronized medium-strength TSL ripple highlights.

**Architecture:** Keep water classification on the CPU during terrain rebuilds and water animation on the GPU. `WaterBrickRenderer` owns up to three instanced meshes and materials, while a pure classifier defines bucket boundaries and `createWaterMaterial()` builds the shared node graph with per-bucket base colors.

**Tech Stack:** JavaScript, Three.js WebGPU 0.183, TSL, Node.js test runner, Tweakpane, Vite.

---

## File Structure

- Create `src/world/bricks/waterDepth.js`: pure depth bucket classification with normalized thresholds.
- Create `test/waterRendering.test.js`: material, classifier, renderer lifecycle, and debug binding tests.
- Modify `src/materials/tsl/waterMaterial.js`: physical node material and animated ripple uniforms.
- Modify `src/world/bricks/WaterBrickRenderer.js`: three reusable instanced buckets.
- Modify `src/world/WorldConfig.js`: water colors, thresholds, animation, and physical defaults.
- Modify `src/debug/panels/MaterialPanel.js`: synchronized water controls.
- Modify `src/world/world.js`: pass water materials to the material panel.

### Task 1: Add Water Depth Classification

**Files:**
- Create: `src/world/bricks/waterDepth.js`
- Create: `test/waterRendering.test.js`

- [ ] **Step 1: Write failing classifier tests**

Create `test/waterRendering.test.js` with:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyWaterDepth } from '../src/world/bricks/waterDepth.js'

test('classifies inclusive shallow and transition depth boundaries', () => {
  const waterConfig = { shallowMaxDepth: 1, transitionMaxDepth: 3 }

  assert.equal(classifyWaterDepth(0, waterConfig), 'shallow')
  assert.equal(classifyWaterDepth(1, waterConfig), 'shallow')
  assert.equal(classifyWaterDepth(2, waterConfig), 'transition')
  assert.equal(classifyWaterDepth(3, waterConfig), 'transition')
  assert.equal(classifyWaterDepth(4, waterConfig), 'deep')
})

test('normalizes transition depth so it cannot be below shallow depth', () => {
  const waterConfig = { shallowMaxDepth: 3, transitionMaxDepth: 1 }

  assert.equal(classifyWaterDepth(3, waterConfig), 'shallow')
  assert.equal(classifyWaterDepth(3.1, waterConfig), 'deep')
})

test('uses stable defaults when water thresholds are omitted', () => {
  assert.equal(classifyWaterDepth(1, {}), 'shallow')
  assert.equal(classifyWaterDepth(2, {}), 'transition')
  assert.equal(classifyWaterDepth(4, {}), 'deep')
})
```

- [ ] **Step 2: Run the classifier tests and verify failure**

Run:

```powershell
npm test -- test/waterRendering.test.js
```

Expected: FAIL with module-not-found for `src/world/bricks/waterDepth.js`.

- [ ] **Step 3: Implement the pure classifier**

Create `src/world/bricks/waterDepth.js`:

```js
export const WATER_BUCKETS = ['shallow', 'transition', 'deep']

export function classifyWaterDepth(depth, waterConfig = {}) {
  const shallowMaxDepth = waterConfig.shallowMaxDepth ?? 1
  const transitionMaxDepth = Math.max(
    shallowMaxDepth,
    waterConfig.transitionMaxDepth ?? 3
  )

  if (depth <= shallowMaxDepth) {
    return 'shallow'
  }
  if (depth <= transitionMaxDepth) {
    return 'transition'
  }
  return 'deep'
}
```

- [ ] **Step 4: Run the classifier tests**

Run:

```powershell
npm test -- test/waterRendering.test.js
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit the classifier**

```powershell
git add src/world/bricks/waterDepth.js test/waterRendering.test.js
git commit -m "test: define water depth buckets"
```

### Task 2: Build the Animated Physical Water Material

**Files:**
- Modify: `src/materials/tsl/waterMaterial.js`
- Modify: `test/waterRendering.test.js`

- [ ] **Step 1: Add failing material tests**

Append to `test/waterRendering.test.js`:

```js
import * as THREE from 'three/webgpu'
import { createWaterMaterial } from '../src/materials/tsl/waterMaterial.js'

test('creates physical water material with animated detail uniforms', () => {
  const material = createWaterMaterial({
    shallowColor: '#42DDEB',
    rippleSpeed: 0.8,
    rippleStrength: 0.15,
    roughness: 0.25,
    clearcoat: 0.5,
    clearcoatRoughness: 0.18
  }, '#42DDEB')

  assert.ok(material instanceof THREE.MeshPhysicalNodeMaterial)
  assert.ok(material.colorNode)
  assert.equal(material.roughness, 0.25)
  assert.equal(material.metalness, 0)
  assert.equal(material.clearcoat, 0.5)
  assert.equal(material.clearcoatRoughness, 0.18)
  assert.equal(material.transparent, false)
  assert.equal(material.opacity, 1)
  assert.ok(material.userData.uniforms.uRippleSpeed)
  assert.ok(material.userData.uniforms.uRippleScale)
  assert.ok(material.userData.uniforms.uRippleStrength)
  assert.ok(material.userData.uniforms.uDetailScale)
  assert.ok(material.userData.uniforms.uDetailStrength)
  assert.ok(material.userData.uniforms.uHighlightStrength)
})

test('preserves explicit zero values in water material config', () => {
  const material = createWaterMaterial({
    rippleSpeed: 0,
    rippleStrength: 0,
    detailStrength: 0,
    highlightStrength: 0,
    roughness: 0,
    clearcoat: 0,
    clearcoatRoughness: 0
  }, '#000000')

  assert.equal(material.roughness, 0)
  assert.equal(material.clearcoat, 0)
  assert.equal(material.clearcoatRoughness, 0)
  assert.equal(material.userData.uniforms.uRippleSpeed.value, 0)
  assert.equal(material.userData.uniforms.uRippleStrength.value, 0)
  assert.equal(material.userData.uniforms.uDetailStrength.value, 0)
  assert.equal(material.userData.uniforms.uHighlightStrength.value, 0)
})
```

- [ ] **Step 2: Run material tests and verify failure**

Run:

```powershell
npm test -- test/waterRendering.test.js
```

Expected: FAIL because the current factory returns `MeshStandardNodeMaterial` and does not expose ripple uniforms.

- [ ] **Step 3: Implement the TSL material**

Replace `src/materials/tsl/waterMaterial.js` with:

```js
import * as THREE from 'three/webgpu'
import {
  color,
  mix,
  positionWorld,
  sin,
  smoothstep,
  time,
  uniform
} from 'three/tsl'

export function createWaterMaterial(waterConfig = {}, baseColor = null) {
  const material = new THREE.MeshPhysicalNodeMaterial()

  const uRippleSpeed = uniform(waterConfig.rippleSpeed ?? 0.75)
  const uRippleScale = uniform(waterConfig.rippleScale ?? 7)
  const uRippleStrength = uniform(waterConfig.rippleStrength ?? 0.12)
  const uDetailScale = uniform(waterConfig.detailScale ?? 18)
  const uDetailStrength = uniform(waterConfig.detailStrength ?? 0.035)
  const uHighlightStrength = uniform(waterConfig.highlightStrength ?? 0.24)

  const phase = time.mul(uRippleSpeed)
  const primary = sin(
    positionWorld.x.mul(uRippleScale)
      .add(positionWorld.z.mul(uRippleScale.mul(0.62)))
      .add(phase)
  ).mul(0.5).add(0.5)
  const crossing = sin(
    positionWorld.x.mul(uRippleScale.mul(-0.48))
      .add(positionWorld.z.mul(uRippleScale.mul(0.87)))
      .sub(phase.mul(1.17))
  ).mul(0.5).add(0.5)
  const detail = sin(
    positionWorld.x.mul(uDetailScale)
      .add(positionWorld.z.mul(uDetailScale.mul(-0.73)))
      .add(phase.mul(1.9))
  ).mul(0.5).add(0.5)

  const broadRipple = primary.mul(0.58).add(crossing.mul(0.42))
  const rippleBrightness = broadRipple.sub(0.5).mul(uRippleStrength)
  const highlightMask = smoothstep(0.68, 0.9, broadRipple)
    .add(detail.mul(uDetailStrength))
    .mul(uHighlightStrength)

  const resolvedBaseColor = baseColor ?? waterConfig.transitionColor ?? waterConfig.color ?? '#168FD2'
  const base = color(resolvedBaseColor)
  const brightened = base.add(rippleBrightness)
  material.colorNode = mix(
    brightened,
    color(waterConfig.highlightColor ?? '#BDF8FF'),
    highlightMask
  )

  material.roughness = waterConfig.roughness ?? 0.3
  material.metalness = 0
  material.clearcoat = waterConfig.clearcoat ?? 0.45
  material.clearcoatRoughness = waterConfig.clearcoatRoughness ?? 0.2
  material.opacity = 1
  material.transparent = false
  material.userData.uniforms = {
    uRippleSpeed,
    uRippleScale,
    uRippleStrength,
    uDetailScale,
    uDetailStrength,
    uHighlightStrength
  }

  return material
}
```

- [ ] **Step 4: Run material tests**

Run:

```powershell
npm test -- test/waterRendering.test.js
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit the water material**

```powershell
git add src/materials/tsl/waterMaterial.js test/waterRendering.test.js
git commit -m "feat: add animated physical water material"
```

### Task 3: Refactor Water Rendering Into Three Reusable Buckets

**Files:**
- Modify: `src/world/bricks/WaterBrickRenderer.js`
- Modify: `test/waterRendering.test.js`

- [ ] **Step 1: Add failing renderer tests**

Append to `test/waterRendering.test.js`:

```js
import WaterBrickRenderer from '../src/world/bricks/WaterBrickRenderer.js'

function createWaterRenderer() {
  return new WaterBrickRenderer({
    config: {
      terrain: {
        width: 4,
        depth: 1,
        cellSize: 0.2,
        layerHeight: 1,
        waterLevel: 4
      },
      water: {
        shallowMaxDepth: 1,
        transitionMaxDepth: 3,
        shallowColor: '#42DDEB',
        transitionColor: '#168FD2',
        deepColor: '#0757A6'
      }
    },
    brickGeometry: new THREE.BoxGeometry(1, 1, 1)
  })
}

test('builds water cells into shallow transition and deep buckets', () => {
  const renderer = createWaterRenderer()
  const cells = [
    { height: 3, isWater: true },
    { height: 2, isWater: true },
    { height: 0, isWater: true },
    { height: 4, isWater: false }
  ]
  const terrainMap = {
    getSurfaceCell(x) {
      return cells[x]
    }
  }

  renderer.build(terrainMap)

  assert.equal(renderer.buckets.shallow.mesh.count, 1)
  assert.equal(renderer.buckets.transition.mesh.count, 1)
  assert.equal(renderer.buckets.deep.mesh.count, 1)
  assert.equal(renderer.group.children.length, 3)

  renderer.dispose()
})

test('reuses bucket meshes and hides buckets emptied by rebuild', () => {
  const renderer = createWaterRenderer()
  let cells = [
    { height: 3, isWater: true },
    { height: 2, isWater: true },
    { height: 0, isWater: true },
    { height: 4, isWater: false }
  ]
  const terrainMap = {
    getSurfaceCell(x) {
      return cells[x]
    }
  }

  renderer.build(terrainMap)
  const shallowMesh = renderer.buckets.shallow.mesh
  const transitionMesh = renderer.buckets.transition.mesh

  cells = [
    { height: 3, isWater: true },
    { height: 4, isWater: false },
    { height: 4, isWater: false },
    { height: 4, isWater: false }
  ]
  renderer.build(terrainMap)

  assert.equal(renderer.buckets.shallow.mesh, shallowMesh)
  assert.equal(renderer.buckets.transition.mesh, transitionMesh)
  assert.equal(renderer.buckets.shallow.mesh.count, 1)
  assert.equal(renderer.buckets.transition.mesh.count, 0)
  assert.equal(renderer.buckets.deep.mesh.count, 0)

  renderer.dispose()
})

test('disposes all water bucket materials and clears owned meshes', () => {
  const renderer = createWaterRenderer()
  const disposed = []
  for (const [name, bucket] of Object.entries(renderer.buckets)) {
    bucket.material.dispose = () => disposed.push(name)
  }
  const terrainMap = {
    getSurfaceCell(x) {
      return { height: 3 - x, isWater: x < 3 }
    }
  }

  renderer.build(terrainMap)
  renderer.dispose()

  assert.deepEqual(disposed.sort(), ['deep', 'shallow', 'transition'])
  assert.equal(renderer.group.children.length, 0)
  for (const bucket of Object.values(renderer.buckets)) {
    assert.equal(bucket.mesh, null)
    assert.equal(bucket.capacity, 0)
  }
})
```

- [ ] **Step 2: Run renderer tests and verify failure**

Run:

```powershell
npm test -- test/waterRendering.test.js
```

Expected: FAIL because `renderer.buckets` does not exist.

- [ ] **Step 3: Implement bucketed renderer**

Replace `src/world/bricks/WaterBrickRenderer.js` with:

```js
import * as THREE from 'three/webgpu'
import { createWaterMaterial } from '../../materials/tsl/waterMaterial.js'
import { classifyWaterDepth, WATER_BUCKETS } from './waterDepth.js'

const BUCKET_SETTINGS = {
  shallow: { colorKey: 'shallowColor', meshName: 'WaterShallowInstances' },
  transition: { colorKey: 'transitionColor', meshName: 'WaterTransitionInstances' },
  deep: { colorKey: 'deepColor', meshName: 'WaterDeepInstances' }
}

export default class WaterBrickRenderer {
  constructor({ config, brickGeometry }) {
    this.config = config
    this.brickGeometry = brickGeometry
    this.group = new THREE.Group()
    this.group.name = 'WaterBricks'
    this.buckets = Object.fromEntries(
      WATER_BUCKETS.map((name) => {
        const settings = BUCKET_SETTINGS[name]
        return [name, {
          material: createWaterMaterial(
            config.water,
            config.water?.[settings.colorKey]
          ),
          mesh: null,
          capacity: 0
        }]
      })
    )
  }

  build(terrainMap) {
    const { width, depth, cellSize, layerHeight, waterLevel } = this.config.terrain
    const cellsByBucket = Object.fromEntries(WATER_BUCKETS.map((name) => [name, []]))

    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        const surfaceCell = terrainMap.getSurfaceCell(x, z)
        if (!surfaceCell.isWater) {
          continue
        }
        const bucketName = classifyWaterDepth(
          waterLevel - surfaceCell.height,
          this.config.water
        )
        cellsByBucket[bucketName].push({ x, z })
      }
    }

    for (const bucketName of WATER_BUCKETS) {
      this.updateBucket(
        bucketName,
        cellsByBucket[bucketName],
        cellSize,
        layerHeight,
        waterLevel
      )
    }

    return this.group
  }

  updateBucket(bucketName, cells, cellSize, layerHeight, waterLevel) {
    const bucket = this.buckets[bucketName]
    if (cells.length > 0 && (!bucket.mesh || cells.length > bucket.capacity)) {
      bucket.mesh?.dispose()
      if (bucket.mesh) {
        this.group.remove(bucket.mesh)
      }
      bucket.capacity = Math.ceil(Math.max(cells.length, 1) * 1.2)
      bucket.mesh = new THREE.InstancedMesh(
        this.brickGeometry,
        bucket.material,
        bucket.capacity
      )
      bucket.mesh.name = BUCKET_SETTINGS[bucketName].meshName
      bucket.mesh.castShadow = true
      bucket.mesh.receiveShadow = true
      this.group.add(bucket.mesh)
    }

    if (!bucket.mesh) {
      return
    }

    const matrix = new THREE.Matrix4()
    cells.forEach((cell, index) => {
      matrix.setPosition(
        (cell.x + 0.5) * cellSize,
        waterLevel * layerHeight,
        (cell.z + 0.5) * cellSize
      )
      bucket.mesh.setMatrixAt(index, matrix)
    })
    bucket.mesh.count = cells.length
    bucket.mesh.instanceMatrix.needsUpdate = cells.length > 0
  }

  get materials() {
    return WATER_BUCKETS.map((name) => this.buckets[name].material)
  }

  dispose() {
    for (const bucket of Object.values(this.buckets)) {
      bucket.mesh?.dispose()
      bucket.material.dispose()
      bucket.mesh = null
      bucket.capacity = 0
    }
    this.group.parent?.remove(this.group)
    this.group.clear()
  }
}
```

- [ ] **Step 4: Run renderer tests**

Run:

```powershell
npm test -- test/waterRendering.test.js
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit the bucket renderer**

```powershell
git add src/world/bricks/WaterBrickRenderer.js test/waterRendering.test.js
git commit -m "feat: render water by depth bucket"
```

### Task 4: Add Configuration and Synchronized Debug Controls

**Files:**
- Modify: `src/world/WorldConfig.js`
- Modify: `src/debug/panels/MaterialPanel.js`
- Modify: `src/world/world.js`
- Modify: `test/waterRendering.test.js`

- [ ] **Step 1: Add failing debug synchronization test**

Append to `test/waterRendering.test.js`:

```js
import { createMaterialPanel } from '../src/debug/panels/MaterialPanel.js'

function createFakeFolder(bindings) {
  return {
    addFolder() {
      return createFakeFolder(bindings)
    },
    addBinding(target, key) {
      const handlers = {}
      const binding = {
        target,
        key,
        on(event, handler) {
          handlers[event] = handler
          return binding
        },
        emit(event, value) {
          handlers[event]?.({ value })
        }
      }
      bindings.push(binding)
      return binding
    }
  }
}

test('water material panel synchronizes uniform and physical values', () => {
  const bindings = []
  const debug = {
    addFolder() {
      return createFakeFolder(bindings)
    }
  }
  const config = {
    water: {
      rippleSpeed: 0.75,
      rippleScale: 7,
      rippleStrength: 0.12,
      detailScale: 18,
      detailStrength: 0.035,
      highlightStrength: 0.24,
      roughness: 0.3,
      clearcoat: 0.45,
      clearcoatRoughness: 0.2
    }
  }
  const waterMaterials = [
    createWaterMaterial(config.water, '#42DDEB'),
    createWaterMaterial(config.water, '#168FD2'),
    createWaterMaterial(config.water, '#0757A6')
  ]

  createMaterialPanel(debug, config, { waterMaterials })
  bindings.find((binding) => binding.key === 'rippleSpeed').emit('change', 1.1)
  bindings.find((binding) => binding.key === 'roughness').emit('change', 0.4)

  for (const material of waterMaterials) {
    assert.equal(material.userData.uniforms.uRippleSpeed.value, 1.1)
    assert.equal(material.roughness, 0.4)
  }
})
```

- [ ] **Step 2: Run debug test and verify failure**

Run:

```powershell
npm test -- test/waterRendering.test.js
```

Expected: FAIL because `createMaterialPanel()` ignores `waterMaterials`.

- [ ] **Step 3: Expand water configuration**

Replace the current `water` block in `src/world/WorldConfig.js` with:

```js
  water: {
    shallowColor: '#42DDEB',
    transitionColor: '#168FD2',
    deepColor: '#0757A6',
    highlightColor: '#BDF8FF',
    shallowMaxDepth: 1,
    transitionMaxDepth: 3,
    rippleSpeed: 0.75,
    rippleScale: 7,
    rippleStrength: 0.12,
    detailScale: 18,
    detailStrength: 0.035,
    highlightStrength: 0.24,
    roughness: 0.3,
    clearcoat: 0.45,
    clearcoatRoughness: 0.2,
    opacity: 1
  }
```

- [ ] **Step 4: Implement water debug bindings**

Update `src/debug/panels/MaterialPanel.js` to accept `{ legoMaterial, waterMaterials = [] }`. After the LEGO folder block, add:

```js
    if (waterMaterials.length > 0) {
        const waterFolder = folder.addFolder({ title: 'Water', expanded: true })
        const waterConfig = config.water
        const uniformBindings = [
            ['rippleSpeed', 0, 3, 0.01, 'uRippleSpeed'],
            ['rippleScale', 0.1, 30, 0.1, 'uRippleScale'],
            ['rippleStrength', 0, 0.5, 0.005, 'uRippleStrength'],
            ['detailScale', 1, 40, 0.1, 'uDetailScale'],
            ['detailStrength', 0, 0.2, 0.005, 'uDetailStrength'],
            ['highlightStrength', 0, 0.6, 0.005, 'uHighlightStrength']
        ]

        for (const [key, min, max, step, uniformKey] of uniformBindings) {
            waterFolder
                .addBinding(waterConfig, key, { min, max, step, label: key })
                .on('change', ({ value }) => {
                    for (const material of waterMaterials) {
                        material.userData.uniforms[uniformKey].value = value
                    }
                })
        }

        const materialBindings = [
            ['roughness', 0, 1, 0.01],
            ['clearcoat', 0, 1, 0.01],
            ['clearcoatRoughness', 0, 1, 0.01]
        ]
        for (const [key, min, max, step] of materialBindings) {
            waterFolder
                .addBinding(waterConfig, key, { min, max, step, label: key })
                .on('change', ({ value }) => {
                    for (const material of waterMaterials) {
                        material[key] = value
                    }
                })
        }
    }
```

- [ ] **Step 5: Pass water materials from World**

Update the call in `src/world/world.js`:

```js
        createMaterialPanel(debug, this.config, {
            legoMaterial: this.terrainBrickRenderer?.material,
            waterMaterials: this.waterBrickRenderer?.materials ?? []
        })
```

- [ ] **Step 6: Run focused tests**

Run:

```powershell
npm test -- test/waterRendering.test.js
```

Expected: all 9 tests pass.

- [ ] **Step 7: Run the full test suite**

Run:

```powershell
npm test
```

Expected: all project tests pass.

- [ ] **Step 8: Commit configuration and debug controls**

```powershell
git add src/world/WorldConfig.js src/debug/panels/MaterialPanel.js src/world/world.js test/waterRendering.test.js
git commit -m "feat: expose water material controls"
```

### Task 5: Production and Visual Verification

**Files:**
- Modify only if verification reveals a defect in the files already listed.

- [ ] **Step 1: Run production build**

Run:

```powershell
npm run build
```

Expected: Vite build succeeds without TSL compilation errors.

- [ ] **Step 2: Start the development server**

Run:

```powershell
npm run dev -- --host 127.0.0.1
```

Expected: Vite reports a local URL and remains running.

- [ ] **Step 3: Inspect the main scene**

Open the reported URL and verify:

- Shallow, transition, and deep water are visibly distinct.
- The transition color prevents an abrupt cyan-to-blue jump.
- Ripple highlights move at medium strength without dominating terrain.
- Fine detail does not shimmer excessively.
- LEGO studs and brick silhouettes remain static.
- Debug URL `/#debug` updates all three water materials together.

- [ ] **Step 4: Check render structure**

Inspect the scene or renderer statistics and verify:

- The `WaterBricks` group contains no more than three meshes.
- Mesh names match the three documented bucket names.
- Terrain regeneration does not add duplicate water meshes.
- Water remains in the opaque render path.

- [ ] **Step 5: Run final verification**

Run:

```powershell
npm test
npm run build
git diff --check
git status --short
```

Expected:

- All tests pass.
- Production build succeeds.
- `git diff --check` prints no errors.
- Status contains only the intended implementation and plan changes, if any remain uncommitted.

- [ ] **Step 6: Commit any verification tuning**

If visual tuning changed tracked files:

```powershell
git add src/materials/tsl/waterMaterial.js src/world/WorldConfig.js
git commit -m "fix: tune stylized water detail"
```

If no tuning was required, skip this commit.

