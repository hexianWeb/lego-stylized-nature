# Water Noise Color Mix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace depth-bucket animated water with one static noise-textured instanced mesh that mixes three water colors.

**Architecture:** Load `noise.jpg` as a non-color repeating texture, sample it once from world-space XZ coordinates, and use the grayscale value to mix dark, middle, and light water colors. Restore `WaterBrickRenderer` to one reusable `InstancedMesh`, remove depth classification and ripple code, and retain only four useful debug controls.

**Tech Stack:** JavaScript, Three.js WebGPU 0.183, TSL, Node.js test runner, Tweakpane, Vite.

---

## File Structure

- Add `public/texture/noise.jpg`: user-provided grayscale Voronoi noise texture.
- Modify `src/assets/sources.js`: register `waterNoiseTexture`.
- Modify `src/materials/tsl/waterMaterial.js`: one static texture sample and three-color mix.
- Modify `src/world/bricks/WaterBrickRenderer.js`: restore one reusable water mesh.
- Delete `src/world/bricks/waterDepth.js`: remove obsolete depth classification.
- Modify `src/world/WorldConfig.js`: replace depth and ripple parameters with color and texture controls.
- Modify `src/debug/panels/MaterialPanel.js`: expose one water material and four controls.
- Modify `src/world/world.js`: pass the loaded noise texture into the renderer.
- Replace `test/waterRendering.test.js`: retain only two focused behavior tests.

### Task 1: Replace Water Material With Static Noise Color Mix

**Files:**
- Modify: `src/materials/tsl/waterMaterial.js`
- Replace: `test/waterRendering.test.js`

- [ ] **Step 1: Replace old water tests with one failing material test**

Replace `test/waterRendering.test.js` with:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { createWaterMaterial } from '../src/materials/tsl/waterMaterial.js'

test('creates static noise-mixed water material with a plain-color fallback', () => {
  const noiseTexture = new THREE.Texture()
  const config = {
    darkColor: '#0757A6',
    midColor: '#168FD2',
    lightColor: '#42DDEB',
    textureScale: 0.45,
    roughness: 0.3,
    clearcoat: 0.45,
    clearcoatRoughness: 0.2
  }

  const texturedMaterial = createWaterMaterial(config, noiseTexture)
  const fallbackMaterial = createWaterMaterial(config)

  assert.ok(texturedMaterial instanceof THREE.MeshPhysicalNodeMaterial)
  assert.equal(noiseTexture.wrapS, THREE.RepeatWrapping)
  assert.equal(noiseTexture.wrapT, THREE.RepeatWrapping)
  assert.equal(noiseTexture.colorSpace, THREE.NoColorSpace)
  assert.ok(noiseTexture.version > 0)
  assert.ok(texturedMaterial.colorNode)
  assert.equal(texturedMaterial.userData.uniforms.uTextureScale.value, 0.45)
  assert.equal(texturedMaterial.userData.waterNoiseTexture, noiseTexture)
  assert.ok(fallbackMaterial.colorNode)
  assert.deepEqual(fallbackMaterial.userData.uniforms, {})
  assert.equal(texturedMaterial.transparent, false)
  assert.equal(texturedMaterial.opacity, 1)
  assert.equal(texturedMaterial.metalness, 0)
})
```

This single test covers both texture setup and the missing-texture fallback. Do not retain the old depth, ripple, or zero-value test cases.

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
& 'C:\Users\hx238\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test test/waterRendering.test.js
```

Expected: FAIL because the current material exposes ripple uniforms and does not store/configure `waterNoiseTexture`.

- [ ] **Step 3: Implement the static three-color material**

Replace `src/materials/tsl/waterMaterial.js` with:

```js
import * as THREE from 'three/webgpu'
import {
  color,
  mix,
  positionWorld,
  step,
  texture,
  uniform
} from 'three/tsl'

function configureWaterNoiseTexture(waterNoiseTexture) {
  waterNoiseTexture.wrapS = THREE.RepeatWrapping
  waterNoiseTexture.wrapT = THREE.RepeatWrapping
  waterNoiseTexture.colorSpace = THREE.NoColorSpace
  waterNoiseTexture.needsUpdate = true
}

export function createWaterMaterial(waterConfig = {}, waterNoiseTexture = null) {
  const material = new THREE.MeshPhysicalNodeMaterial()
  const darkColor = color(waterConfig.darkColor ?? '#0757A6')
  const midColor = color(waterConfig.midColor ?? '#168FD2')
  const lightColor = color(waterConfig.lightColor ?? '#42DDEB')

  material.userData.uniforms = {}

  if (waterNoiseTexture) {
    configureWaterNoiseTexture(waterNoiseTexture)

    const uTextureScale = uniform(waterConfig.textureScale ?? 0.45)
    const noiseValue = texture(
      waterNoiseTexture,
      positionWorld.xz.mul(uTextureScale)
    ).r
    const darkToMid = mix(darkColor, midColor, noiseValue.mul(2))
    const midToLight = mix(
      midColor,
      lightColor,
      noiseValue.sub(0.5).mul(2)
    )

    material.colorNode = mix(
      darkToMid,
      midToLight,
      step(0.5, noiseValue)
    )
    material.userData.uniforms.uTextureScale = uTextureScale
    material.userData.waterNoiseTexture = waterNoiseTexture
  } else {
    material.colorNode = midColor
  }

  material.roughness = waterConfig.roughness ?? 0.3
  material.metalness = 0
  material.clearcoat = waterConfig.clearcoat ?? 0.45
  material.clearcoatRoughness = waterConfig.clearcoatRoughness ?? 0.2
  material.opacity = 1
  material.transparent = false

  return material
}
```

Keep the shader deliberately simple:

- One texture sample.
- Two color mixes.
- One step selecting the lower or upper range.
- No `time`, sine waves, procedural noise, highlights, or extra texture samples.

- [ ] **Step 4: Run the focused material test**

Run:

```powershell
& 'C:\Users\hx238\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test test/waterRendering.test.js
```

Expected: 1 test passes.

- [ ] **Step 5: Commit the material simplification**

```powershell
git add src/materials/tsl/waterMaterial.js test/waterRendering.test.js
git commit -m "feat: mix static water colors from noise"
```

### Task 2: Restore One Reusable Water Mesh

**Files:**
- Modify: `src/world/bricks/WaterBrickRenderer.js`
- Delete: `src/world/bricks/waterDepth.js`
- Modify: `test/waterRendering.test.js`

- [ ] **Step 1: Add one failing renderer lifecycle test**

Append to `test/waterRendering.test.js`:

```js
import WaterBrickRenderer from '../src/world/bricks/WaterBrickRenderer.js'

test('maintains one reusable water mesh and disposes owned resources', () => {
  const renderer = new WaterBrickRenderer({
    config: {
      terrain: {
        width: 3,
        depth: 1,
        cellSize: 0.2,
        layerHeight: 1,
        waterLevel: 4
      },
      water: {}
    },
    brickGeometry: new THREE.BoxGeometry(1, 1, 1),
    waterNoiseTexture: new THREE.Texture()
  })
  let cells = [
    { isWater: true },
    { isWater: true },
    { isWater: false }
  ]
  const terrainMap = {
    getSurfaceCell(x) {
      return cells[x]
    }
  }

  renderer.build(terrainMap)
  const firstMesh = renderer.mesh

  assert.equal(renderer.group.children.length, 1)
  assert.equal(renderer.mesh.name, 'WaterBrickInstances')
  assert.equal(renderer.mesh.count, 2)

  cells = [
    { isWater: true },
    { isWater: false },
    { isWater: false }
  ]
  renderer.build(terrainMap)

  assert.equal(renderer.mesh, firstMesh)
  assert.equal(renderer.group.children.length, 1)
  assert.equal(renderer.mesh.count, 1)

  let materialDisposed = false
  renderer.material.dispose = () => {
    materialDisposed = true
  }
  renderer.dispose()

  assert.equal(materialDisposed, true)
  assert.equal(renderer.mesh, null)
  assert.equal(renderer.capacity, 0)
  assert.equal(renderer.group.children.length, 0)
})
```

This is the only renderer test. It covers the one-mesh invariant, capacity reuse, count updates, and disposal.

- [ ] **Step 2: Run the focused tests and verify the new test fails**

Run:

```powershell
& 'C:\Users\hx238\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test test/waterRendering.test.js
```

Expected: material test passes; renderer test fails because the current renderer exposes `buckets` instead of `mesh`.

- [ ] **Step 3: Restore the single-mesh renderer**

Replace `src/world/bricks/WaterBrickRenderer.js` with:

```js
import * as THREE from 'three/webgpu'
import { createWaterMaterial } from '../../materials/tsl/waterMaterial.js'

export default class WaterBrickRenderer {
  constructor({
    config,
    brickGeometry,
    waterNoiseTexture = null
  }) {
    this.config = config
    this.brickGeometry = brickGeometry
    this.material = createWaterMaterial(config.water, waterNoiseTexture)
    this.group = new THREE.Group()
    this.group.name = 'WaterBricks'
    this.mesh = null
    this.capacity = 0
  }

  build(terrainMap) {
    const { width, depth, cellSize, layerHeight, waterLevel } =
      this.config.terrain
    const cells = []

    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        if (terrainMap.getSurfaceCell(x, z).isWater) {
          cells.push({ x, z })
        }
      }
    }

    if (!this.mesh || cells.length > this.capacity) {
      this.mesh?.dispose()
      if (this.mesh) {
        this.group.remove(this.mesh)
      }

      this.capacity = Math.ceil(Math.max(cells.length, 1) * 1.2)
      this.mesh = new THREE.InstancedMesh(
        this.brickGeometry,
        this.material,
        this.capacity
      )
      this.mesh.name = 'WaterBrickInstances'
      this.mesh.castShadow = true
      this.mesh.receiveShadow = true
      this.group.add(this.mesh)
    }

    const matrix = new THREE.Matrix4()
    cells.forEach((cell, index) => {
      matrix.setPosition(
        (cell.x + 0.5) * cellSize,
        waterLevel * layerHeight,
        (cell.z + 0.5) * cellSize
      )
      this.mesh.setMatrixAt(index, matrix)
    })

    this.mesh.count = cells.length
    this.mesh.instanceMatrix.needsUpdate = cells.length > 0

    return this.group
  }

  dispose() {
    this.mesh?.dispose()
    this.material.dispose()
    this.group.parent?.remove(this.group)
    this.group.clear()
    this.mesh = null
    this.capacity = 0
  }
}
```

- [ ] **Step 4: Delete obsolete depth classification**

Delete:

```text
src/world/bricks/waterDepth.js
```

Confirm there are no remaining imports:

```powershell
rg -n "waterDepth|WATER_BUCKETS|classifyWaterDepth|WaterShallowInstances|WaterTransitionInstances|WaterDeepInstances" src test
```

Expected: no matches.

- [ ] **Step 5: Run the two focused tests**

Run:

```powershell
& 'C:\Users\hx238\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test test/waterRendering.test.js
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit the single-mesh renderer**

```powershell
git add src/world/bricks/WaterBrickRenderer.js src/world/bricks/waterDepth.js test/waterRendering.test.js
git commit -m "refactor: restore single-mesh water rendering"
```

### Task 3: Integrate the Texture and Remove Obsolete Controls

**Files:**
- Add: `public/texture/noise.jpg`
- Modify: `src/assets/sources.js`
- Modify: `src/world/WorldConfig.js`
- Modify: `src/debug/panels/MaterialPanel.js`
- Modify: `src/world/world.js`

- [ ] **Step 1: Copy the user-provided texture into the feature worktree**

The texture currently exists in the main checkout at:

```text
D:\workplace\three.js-tsl-template\public\texture\noise.jpg
```

Copy it to:

```text
D:\workplace\three.js-tsl-template\.worktrees\water-depth-detail\public\texture\noise.jpg
```

Use a binary-safe filesystem copy. Do not re-encode or resize the image.

Verify:

```powershell
Get-FileHash 'D:\workplace\three.js-tsl-template\public\texture\noise.jpg'
Get-FileHash 'public\texture\noise.jpg'
```

Expected: both SHA-256 hashes match.

- [ ] **Step 2: Register the texture resource**

In `src/assets/sources.js`, add immediately after `lavaNoiseTexture`:

```js
  { name: 'waterNoiseTexture', type: 'texture', path: 'texture/noise.jpg' },
```

- [ ] **Step 3: Replace water configuration**

Replace the `water` block in `src/world/WorldConfig.js` with:

```js
  water: {
    darkColor: '#0757A6',
    midColor: '#168FD2',
    lightColor: '#42DDEB',
    textureScale: 0.45,
    roughness: 0.3,
    clearcoat: 0.45,
    clearcoatRoughness: 0.2
  }
```

Remove all depth, ripple, detail, highlight, and opacity fields.

- [ ] **Step 4: Pass the loaded texture into the renderer**

Update construction in `src/world/world.js`:

```js
            this.waterBrickRenderer = new WaterBrickRenderer({
                config: this.config,
                brickGeometry: this.brickGeometry,
                waterNoiseTexture: resources.items.waterNoiseTexture
            })
```

Update the material panel call:

```js
        createMaterialPanel(debug, this.config, {
            legoMaterial: this.terrainBrickRenderer?.material,
            waterMaterial: this.waterBrickRenderer?.material
        })
```

- [ ] **Step 5: Simplify water debug controls**

Change the `createMaterialPanel()` signature:

```js
export function createMaterialPanel(
    debug,
    config,
    { legoMaterial, waterMaterial }
) {
```

Replace the current `waterMaterials` block with:

```js
    if (waterMaterial) {
        const waterFolder = folder.addFolder({
            title: 'Water',
            expanded: true
        })
        const waterConfig = config.water

        waterFolder
            .addBinding(waterConfig, 'textureScale', {
                min: 0.05,
                max: 2,
                step: 0.01,
                label: 'textureScale'
            })
            .on('change', ({ value }) => {
                const uniform =
                    waterMaterial.userData.uniforms.uTextureScale
                if (uniform) {
                    uniform.value = value
                }
            })

        for (const key of [
            'roughness',
            'clearcoat',
            'clearcoatRoughness'
        ]) {
            waterFolder
                .addBinding(waterConfig, key, {
                    min: 0,
                    max: 1,
                    step: 0.01,
                    label: key
                })
                .on('change', ({ value }) => {
                    waterMaterial[key] = value
                })
        }
    }
```

Do not add automated tests for these direct configuration bindings.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
& 'C:\Users\hx238\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test test/waterRendering.test.js
```

Expected: 2 tests pass.

- [ ] **Step 7: Run the complete test suite**

Run:

```powershell
& 'C:\Users\hx238\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test
```

Expected:

- New water tests pass.
- No new failures are introduced.
- The two known unrelated failures remain in `test/prefabInstanceColorConfig.test.js`:
  - Flower red palette expected `#c9110e`, actual `#ff0000`.
  - Mushroom source weight expected `1`, actual `0.5`.

- [ ] **Step 8: Run production build**

Run:

```powershell
$env:PATH = 'C:\Users\hx238\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH
& 'D:\workplace\three.js-tsl-template\node_modules\.bin\vite.cmd' build
```

Expected: Vite build succeeds without TSL compilation errors. The existing large-chunk warning is acceptable.

- [ ] **Step 9: Commit integration and cleanup**

```powershell
git add public/texture/noise.jpg src/assets/sources.js src/world/WorldConfig.js src/debug/panels/MaterialPanel.js src/world/world.js
git commit -m "feat: integrate static water noise texture"
```

### Task 4: Visual and Structural Verification

**Files:**
- Modify only if visual verification reveals a defect in files already listed.

- [ ] **Step 1: Start the local preview**

Run:

```powershell
& 'C:\Users\hx238\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' `
  'D:\workplace\three.js-tsl-template\node_modules\vite\bin\vite.js' `
  --host 127.0.0.1 `
  --port 5178
```

Expected: Vite serves `http://127.0.0.1:5178/`.

- [ ] **Step 2: Inspect the main scene**

Verify:

- Water shows broad irregular patches of dark blue, middle blue, and cyan.
- There is no animated ripple movement.
- Color regions are not derived from water depth.
- Noise does not appear excessively tiled.
- Water remains opaque and glossy.

- [ ] **Step 3: Inspect debug controls**

Open:

```text
http://127.0.0.1:5178/#debug
```

Verify:

- `textureScale` changes patch size.
- `roughness`, `clearcoat`, and `clearcoatRoughness` update the single water material.
- No ripple, detail, highlight, or depth controls remain.

- [ ] **Step 4: Verify the one-mesh invariant**

Inspect `WaterBricks` and confirm:

- It contains exactly one child mesh when water exists.
- The child is named `WaterBrickInstances`.
- Regenerating terrain does not create duplicate water meshes.

- [ ] **Step 5: Run final automated verification**

Run:

```powershell
& 'C:\Users\hx238\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test test/waterRendering.test.js
$env:PATH = 'C:\Users\hx238\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH
& 'D:\workplace\three.js-tsl-template\node_modules\.bin\vite.cmd' build
git diff --check
git status --short
```

Expected:

- 2 focused water tests pass.
- Build succeeds.
- `git diff --check` reports no errors.
- Worktree contains only intended changes, or is clean after commits.

- [ ] **Step 6: Commit visual tuning only if needed**

If visual inspection requires changing only colors or `textureScale`:

```powershell
git add src/world/WorldConfig.js
git commit -m "fix: tune static water color patches"
```

If no tuning is required, skip this commit.
