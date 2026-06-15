# Volcano Lava Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add simple top-surface lava pools and cracks to the volcano biome, rendered as animated LEGO lava bricks with TSL.

**Architecture:** Lava is a surface flag on existing `surfaceCell` objects, not a terrain height deformation. A focused generator marks volcano cells as `pool` or `crack`, a dedicated renderer draws one lava brick layer over those cells, and prefab placement rejects lava cells. The base terrain color resolver remains responsible only for rock/soil colors.

**Tech Stack:** JavaScript ES modules, Three.js WebGPU, Three TSL, Vite, existing instanced LEGO brick renderers.

---

## File Structure

- Create `src/world/terrain/VolcanoSurfaceFeatureGenerator.js`
  - Deterministically marks `surfaceCell.isLava` and `surfaceCell.lavaType`.
  - Uses existing `random01()` and `createNoise2D()` instead of introducing new dependencies.
- Modify `src/world/terrain/TerrainGenerator.js`
  - Owns the feature generator.
  - Applies lava flags after `SurfaceClassifier.classify()` and before constructing `TerrainMap`.
- Create `src/materials/tsl/lavaMaterial.js`
  - Exports `createLavaMaterial(lavaConfig)`.
  - Implements subtle color pulse and emissive glow using TSL.
- Create `src/world/bricks/LavaBrickRenderer.js`
  - Mirrors the lifecycle style of `WaterBrickRenderer`.
  - Renders lava cells as one instanced overlay layer.
- Modify `src/world/world.js`
  - Instantiates, registers, builds, and hides the lava renderer during AO preview.
- Modify `src/world/biomes/definitions/volcano.js`
  - Adds lava tuning config under the volcano biome.
  - Removes water/forest prefabs from the volcano biome.
- Modify `src/world/prefabs/placementRules.js`
  - Rejects normal prefab placement on lava cells.

## Task 1: Generate Volcano Lava Surface Flags

**Files:**
- Create: `src/world/terrain/VolcanoSurfaceFeatureGenerator.js`
- Modify: `src/world/terrain/TerrainGenerator.js`

- [ ] **Step 1: Create the feature generator file**

Create `src/world/terrain/VolcanoSurfaceFeatureGenerator.js` with this implementation:

```js
import { createNoise2D } from 'simplex-noise'
import { mulberry32, random01 } from '../../utils/random.js'

const DEFAULT_LAVA = {
  poolDensity: 0.08,
  crackDensity: 0.05,
  minVolcanoWeight: 0.65,
  poolNoiseScale: 18,
  crackNoiseScale: 7,
  maxSlope: 4
}

export default class VolcanoSurfaceFeatureGenerator {
  constructor({ config, biomeRegistry }) {
    this.config = config
    this.biomeRegistry = biomeRegistry
    this.poolNoise = createNoise2D(mulberry32(config.seed + 3001))
    this.crackNoise = createNoise2D(mulberry32(config.seed + 7001))
  }

  apply(biomeCells, surfaceCells) {
    const { width, depth } = this.config.terrain
    const lavaConfig = this.getLavaConfig()

    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        const biomeCell = biomeCells[z][x]
        const surfaceCell = surfaceCells[z][x]

        surfaceCell.isLava = false
        surfaceCell.lavaType = null

        if (!this.canHostLava(biomeCell, surfaceCell, lavaConfig)) {
          continue
        }

        const poolValue = this.normalizedNoise(this.poolNoise, x, z, lavaConfig.poolNoiseScale)
        const crackValue = this.normalizedNoise(this.crackNoise, x, z, lavaConfig.crackNoiseScale)
        const jitter = random01(x, z, this.config.seed + 911)

        if (poolValue > 1 - lavaConfig.poolDensity) {
          surfaceCell.isLava = true
          surfaceCell.lavaType = 'pool'
        } else if (crackValue > 1 - lavaConfig.crackDensity && jitter > 0.35) {
          surfaceCell.isLava = true
          surfaceCell.lavaType = 'crack'
        }
      }
    }
  }

  getLavaConfig() {
    const volcano = this.biomeRegistry.get('volcano')
    return { ...DEFAULT_LAVA, ...(volcano.lava ?? {}) }
  }

  canHostLava(biomeCell, surfaceCell, lavaConfig) {
    const volcanoWeight = biomeCell.weights.volcano ?? 0
    return volcanoWeight >= lavaConfig.minVolcanoWeight &&
      !surfaceCell.isWater &&
      surfaceCell.slope <= lavaConfig.maxSlope
  }

  normalizedNoise(noise, x, z, scale) {
    return 0.5 + 0.5 * noise(x / scale, z / scale)
  }
}
```

- [ ] **Step 2: Integrate feature generation into terrain generation**

Modify `src/world/terrain/TerrainGenerator.js` imports:

```js
import VolcanoSurfaceFeatureGenerator from './VolcanoSurfaceFeatureGenerator.js'
```

Modify the constructor:

```js
  constructor({ config, biomeMaskGenerator, biomeBlender, biomeRegistry }) {
    this.config = config
    this.biomeMaskGenerator = biomeMaskGenerator
    this.biomeBlender = biomeBlender
    this.surfaceClassifier = new SurfaceClassifier(config)
    this.volcanoSurfaceFeatureGenerator = new VolcanoSurfaceFeatureGenerator({
      config,
      biomeRegistry
    })
  }
```

Modify `generate()`:

```js
  generate() {
    this.noise2D = createNoise2D(mulberry32(this.config.seed))
    const biomeCells = this.biomeMaskGenerator.generate()
    const heightField = this.generateHeightField(biomeCells)
    const surfaceCells = this.surfaceClassifier.classify(heightField)
    this.volcanoSurfaceFeatureGenerator.apply(biomeCells, surfaceCells)
    return new TerrainMap({ heightField, biomeCells, surfaceCells })
  }
```

Update the call site in `src/world/world.js` when constructing `TerrainGenerator`:

```js
            this.terrainGenerator = new TerrainGenerator({
                config: this.config,
                biomeMaskGenerator: this.biomeMaskGenerator,
                biomeBlender: this.biomeBlender,
                biomeRegistry: this.biomeRegistry
            })
```

- [ ] **Step 3: Run build after generation integration**

Run: `npm run build`

Expected: build succeeds. If it fails with a constructor argument or import error, fix only the files listed in this task.

- [ ] **Step 4: Commit Task 1**

```bash
git add src/world/terrain/VolcanoSurfaceFeatureGenerator.js src/world/terrain/TerrainGenerator.js src/world/world.js
git commit -m "feat: mark volcano lava surface cells"
```

## Task 2: Add TSL Lava Material And Lava Renderer

**Files:**
- Create: `src/materials/tsl/lavaMaterial.js`
- Create: `src/world/bricks/LavaBrickRenderer.js`
- Modify: `src/world/world.js`

- [ ] **Step 1: Add the lava material**

Create `src/materials/tsl/lavaMaterial.js`:

```js
import * as THREE from 'three/webgpu'
import { color, mix, positionWorld, sin, time, uniform } from 'three/tsl'

export function createLavaMaterial(lavaConfig = {}) {
  const material = new THREE.MeshStandardNodeMaterial()

  const uPulseSpeed = uniform(lavaConfig.pulseSpeed ?? 1.35)
  const uGlowStrength = uniform(lavaConfig.glowStrength ?? 1.15)

  const flow = sin(
    time.mul(uPulseSpeed)
      .add(positionWorld.x.mul(5.7))
      .add(positionWorld.z.mul(4.3))
  ).mul(0.5).add(0.5)

  const ember = sin(
    time.mul(uPulseSpeed.mul(1.7))
      .add(positionWorld.x.mul(13.1))
      .add(positionWorld.z.mul(9.4))
  ).mul(0.5).add(0.5)

  const heat = flow.mul(0.7).add(ember.mul(0.3))
  const lavaColor = mix(color('#ff3b00'), color('#ffd45a'), heat)

  material.colorNode = lavaColor
  material.emissiveNode = color('#ff4a00').mul(heat.mul(uGlowStrength))
  material.roughness = lavaConfig.roughness ?? 0.34
  material.metalness = 0
  material.userData.uniforms = { uPulseSpeed, uGlowStrength }

  return material
}
```

- [ ] **Step 2: Add the lava brick renderer**

Create `src/world/bricks/LavaBrickRenderer.js`:

```js
import * as THREE from 'three/webgpu'
import { createLavaMaterial } from '../../materials/tsl/lavaMaterial.js'

export default class LavaBrickRenderer {
  constructor({ config, brickGeometry, lavaConfig = {} }) {
    this.config = config
    this.brickGeometry = brickGeometry
    this.material = createLavaMaterial(lavaConfig)
    this.group = new THREE.Group()
    this.group.name = 'LavaBricks'
    this.mesh = null
    this.capacity = 0
  }

  build(terrainMap) {
    const { width, depth, cellSize, layerHeight } = this.config.terrain

    const cells = []
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        const surfaceCell = terrainMap.getSurfaceCell(x, z)
        if (surfaceCell.isLava) {
          cells.push({ x, z, height: surfaceCell.height })
        }
      }
    }

    if (!this.mesh || cells.length > this.capacity) {
      this.mesh?.dispose()
      if (this.mesh) {
        this.group.remove(this.mesh)
      }
      this.capacity = Math.ceil(Math.max(cells.length, 1) * 1.2)
      this.mesh = new THREE.InstancedMesh(this.brickGeometry, this.material, this.capacity)
      this.mesh.name = 'LavaBrickInstances'
      this.mesh.castShadow = true
      this.mesh.receiveShadow = true
      this.group.add(this.mesh)
    }

    const matrix = new THREE.Matrix4()
    cells.forEach((cell, i) => {
      matrix.setPosition(
        (cell.x + 0.5) * cellSize,
        (cell.height + 1) * layerHeight,
        (cell.z + 0.5) * cellSize
      )
      this.mesh.setMatrixAt(i, matrix)
    })

    this.mesh.count = cells.length
    this.mesh.instanceMatrix.needsUpdate = true

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

- [ ] **Step 3: Wire the renderer into `World`**

Modify `src/world/world.js` imports:

```js
import LavaBrickRenderer from './bricks/LavaBrickRenderer.js'
```

Add a constructor field:

```js
        this.lavaBrickRenderer = null
```

Instantiate and register after `WaterBrickRenderer`:

```js
            this.lavaBrickRenderer = new LavaBrickRenderer({
                config: this.config,
                brickGeometry: this.brickGeometry,
                lavaConfig: this.biomeRegistry.get('volcano').lava
            })

            this.addSystem(this.terrainBrickRenderer)
            this.addSystem(this.waterBrickRenderer)
            this.addSystem(this.lavaBrickRenderer)
```

Build it in `regenerate()` after water:

```js
        this.waterBrickRenderer.build(this.terrainMap)
        this.lavaBrickRenderer.build(this.terrainMap)
        this.prefabPlacer?.build(this.terrainMap)
```

Hide it during AO preview:

```js
        if (this.lavaBrickRenderer?.group) {
            this.lavaBrickRenderer.group.visible = !preview
        }
```

- [ ] **Step 4: Run build after renderer integration**

Run: `npm run build`

Expected: build succeeds. If TSL `mix` import is not supported by the installed Three.js version, replace `mix(a, b, heat)` with `color('#ff3b00').mix(color('#ffd45a'), heat)` only after confirming the build error.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/materials/tsl/lavaMaterial.js src/world/bricks/LavaBrickRenderer.js src/world/world.js
git commit -m "feat: render animated lava bricks"
```

## Task 3: Clean Up Volcano Prefabs And Lava Placement Rules

**Files:**
- Modify: `src/world/biomes/definitions/volcano.js`
- Modify: `src/world/prefabs/placementRules.js`

- [ ] **Step 1: Update volcano biome config**

Replace `src/world/biomes/definitions/volcano.js` with:

```js
export default {
  id: 'volcano',
  label: 'Volcano',
  terrain: {
    heightOffset: 3,
    heightMagnitude: 1.35,
    colors: {
      surface: '#3f3f3f',
      subsurface: '#2b2420',
      deep: '#1c1c1c',
      shore: '#5a3a2c'
    }
  },
  lava: {
    poolDensity: 0.08,
    crackDensity: 0.05,
    minVolcanoWeight: 0.65,
    poolNoiseScale: 18,
    crackNoiseScale: 7,
    maxSlope: 4,
    pulseSpeed: 1.35,
    glowStrength: 1.15,
    roughness: 0.34
  },
  prefabs: [
    { id: 'commonRock', density: 0.09, minHeight: 5, maxSlope: 3 }
  ]
}
```

- [ ] **Step 2: Reject prefab placement on lava**

In `src/world/prefabs/placementRules.js`, add this check after `const placement = manifestEntry.placement ?? {}`:

```js
    if (surfaceCell.isLava) {
        return false
    }
```

- [ ] **Step 3: Run build after prefab cleanup**

Run: `npm run build`

Expected: build succeeds.

- [ ] **Step 4: Commit Task 3**

```bash
git add src/world/biomes/definitions/volcano.js src/world/prefabs/placementRules.js
git commit -m "fix: keep volcano prefabs off lava"
```

## Task 4: Visual Verification And Final Tuning

**Files:**
- Modify only if needed: `src/world/biomes/definitions/volcano.js`
- Modify only if needed: `src/materials/tsl/lavaMaterial.js`

- [ ] **Step 1: Start the Vite app**

Run: `npm run dev`

Expected: Vite prints a local URL, normally `http://localhost:5173/`.

- [ ] **Step 2: Inspect the scene from the existing orthographic camera**

Open the local URL in the in-app browser or normal browser.

Expected visual result:

- Volcano region contains visible large lava pools.
- Volcano region contains smaller crack-like lava accents.
- Lava does not appear in forest, autumn forest, or desert regions.
- Lava reads as LEGO brick overlays, not as a smooth fluid sheet.
- The pulse/glow is visible but not visually noisy.
- Grass, mushrooms, reeds, and water bubbles are absent from volcano cells.

- [ ] **Step 3: Tune only the smallest useful parameter set**

If lava is too sparse, change only these values in `src/world/biomes/definitions/volcano.js`:

```js
    poolDensity: 0.1,
    crackDensity: 0.07,
```

If lava is too noisy, change only these values:

```js
    poolDensity: 0.06,
    crackDensity: 0.03,
```

If glow is too strong, change only:

```js
    glowStrength: 0.85,
```

If glow is too weak, change only:

```js
    glowStrength: 1.35,
```

- [ ] **Step 4: Run final production build**

Run: `npm run build`

Expected: build succeeds.

- [ ] **Step 5: Commit final tuning if anything changed**

If Task 4 changed tuning values:

```bash
git add src/world/biomes/definitions/volcano.js src/materials/tsl/lavaMaterial.js
git commit -m "chore: tune volcano lava visuals"
```

If no tuning values changed, do not create an empty commit.

## Final Verification Checklist

- [ ] `npm run build` passes.
- [ ] `surfaceCell.isLava` is generated only for volcano-weighted land cells.
- [ ] Lava is rendered by `LavaBrickRenderer`, not by `BrickColorResolver`.
- [ ] AO preview hides lava overlays the same way it hides water and prefabs.
- [ ] Volcano config no longer references `landGrass`, `landMushroom`, `phragmites`, or `waterBubble`.
- [ ] `canPlacePrefab()` rejects lava cells before density checks.
- [ ] Working tree contains only intentional source changes before final handoff.

## Commit Sequence

1. `feat: mark volcano lava surface cells`
2. `feat: render animated lava bricks`
3. `fix: keep volcano prefabs off lava`
4. Optional: `chore: tune volcano lava visuals`
