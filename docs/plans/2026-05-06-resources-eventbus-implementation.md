# Universal Resources Loader & EventBus Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a declarative `Resources` loader and global `eventBus` so that declaring assets in `src/sources.js` automatically loads them and fires `'source ready'` (plus exposes `.ready` Promise).

**Architecture:** `Resources` class (instantiated once in `Experience`) reads the user-provided sources array, creates the minimal set of Three.js loaders, loads everything in parallel, stores results keyed by `name`, then resolves its `ready` Promise and emits the global event. `eventBus` is a one-line `mitt` re-export. No changes to bootstrap, Time, Renderer or World. Follows the exact simple class + listener pattern already used by `Sizes`.

**Tech Stack:** Three.js 0.183 (webgpu entry), mitt ^3, Vite 5, static/ folder for assets.

**Relevant Skills:** @test-driven-development (verification steps follow Red-Green-Refactor spirit even without automated runner), @brainstorming (design already approved).

---

## Task 1: Add mitt dependency

**Files:**
- Modify: `package.json:10-14`
- Modify: `pnpm-lock.yaml` (auto)

**Step 1: Install package**
```bash
pnpm add mitt
```
Expected: `package.json` now contains `"mitt": "^3.0.1"` under dependencies. No TypeScript types needed (JS project).

**Step 2: Verify**
```bash
git diff package.json
```
Expected: only the mitt line added.

**Step 3: Commit**
```bash
git add package.json pnpm-lock.yaml
git commit -m "deps: add mitt for global event bus"
```

---

## Task 2: Create global event-bus.js

**Files:**
- Create: `src/utils/event-bus.js`

**Step 1: Write the module (no test needed — trivial wrapper)**
```js
import mitt from 'mitt'

// 全局事件总线
export const eventBus = mitt()
```

**Step 2: Verify import works**
Start dev server later; for now just:
```bash
node --check src/utils/event-bus.js
```
Expected: no syntax error.

**Step 3: Commit**
```bash
git add src/utils/event-bus.js
git commit -m "feat: add global eventBus wrapper using mitt"
```

---

## Task 3: Create Resources.js skeleton + ready Promise (RED phase)

**Files:**
- Create: `src/utils/Resources.js`

**Step 1: Write failing skeleton (RED)**
We write the class with constructor that immediately resolves when sources is empty, but we will test the non-empty path later.

```js
import sources from '../sources.js'
import { eventBus } from './event-bus.js'

export default class Resources {
  constructor() {
    this.items = {}
    this.sources = sources
    this.toLoad = sources.length
    this.loaded = 0

    this.ready = new Promise(resolve => {
      this._resolveReady = resolve
    })

    if (this.toLoad === 0) {
      this._resolveReady()
      eventBus.emit('source ready')
      return
    }
    // TODO: implement startLoading in next tasks
  }
}
```

**Step 2: Run verification (simulate empty sources case)**
Temporarily edit `src/sources.js` to `export default []`, then in browser console after dev start we will check.

For now, syntax check:
```bash
node --check src/utils/Resources.js
```
Expected: no error.

**Step 3: Commit**
```bash
git add src/utils/Resources.js
git commit -m "feat(resources): skeleton with ready Promise and early emit for empty sources"
```

---

## Task 4: Implement full loader dispatch logic (GREEN phase)

**Files:**
- Modify: `src/utils/Resources.js:30-120` (replace TODO)

**Step 1: Replace the loading logic with complete implementation**
Paste the full working class body. This is the minimal code that passes the "all resources load and signal" requirement.

```js
  startLoading() {
    // Create loaders once
    this.loaders = {
      gltfModel: new GLTFLoader(),
      texture: new THREE.TextureLoader(),
      cubeTexture: new THREE.CubeTextureLoader(),
      font: new FontLoader(),
      fbxModel: new FBXLoader(),
      audio: new THREE.AudioLoader(),
      objModel: new OBJLoader(),
      hdrTexture: new RGBELoader(),
      svg: new SVGLoader(),
      exrTexture: new EXRLoader(),
      video: null, // special handling
      ktx2Texture: new KTX2Loader()
    }

    // TODO: user may need to set decoder paths for GLTF/Draco/KTX2
    // this.loaders.gltfModel.setDRACOLoader(new DRACOLoader().setDecoderPath('/draco/'))
    // this.loaders.ktx2Texture.setTranscoderPath('/ktx2/')

    for (const source of this.sources) {
      this.loadResource(source)
    }
  }

  loadResource(source) {
    const { name, type, path } = source
    const loader = this.loaders[type]

    if (!loader && type !== 'video') {
      console.error(`[Resources] Unknown type "${type}" for "${name}"`)
      this.itemLoaded(name, null)
      return
    }

    const onLoad = (file) => {
      this.items[name] = file
      this.itemLoaded(name, file)
    }
    const onError = (err) => {
      console.error(`[Resources] Failed to load ${type} "${name}":`, err)
      this.itemLoaded(name, null)
    }

    if (type === 'video') {
      const video = document.createElement('video')
      video.src = path
      video.muted = true
      video.playsInline = true
      video.autoplay = true
      video.loop = true
      video.oncanplay = () => {
        const texture = new THREE.VideoTexture(video)
        this.items[name] = texture
        this.itemLoaded(name, texture)
      }
      video.onerror = onError
      return
    }

    if (type === 'cubeTexture' || type === 'hdrTexture' || type === 'exrTexture' || type === 'ktx2Texture') {
      loader.load(path, onLoad, undefined, onError)
    } else {
      loader.load(path, onLoad, undefined, onError)
    }
  }

  itemLoaded(name, file) {
    this.loaded++
    if (this.loaded === this.toLoad) {
      this._resolveReady()
      eventBus.emit('source ready')
    }
  }
```

**Important:** Add the missing imports at top of file:
```js
import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
```

**Step 2: Verify syntax**
```bash
node --check src/utils/Resources.js
```

**Step 3: Commit**
```bash
git add src/utils/Resources.js
git commit -m "feat(resources): implement all 12 loader types + video special case + error resilience"
```

---

## Task 5: Update Vite publicDir + create example sources.js (using crane.glb)

**Files:**
- Modify: `vite.config.js:3` (change publicDir from '../static/' to '../public/')
- Create: `src/sources.js`

**Rationale:** The project already contains `public/model/crane.glb`. Vite's current `publicDir: '../static/'` would not serve files from the `public/` folder. We must point it to `../public/` (relative to `root: 'src/'`) so that `model/crane.glb` becomes available at runtime as `/model/crane.glb`.

**Step 1: Update vite.config.js**
```js
// vite.config.js
export default {
    root: 'src/',
    publicDir: '../public/', // Use the public/ folder at project root for static assets
    // ... rest unchanged
}
```

Run:
```bash
git add vite.config.js
git commit -m "fix(vite): point publicDir to '../public/' so model/crane.glb is served"
```

**Step 2: Write sources.js using the crane model**
```js
/**
 * 定义项目所需的静态资源列表。
 * Resources 类会根据 'type' 属性自动选择合适的加载器。
 */
export default [
  {
    name: 'craneModel',
    type: 'gltfModel',
    path: 'model/crane.glb'
  }
  // Add more entries (texture, hdrTexture, video, cubeTexture, etc.) as needed
]
```

**Step 3: Commit**
```bash
git add src/sources.js
git commit -m "feat: add example sources.js using gltfModel crane.glb from public/"
```

---

## Task 6: Wire Resources into Experience

**Files:**
- Modify: `src/app/Experience.js:1-30` (add import + instantiation)

**Step 1: Add import and create instance (minimal diff)**
```js
import Resources from '../utils/Resources.js'
// ...
export default class Experience {
  constructor(canvas) {
    // ... existing lines ...
    this.resources = new Resources()
  }
  // ...
}
```

**Step 2: Verify no breakage**
```bash
pnpm dev
```
Then open browser, check console for any import errors.

**Step 3: Commit**
```bash
git add src/app/Experience.js
git commit -m "feat: instantiate Resources in Experience constructor"
```

---

## Task 7: End-to-end verification (manual TDD-style)

**Step 1: Prepare test assets**
- Place at least one cube map (6 jpgs) or a simple texture inside `static/textures/`
- Update `src/sources.js` with a real path that exists.

**Step 2: Start dev server**
```bash
pnpm dev
```

**Step 3: Verify in browser console**
```js
// After page loads
const exp = window.__experience
exp.resources.ready.then(() => {
  console.log('Promise resolved!')
  console.log('Items:', Object.keys(exp.resources.items))
})
```
Expected: `'source ready'` logged once, items contain your resource, no console errors.

**Step 4: Verify World can consume (optional integration)**
Add in `src/world/world.js`:
```js
import { eventBus } from '../utils/event-bus.js'
// ...
constructor(experience) {
  // ...
  eventBus.on('source ready', () => {
    console.log('World received source ready via eventBus')
  })
}
```

**Step 5: Commit verification state (or revert test code)**
```bash
git commit -am "test: manual verification that resources load and event fires"
# or git checkout -- src/world/world.js if you only wanted console proof
```

---

## Task 8: Final cleanup & docs

**Files:**
- Modify: `readme.md` (optional one-line note)

**Step 1: Add usage note to README**
```markdown
## Resources

Declare static assets in `src/sources.js`. Access via `experience.resources.items` or listen for `'source ready'` on the global `eventBus`.
```

**Step 2: Run full verification again**
```bash
pnpm dev
```
Confirm everything still works.

**Step 3: Commit**
```bash
git add readme.md
git commit -m "docs: add brief Resources usage note"
```

---

## Execution Options After Plan Complete

Plan saved to `docs/plans/2026-05-06-resources-eventbus-implementation.md`.

**Two ways to execute:**

1. **Subagent-Driven (recommended for this session)**  
   I will dispatch a fresh subagent for each task using `superpowers:subagent-driven-development`. We review after every task. Fast feedback loop.

2. **Parallel Session**  
   Open a new Cursor window / worktree, point the new agent at this plan file, and let it run the whole plan with checkpoints.

Which approach would you like? Reply with **"1"** or **"2"** (or suggest adjustments to any task). 

Once chosen, the next action will be invoking the required sub-skill and starting Task 1.