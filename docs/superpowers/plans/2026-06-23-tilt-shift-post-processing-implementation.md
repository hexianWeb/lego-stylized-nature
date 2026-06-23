# Tilt-Shift Post-Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable screen-space tilt-shift effect that keeps a fixed horizontal band sharp and progressively blurs the top and bottom of the rendered image.

**Architecture:** Define the parameter contract and CPU reference mask separately from the TSL node graph. A focused post-processing module owns one quarter-resolution `GaussianBlurNode`, its uniforms, the vertical blend mask, and disposal; `Renderer` builds enabled and disabled final output chains and switches between them without rebuilding numeric controls. A dedicated Tweakpane panel updates the shared `worldConfig` object through a narrow renderer controller.

**Tech Stack:** JavaScript ES modules, Three.js WebGPU 0.183.2, TSL, `RenderPipeline`, `GaussianBlurNode`, native Node.js test runner, Tweakpane, Vite.

---

## File Structure

- Create `src/renderer/postprocessing/tiltShiftConfig.js`: defaults, debug ranges, and a pure CPU reference implementation of the vertical mask.
- Create `src/renderer/postprocessing/createTiltShiftEffect.js`: TSL uniforms, quarter-resolution Gaussian blur, vertical mask blend, synchronization, and disposal.
- Create `src/debug/panels/PostProcessingPanel.js`: tilt-shift debug bindings only.
- Create `test/tiltShiftPostProcessing.test.js`: configuration, mask, node ownership, controller switching, panel callbacks, and cleanup tests.
- Modify `src/world/WorldConfig.js`: add the shared `postProcessing.tiltShift` configuration without changing existing terrain, biome, placement, or water values.
- Modify `src/renderer/Renderer.js`: build raw scene-color tilt-shift branches before `renderOutput`, retain vignette and SMAA, expose a narrow controller, and dispose owned post-processing resources.
- Modify `src/app/Experience.js`: pass the shared configuration into `Renderer`, register the post-processing panel, and dispose the renderer-owned pipeline before the WebGPU renderer.

## Execution Preconditions

The source workspace currently contains unrelated uncommitted water and environment edits, including an overlapping modification to `src/world/WorldConfig.js`. Execute this plan in an isolated worktree created from commit `bab326a`, or otherwise ensure those unrelated edits are neither overwritten nor included in tilt-shift commits.

Before changing files, run:

```powershell
git status --short
git log -1 --oneline
```

Expected in an isolated execution worktree:

```text
bab326a docs: design tilt-shift post-processing
```

The status output should be empty. If it is not empty, inspect and preserve all pre-existing changes before continuing.

### Task 1: Define Tilt-Shift Configuration and Mask Semantics

**Files:**
- Create: `src/renderer/postprocessing/tiltShiftConfig.js`
- Create: `test/tiltShiftPostProcessing.test.js`
- Modify: `src/world/WorldConfig.js:1-53`

- [ ] **Step 1: Write failing configuration and mask tests**

Create `test/tiltShiftPostProcessing.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { worldConfig } from '../src/world/WorldConfig.js'
import {
  TILT_SHIFT_DEFAULTS,
  TILT_SHIFT_RANGES,
  evaluateTiltShiftMask
} from '../src/renderer/postprocessing/tiltShiftConfig.js'

test('defines the approved tilt-shift defaults and debug ranges', () => {
  assert.deepEqual(TILT_SHIFT_DEFAULTS, {
    enabled: true,
    focusCenter: 0.5,
    focusWidth: 0.22,
    falloff: 0.28,
    blurStrength: 2.5
  })

  assert.deepEqual(TILT_SHIFT_RANGES, {
    focusCenter: { min: 0, max: 1, step: 0.01 },
    focusWidth: { min: 0.02, max: 1, step: 0.01 },
    falloff: { min: 0.01, max: 0.5, step: 0.01 },
    blurStrength: { min: 0, max: 5, step: 0.05 }
  })

  assert.deepEqual(
    worldConfig.postProcessing.tiltShift,
    TILT_SHIFT_DEFAULTS
  )
  assert.notEqual(worldConfig.postProcessing.tiltShift, TILT_SHIFT_DEFAULTS)
})

test('keeps the focus center fully sharp', () => {
  assert.equal(evaluateTiltShiftMask(0.5), 0)
})

test('reaches full blur outside the clear band and falloff', () => {
  const fullBlurY =
    TILT_SHIFT_DEFAULTS.focusCenter +
    TILT_SHIFT_DEFAULTS.focusWidth * 0.5 +
    TILT_SHIFT_DEFAULTS.falloff

  assert.equal(evaluateTiltShiftMask(fullBlurY), 1)
  assert.equal(evaluateTiltShiftMask(1), 1)
})

test('uses a symmetric smooth transition above and below the focus center', () => {
  const upper = evaluateTiltShiftMask(0.25)
  const lower = evaluateTiltShiftMask(0.75)

  assert.equal(upper, lower)
  assert.equal(upper, 0.5)
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm test -- test/tiltShiftPostProcessing.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`src/renderer/postprocessing/tiltShiftConfig.js`.

- [ ] **Step 3: Implement the configuration contract and CPU mask**

Create `src/renderer/postprocessing/tiltShiftConfig.js`:

```js
export const TILT_SHIFT_DEFAULTS = Object.freeze({
  enabled: true,
  focusCenter: 0.5,
  focusWidth: 0.22,
  falloff: 0.28,
  blurStrength: 2.5
})

export const TILT_SHIFT_RANGES = Object.freeze({
  focusCenter: Object.freeze({ min: 0, max: 1, step: 0.01 }),
  focusWidth: Object.freeze({ min: 0.02, max: 1, step: 0.01 }),
  falloff: Object.freeze({ min: 0.01, max: 0.5, step: 0.01 }),
  blurStrength: Object.freeze({ min: 0, max: 5, step: 0.05 })
})

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1)
}

export function evaluateTiltShiftMask(
  screenY,
  config = TILT_SHIFT_DEFAULTS
) {
  const focusCenter = config.focusCenter ?? TILT_SHIFT_DEFAULTS.focusCenter
  const focusWidth = config.focusWidth ?? TILT_SHIFT_DEFAULTS.focusWidth
  const falloff = config.falloff ?? TILT_SHIFT_DEFAULTS.falloff
  const distance = Math.abs(screenY - focusCenter)
  const clearEdge = focusWidth * 0.5

  if (falloff <= 0) {
    return distance <= clearEdge ? 0 : 1
  }

  const t = clamp01((distance - clearEdge) / falloff)
  return t * t * (3 - 2 * t)
}
```

This pure function is the executable reference for the documented mask. The
TSL implementation in Task 2 must use the same `distance`, `clearEdge`, and
`smoothstep` semantics.

- [ ] **Step 4: Add the shared defaults to `worldConfig`**

At the top of `src/world/WorldConfig.js`, add:

```js
import { TILT_SHIFT_DEFAULTS } from '../renderer/postprocessing/tiltShiftConfig.js'
```

Inside `worldConfig`, after `seed` and before `terrain`, add:

```js
  postProcessing: {
    tiltShift: { ...TILT_SHIFT_DEFAULTS }
  },
```

Do not rewrite or remove any existing configuration fields. In particular,
preserve the current water settings exactly as they exist in the execution
worktree.

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```powershell
npm test -- test/tiltShiftPostProcessing.test.js
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit the configuration contract**

```powershell
git add src/renderer/postprocessing/tiltShiftConfig.js src/world/WorldConfig.js test/tiltShiftPostProcessing.test.js
git diff --cached --check
git commit -m "feat: define tilt-shift configuration"
```

Expected: one commit containing only the new tilt-shift contract, config
section, and focused tests.

### Task 2: Build the Quarter-Resolution TSL Effect

**Files:**
- Create: `src/renderer/postprocessing/createTiltShiftEffect.js`
- Modify: `test/tiltShiftPostProcessing.test.js`

- [ ] **Step 1: Append failing node ownership and synchronization tests**

Append these imports to `test/tiltShiftPostProcessing.test.js`:

```js
import * as THREE from 'three/webgpu'
import { texture } from 'three/tsl'
import { createTiltShiftEffect } from '../src/renderer/postprocessing/createTiltShiftEffect.js'
```

Append these tests:

```js
test('creates a quarter-resolution blur with live uniforms', () => {
  const sourceTexture = new THREE.Texture()
  const sceneColor = texture(sourceTexture)
  const effect = createTiltShiftEffect(sceneColor, {
    enabled: true,
    focusCenter: 0.4,
    focusWidth: 0.3,
    falloff: 0.2,
    blurStrength: 3
  })

  assert.equal(effect.disabledOutput, sceneColor)
  assert.notEqual(effect.enabledOutput, sceneColor)
  assert.equal(effect.blurNode.isGaussianBlurNode, true)
  assert.equal(effect.blurNode.resolutionScale, 0.25)
  assert.equal(effect.uniforms.focusCenter.value, 0.4)
  assert.equal(effect.uniforms.focusWidth.value, 0.3)
  assert.equal(effect.uniforms.falloff.value, 0.2)
  assert.equal(effect.uniforms.blurStrength.value, 3)
})

test('updates numeric uniforms without replacing output nodes', () => {
  const effect = createTiltShiftEffect(
    texture(new THREE.Texture()),
    TILT_SHIFT_DEFAULTS
  )
  const enabledOutput = effect.enabledOutput
  const blurNode = effect.blurNode

  effect.sync({
    focusCenter: 0.45,
    focusWidth: 0.18,
    falloff: 0.35,
    blurStrength: 4
  })

  assert.equal(effect.enabledOutput, enabledOutput)
  assert.equal(effect.blurNode, blurNode)
  assert.equal(effect.uniforms.focusCenter.value, 0.45)
  assert.equal(effect.uniforms.focusWidth.value, 0.18)
  assert.equal(effect.uniforms.falloff.value, 0.35)
  assert.equal(effect.uniforms.blurStrength.value, 4)
})

test('disposes the Gaussian blur node exactly once', () => {
  const effect = createTiltShiftEffect(
    texture(new THREE.Texture()),
    TILT_SHIFT_DEFAULTS
  )
  let disposeCount = 0
  effect.blurNode.dispose = () => {
    disposeCount++
  }

  effect.dispose()
  effect.dispose()

  assert.equal(disposeCount, 1)
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm test -- test/tiltShiftPostProcessing.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`src/renderer/postprocessing/createTiltShiftEffect.js`.

- [ ] **Step 3: Implement the TSL effect module**

Create `src/renderer/postprocessing/createTiltShiftEffect.js`:

```js
import {
  mix,
  screenUV,
  smoothstep,
  uniform
} from 'three/tsl'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
import { TILT_SHIFT_DEFAULTS } from './tiltShiftConfig.js'

const BLUR_RESOLUTION_SCALE = 0.25
const BLUR_SIGMA = 4

export function createTiltShiftEffect(
  sceneColor,
  config = TILT_SHIFT_DEFAULTS
) {
  const uniforms = {
    focusCenter: uniform(
      config.focusCenter ?? TILT_SHIFT_DEFAULTS.focusCenter
    ),
    focusWidth: uniform(
      config.focusWidth ?? TILT_SHIFT_DEFAULTS.focusWidth
    ),
    falloff: uniform(
      config.falloff ?? TILT_SHIFT_DEFAULTS.falloff
    ),
    blurStrength: uniform(
      config.blurStrength ?? TILT_SHIFT_DEFAULTS.blurStrength
    )
  }

  const blurNode = gaussianBlur(
    sceneColor,
    uniforms.blurStrength,
    BLUR_SIGMA,
    { resolutionScale: BLUR_RESOLUTION_SCALE }
  )

  const distance = screenUV.y.sub(uniforms.focusCenter).abs()
  const clearEdge = uniforms.focusWidth.mul(0.5)
  const blurMask = smoothstep(
    clearEdge,
    clearEdge.add(uniforms.falloff),
    distance
  )
  const enabledOutput = mix(sceneColor, blurNode, blurMask)

  let disposed = false

  return {
    enabledOutput,
    disabledOutput: sceneColor,
    blurNode,
    uniforms,

    sync(nextConfig = {}) {
      uniforms.focusCenter.value =
        nextConfig.focusCenter ?? uniforms.focusCenter.value
      uniforms.focusWidth.value =
        nextConfig.focusWidth ?? uniforms.focusWidth.value
      uniforms.falloff.value =
        nextConfig.falloff ?? uniforms.falloff.value
      uniforms.blurStrength.value =
        nextConfig.blurStrength ?? uniforms.blurStrength.value
    },

    dispose() {
      if (disposed) {
        return
      }

      blurNode.dispose()
      disposed = true
    }
  }
}
```

Keep all node arithmetic in chained TSL operations. Do not use expressions
such as `screenUV.y - uniforms.focusCenter` or
`clearEdge + uniforms.falloff`, because JavaScript arithmetic would break the
node graph.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npm test -- test/tiltShiftPostProcessing.test.js
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit the effect module**

```powershell
git add src/renderer/postprocessing/createTiltShiftEffect.js test/tiltShiftPostProcessing.test.js
git diff --cached --check
git commit -m "feat: add tilt-shift TSL effect"
```

### Task 3: Integrate Enabled and Disabled Renderer Output Chains

**Files:**
- Modify: `src/renderer/Renderer.js:1-64`
- Modify: `test/tiltShiftPostProcessing.test.js`

- [ ] **Step 1: Append failing renderer controller and lifecycle tests**

Append this import:

```js
import Renderer from '../src/renderer/Renderer.js'
```

Append these tests:

```js
function createRendererHarness() {
  const renderer = Object.create(Renderer.prototype)
  renderer.tiltShiftConfig = { ...TILT_SHIFT_DEFAULTS }
  renderer.renderPipeline = { outputNode: null }
  renderer.outputNodes = {
    tiltShiftEnabled: { name: 'enabled' },
    tiltShiftDisabled: { name: 'disabled' }
  }
  renderer.tiltShiftEffect = null
  return renderer
}

test('switches between prebuilt output chains without rebuilding them', () => {
  const renderer = createRendererHarness()
  const outputNodes = renderer.outputNodes

  renderer.setTiltShiftEnabled(true)
  assert.equal(
    renderer.renderPipeline.outputNode,
    outputNodes.tiltShiftEnabled
  )

  renderer.setTiltShiftEnabled(false)
  assert.equal(
    renderer.renderPipeline.outputNode,
    outputNodes.tiltShiftDisabled
  )
  assert.equal(renderer.outputNodes, outputNodes)
  assert.equal(renderer.tiltShiftConfig.enabled, false)
})

test('synchronizes numeric controls without changing the selected output', () => {
  const renderer = createRendererHarness()
  const selectedOutput = renderer.outputNodes.tiltShiftEnabled
  const calls = []
  renderer.renderPipeline.outputNode = selectedOutput
  renderer.tiltShiftEffect = {
    sync(config) {
      calls.push({ ...config })
    }
  }

  renderer.syncTiltShift({
    focusCenter: 0.35,
    focusWidth: 0.25,
    falloff: 0.4,
    blurStrength: 3.5
  })

  assert.equal(renderer.renderPipeline.outputNode, selectedOutput)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].blurStrength, 3.5)
  assert.equal(renderer.tiltShiftConfig.focusCenter, 0.35)
})

test('disposes renderer-owned post-processing resources', () => {
  const renderer = createRendererHarness()
  let effectDisposed = 0
  let pipelineDisposed = 0
  renderer.tiltShiftEffect = {
    dispose() {
      effectDisposed++
    }
  }
  renderer.renderPipeline = {
    outputNode: renderer.outputNodes.tiltShiftEnabled,
    dispose() {
      pipelineDisposed++
    }
  }

  renderer.dispose()
  renderer.dispose()

  assert.equal(effectDisposed, 1)
  assert.equal(pipelineDisposed, 1)
  assert.equal(renderer.tiltShiftEffect, null)
  assert.equal(renderer.renderPipeline, null)
  assert.equal(renderer.outputNodes, null)
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm test -- test/tiltShiftPostProcessing.test.js
```

Expected: FAIL because `Renderer` does not yet define
`setTiltShiftEnabled()`, `syncTiltShift()`, or `dispose()`.

- [ ] **Step 3: Replace `Renderer.js` with the integrated implementation**

Replace `src/renderer/Renderer.js` with:

```js
import * as THREE from 'three/webgpu'
import {
  pass,
  renderOutput,
  Fn,
  float,
  screenUV,
  smoothstep
} from 'three/tsl'
import { smaa } from 'three/addons/tsl/display/SMAANode.js'
import { createTiltShiftEffect } from './postprocessing/createTiltShiftEffect.js'
import { TILT_SHIFT_DEFAULTS } from './postprocessing/tiltShiftConfig.js'

// dist is scaled so screen corners sit near 1.0 (~sqrt(2)/2 * 1.42)
const VIGNETTE_INNER = 0.22
const VIGNETTE_OUTER = 0.92
const VIGNETTE_AMOUNT = 0.2

const applyVignette = Fn(() => {
  const dist = screenUV.sub(0.5).length().mul(1.42)
  const mask = smoothstep(VIGNETTE_INNER, VIGNETTE_OUTER, dist)
  return float(1.0).sub(mask.mul(VIGNETTE_AMOUNT))
})

export default class Renderer {
  /**
   * @param {{
   *   canvas: HTMLCanvasElement,
   *   postProcessing?: {
   *     tiltShift?: {
   *       enabled?: boolean,
   *       focusCenter?: number,
   *       focusWidth?: number,
   *       falloff?: number,
   *       blurStrength?: number
   *     }
   *   }
   * }} options
   */
  constructor({ canvas, postProcessing = {} }) {
    this.instance = new THREE.WebGPURenderer({
      canvas,
      forceWebGL: false
    })
    this.instance.outputColorSpace = THREE.SRGBColorSpace
    this.instance.toneMapping = THREE.ACESFilmicToneMapping
    this.instance.toneMappingExposure = 1.0
    this.instance.shadowMap.enabled = true
    this.instance.shadowMap.type = THREE.PCFShadowMap

    this.tiltShiftConfig =
      postProcessing.tiltShift ?? { ...TILT_SHIFT_DEFAULTS }

    /** @type {THREE.RenderPipeline | null} */
    this.renderPipeline = null
    this.tiltShiftEffect = null
    this.outputNodes = null

    this.postProcessingController = Object.freeze({
      setTiltShiftEnabled: (enabled) => {
        this.setTiltShiftEnabled(enabled)
      },
      syncTiltShift: (config) => {
        this.syncTiltShift(config)
      }
    })
  }

  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  attachPipeline(scene, camera) {
    this.tiltShiftEffect?.dispose()
    this.renderPipeline?.dispose()

    const scenePass = pass(scene, camera)
    const sceneColor = scenePass.getTextureNode('output')
    this.tiltShiftEffect = createTiltShiftEffect(
      sceneColor,
      this.tiltShiftConfig
    )

    this.outputNodes = {
      tiltShiftEnabled: this.createFinalOutput(
        this.tiltShiftEffect.enabledOutput
      ),
      tiltShiftDisabled: this.createFinalOutput(
        this.tiltShiftEffect.disabledOutput
      )
    }

    this.renderPipeline = new THREE.RenderPipeline(this.instance)
    this.renderPipeline.outputColorTransform = false
    this.setTiltShiftEnabled(this.tiltShiftConfig.enabled)
  }

  createFinalOutput(sceneColor) {
    const color = renderOutput(sceneColor)
    const vignetted = color.mul(applyVignette())
    return smaa(vignetted)
  }

  setTiltShiftEnabled(enabled) {
    const nextEnabled = enabled === true
    this.tiltShiftConfig.enabled = nextEnabled

    if (!this.renderPipeline || !this.outputNodes) {
      return
    }

    this.renderPipeline.outputNode = nextEnabled
      ? this.outputNodes.tiltShiftEnabled
      : this.outputNodes.tiltShiftDisabled
  }

  syncTiltShift(config = {}) {
    Object.assign(this.tiltShiftConfig, config)
    this.tiltShiftEffect?.sync(this.tiltShiftConfig)
  }

  async init() {
    await this.instance.init()
  }

  /**
   * @param {{ width: number, height: number }} sizes
   */
  setSizeFromSizes(sizes) {
    this.instance.setSize(sizes.width, sizes.height)
    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  }

  render() {
    this.renderPipeline.render()
  }

  dispose() {
    this.tiltShiftEffect?.dispose()
    this.renderPipeline?.dispose()
    this.tiltShiftEffect = null
    this.renderPipeline = null
    this.outputNodes = null
  }
}
```

Important graph invariant: `tiltShiftDisabled` is built from
`tiltShiftEffect.disabledOutput`, which is the original `sceneColor` texture
node. It must not reference `enabledOutput` or `blurNode`; otherwise
`GaussianBlurNode.updateBefore()` could continue running while disabled.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npm test -- test/tiltShiftPostProcessing.test.js
```

Expected: 10 tests pass.

- [ ] **Step 5: Run a production build to compile the TSL graph**

Run:

```powershell
npm run build
```

Expected: Vite build succeeds. A pre-existing chunk-size warning is acceptable;
TSL node type errors, missing exports, or shader graph compilation failures are
not acceptable.

- [ ] **Step 6: Commit renderer integration**

```powershell
git add src/renderer/Renderer.js test/tiltShiftPostProcessing.test.js
git diff --cached --check
git commit -m "feat: integrate tilt-shift render pipeline"
```

### Task 4: Add Debug Controls and Experience Wiring

**Files:**
- Create: `src/debug/panels/PostProcessingPanel.js`
- Modify: `src/app/Experience.js:1-100`
- Modify: `test/tiltShiftPostProcessing.test.js`

- [ ] **Step 1: Append a fake Tweakpane harness and failing panel test**

Append this import:

```js
import { createPostProcessingPanel } from '../src/debug/panels/PostProcessingPanel.js'
```

Append this harness and test:

```js
function createDebugHarness() {
  const bindings = new Map()
  const folder = {
    addBinding(target, key, options) {
      const binding = {
        target,
        key,
        options,
        handler: null,
        on(event, handler) {
          assert.equal(event, 'change')
          this.handler = handler
          return this
        }
      }
      bindings.set(key, binding)
      return binding
    }
  }

  return {
    bindings,
    debug: {
      addFolder(options) {
        assert.deepEqual(options, {
          title: 'Post Processing',
          expanded: false
        })
        return folder
      }
    }
  }
}

test('binds all tilt-shift controls to the renderer controller', () => {
  const { debug, bindings } = createDebugHarness()
  const config = {
    postProcessing: {
      tiltShift: { ...TILT_SHIFT_DEFAULTS }
    }
  }
  const enabledCalls = []
  const syncCalls = []
  const controller = {
    setTiltShiftEnabled(value) {
      enabledCalls.push(value)
    },
    syncTiltShift(value) {
      syncCalls.push({ ...value })
    }
  }

  createPostProcessingPanel(debug, config, controller)

  assert.deepEqual([...bindings.keys()], [
    'enabled',
    'focusCenter',
    'focusWidth',
    'falloff',
    'blurStrength'
  ])
  assert.deepEqual(
    bindings.get('focusCenter').options,
    { ...TILT_SHIFT_RANGES.focusCenter, label: 'focusCenter' }
  )
  assert.deepEqual(
    bindings.get('blurStrength').options,
    { ...TILT_SHIFT_RANGES.blurStrength, label: 'blurStrength' }
  )

  bindings.get('enabled').handler({ value: false })
  bindings.get('focusCenter').handler({ value: 0.42 })

  assert.equal(config.postProcessing.tiltShift.enabled, false)
  assert.equal(config.postProcessing.tiltShift.focusCenter, 0.42)
  assert.deepEqual(enabledCalls, [false])
  assert.equal(syncCalls.length, 1)
  assert.equal(syncCalls[0].focusCenter, 0.42)
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm test -- test/tiltShiftPostProcessing.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`src/debug/panels/PostProcessingPanel.js`.

- [ ] **Step 3: Implement the dedicated post-processing panel**

Create `src/debug/panels/PostProcessingPanel.js`:

```js
import {
  TILT_SHIFT_RANGES
} from '../../renderer/postprocessing/tiltShiftConfig.js'

export function createPostProcessingPanel(debug, config, controller) {
  const tiltShift = config.postProcessing?.tiltShift
  if (!tiltShift) {
    return
  }

  const folder = debug.addFolder({
    title: 'Post Processing',
    expanded: false
  })
  if (!folder) {
    return
  }

  folder
    .addBinding(tiltShift, 'enabled', { label: 'enabled' })
    .on('change', ({ value }) => {
      tiltShift.enabled = value
      controller.setTiltShiftEnabled(value)
    })

  for (const key of [
    'focusCenter',
    'focusWidth',
    'falloff',
    'blurStrength'
  ]) {
    folder
      .addBinding(tiltShift, key, {
        ...TILT_SHIFT_RANGES[key],
        label: key
      })
      .on('change', ({ value }) => {
        tiltShift[key] = value
        controller.syncTiltShift(tiltShift)
      })
  }
}
```

- [ ] **Step 4: Wire configuration, panel registration, and cleanup in `Experience`**

In `src/app/Experience.js`, add these imports:

```js
import { worldConfig } from '../world/WorldConfig.js'
import { createPostProcessingPanel } from '../debug/panels/PostProcessingPanel.js'
```

Change renderer construction from:

```js
this.renderer = new Renderer({ canvas })
```

to:

```js
this.renderer = new Renderer({
  canvas,
  postProcessing: worldConfig.postProcessing
})
```

Inside the existing `if (this.debug.active)` block, after the current world,
camera, and environment panel registration calls, add:

```js
createPostProcessingPanel(
  this.debug,
  worldConfig,
  this.renderer.postProcessingController
)
```

In `dispose()`, immediately before the existing
`this.renderer.instance.dispose()` guard, add:

```js
this.renderer.dispose()
```

The end of `dispose()` must therefore remain:

```js
this.sizes.dispose()
this.time.dispose()
this.renderer.dispose()

if (typeof this.renderer.instance.dispose === 'function') {
  this.renderer.instance.dispose()
}
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```powershell
npm test -- test/tiltShiftPostProcessing.test.js
```

Expected: 11 tests pass.

- [ ] **Step 6: Run the full automated test suite**

Run:

```powershell
npm test
```

Expected: all tests pass, including existing water, lava, prefab, terrain, and
placement tests.

- [ ] **Step 7: Run the production build**

Run:

```powershell
npm run build
```

Expected: build succeeds with no TSL node type error. The existing Vite
chunk-size warning is acceptable.

- [ ] **Step 8: Commit panel and application wiring**

```powershell
git add src/debug/panels/PostProcessingPanel.js src/app/Experience.js test/tiltShiftPostProcessing.test.js
git diff --cached --check
git commit -m "feat: add tilt-shift debug controls"
```

### Task 5: Browser Verification and Final Regression Check

**Files:**
- Verify: `src/renderer/postprocessing/createTiltShiftEffect.js`
- Verify: `src/renderer/Renderer.js`
- Verify: `src/debug/panels/PostProcessingPanel.js`
- Verify: `src/app/Experience.js`
- Verify: `src/world/WorldConfig.js`
- Verify: `test/tiltShiftPostProcessing.test.js`

- [ ] **Step 1: Start the development server**

Run:

```powershell
npm run dev
```

Expected: Vite prints a local development URL without compilation errors.

- [ ] **Step 2: Verify the default visual result**

Open the development URL with `#debug` appended.

Confirm:

- The middle horizontal region is sharp.
- Blur increases smoothly toward both top and bottom.
- The focus band remains horizontal while orbiting, zooming, and panning the
  camera.
- Vignette and SMAA remain active.
- There is no visible hard seam at either edge of the clear band.

- [ ] **Step 3: Verify all five debug controls**

In the `Post Processing` folder:

- Toggle `enabled` off and confirm the image matches the pre-feature sharp
  render.
- Toggle `enabled` on and confirm the blur returns.
- Move `focusCenter` from `0` to `1` and confirm the clear band travels
  vertically.
- Increase and decrease `focusWidth` and confirm only the fully sharp width
  changes.
- Increase and decrease `falloff` and confirm only transition softness
  changes.
- Set `blurStrength` to `0` and then `5` and confirm the maximum blur radius
  changes without moving the focus band.

- [ ] **Step 4: Verify the disabled fast path in the WebGPU inspector**

With tilt-shift enabled, confirm the frame contains horizontal and vertical
Gaussian blur work. Disable tilt-shift and confirm those blur passes no longer
execute.

If the blur passes remain visible while disabled, inspect
`Renderer.outputNodes.tiltShiftDisabled` and remove any dependency on
`tiltShiftEffect.enabledOutput` or `tiltShiftEffect.blurNode`.

- [ ] **Step 5: Run final non-interactive verification**

Stop the development server, then run:

```powershell
npm test
npm run build
git status --short
```

Expected:

- Full test suite passes.
- Production build succeeds.
- Status contains no unexpected generated files or unrelated modifications.

- [ ] **Step 6: Commit any browser-verification correction**

Only if manual verification required a code correction:

```powershell
git add src/renderer/postprocessing/createTiltShiftEffect.js src/renderer/Renderer.js src/debug/panels/PostProcessingPanel.js src/app/Experience.js src/world/WorldConfig.js test/tiltShiftPostProcessing.test.js
git diff --cached --check
git commit -m "fix: refine tilt-shift post-processing"
```

If no correction was needed, do not create an empty commit.

## Completion Criteria

- The default scene displays a fixed horizontal sharp band with smooth blur
  toward the top and bottom.
- Gaussian blur runs at `resolutionScale: 0.25`.
- `enabled = false` removes the Gaussian blur node from the active output
  graph.
- Numeric controls update uniforms without replacing effect or final-output
  node objects.
- Existing `renderOutput -> vignette -> SMAA` ordering remains intact after
  the tilt-shift blend.
- Renderer and Gaussian blur render targets are disposed.
- All five debug controls work live.
- `npm test` and `npm run build` pass.
