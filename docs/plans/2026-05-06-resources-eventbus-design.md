# Resources Loader & Global EventBus Design Document

**Date**: 2026-05-06  
**Author**: AI Assistant (following user-approved design)  
**Status**: Approved for Implementation

## 1. Problem Statement

The current Three.js WebGPU/TSL template (`Experience` + `systems/`) lacks a unified way to declare and load static assets (models, textures, HDR, audio, video, fonts, etc.). Users need to manually instantiate different Three.js loaders scattered across World/Environment classes, leading to duplicated loader setup, inconsistent error handling, and no centralized "ready" signal.

We need a single `Resources` class that:
- Reads a user-maintained `src/sources.js` array of resource descriptors.
- Automatically selects the correct Three.js loader based on `type`.
- Stores loaded items by `name` for easy access.
- Exposes a `.ready` Promise that resolves when all resources are loaded.
- Emits a global `'source ready'` event (via `eventBus`) so multiple modules can react without tight coupling.

## 2. Design Goals (from Core Principles)

- **Simple, readable, practical** — ~80 lines for Resources, one file for eventBus.
- **Minimal change scope** — Only 3 new files + 2 lines in Experience + 1 dependency.
- **Single responsibility** — Resources only loads and signals; no progress UI, no caching policy, no custom loader extension.
- **Reuse existing patterns** — Follows `Sizes` listener style; uses `THREE.Timer` already present (no new timing logic needed).
- **YAGNI** — No progress callbacks, no priority queues, no hot-reload built-in.

## 3. Chosen Solution

**Approach**: Dedicated `Resources` class + tiny `eventBus` wrapper around `mitt`.

**Why this over alternatives**:
- Rejected: Extending `Experience` with ad-hoc loaders (duplication, hard to test).
- Rejected: Global state library (zustand etc.) — overkill for <20 modules.
- Rejected: Making Resources extend EventTarget and also emit to bus (DRY violation).

This is the simplest viable approach that satisfies the exact requirement (sources.js + event + Promise).

## 4. File Structure & Responsibilities

| Path                              | Type   | Responsibility |
|-----------------------------------|--------|----------------|
| `src/utils/event-bus.js`          | New    | Global event bus (re-export of `mitt()`) |
| `src/utils/Resources.js`          | New    | Universal loader, type-to-loader mapping, Promise + event emission |
| `src/sources.js`                  | New    | User-declared resource list (example below) |
| `src/app/Experience.js`           | Modify | Instantiate `this.resources = new Resources()` in constructor |
| `package.json`                    | Modify | Add `"mitt": "^3.0.1"` |

## 5. Public API

### eventBus (`src/utils/event-bus.js`)

```js
import mitt from 'mitt'
export const eventBus = mitt()
```

Usage:
```js
import { eventBus } from '../utils/event-bus.js'
eventBus.on('source ready', () => { ... })
eventBus.emit('source ready')
```

### Resources (`src/utils/Resources.js`)

```js
import sources from '../sources.js'
import { eventBus } from './event-bus.js'

export default class Resources {
  constructor() {
    this.items = {}
    this.sources = sources
    this.toLoad = sources.length
    this.loaded = 0

    /** @type {Promise<void>} */
    this.ready = new Promise(resolve => { this._resolveReady = resolve })

    if (this.toLoad === 0) {
      this._resolveReady()
      eventBus.emit('source ready')
      return
    }
    this.startLoading()
  }

  // Internal: maps type -> Loader instance + load logic
  // Supported types: gltfModel, texture, cubeTexture, font, fbxModel,
  // audio, objModel, hdrTexture, svg, exrTexture, video, ktx2Texture
}
```

**Exposed**:
- `items: Record<string, any>` — loaded resources keyed by `name`
- `ready: Promise<void>` — resolves after all loads finish (or immediately if empty)

**Not exposed** (per user choice):
- `onReady(callback)` instance method
- Custom loader registration

### sources.js example (user provided)

```js
export default [
  {
    name: 'environmentMapTexture',
    type: 'cubeTexture',
    path: [
      'textures/environmentMap/px.jpg',
      'textures/environmentMap/nx.jpg',
      /* ... */
    ]
  },
  {
    name: 'foxModel',
    type: 'gltfModel',
    path: 'models/Fox/glTF/Fox.gltf'
  }
  // ... other 10 types
]
```

## 6. Loading Strategy (Key Implementation Notes)

- **Loader creation**: One shared instance per loader type (GLTFLoader, RGBELoader, etc.) created once in constructor.
- **GLTF special handling**: `GLTFLoader` gets `DRACOLoader` and `KTX2Loader` pre-attached if user places decoders in `static/draco/` or uses CDN (configurable via constants).
- **Video type**: Creates `<video>` element with `muted`, `playsInline`, `autoplay`, `loop`; wraps in `THREE.VideoTexture`.
- **Error handling**: Per-resource `onError` logs to console but still increments `loaded` so the overall `ready` Promise always resolves and event is emitted.
- **Path resolution**: Relies on Vite `publicDir: '../static/'` — paths in sources are relative to `static/`.
- **No extra timing**: Uses the already-initialized `THREE.Timer` via `Experience.time`; Resources does not subscribe to any frame loop.

## 7. Integration Points

**Experience.js** (minimal diff):
```js
import Resources from '../utils/Resources.js'
// ...
constructor(canvas) {
  // ...
  this.resources = new Resources()
}
```

**World / Environment consumption** (recommended pattern):
```js
import { eventBus } from '../utils/event-bus.js'

constructor(experience) {
  this.experience = experience
  this.experience.resources.ready.then(() => {
    const envMap = this.experience.resources.items.environmentMapTexture
    // apply to scene.environment or material.envMapNode
  })

  // or
  eventBus.on('source ready', this.onResourcesReady.bind(this))
}
```

## 8. Edge Cases & Non-Functional Requirements

- Empty sources array → immediate resolve + emit (no crash).
- Duplicate names → last loaded wins (documented, rare).
- Mixed success/failure → all successful items available; failed ones logged.
- Memory: All loaded objects stay in memory for the lifetime of the Experience (standard for game templates).
- Performance: Loaders run in parallel; no artificial throttling.
- Testing: Manual verification via `window.__experience.resources.items` in dev console.

## 9. Implementation Order (High-Level)

1. Add `mitt` dependency.
2. Create `event-bus.js`.
3. Create `Resources.js` with full type switch + loader wiring.
4. Create example `sources.js`.
5. Wire into `Experience`.
6. Update README or add usage note (optional, minimal scope).

## 10. Verification Checklist (after coding)

- [ ] `pnpm dev` starts without error.
- [ ] With 3 different resource types in sources.js, all appear in `items`.
- [ ] `resources.ready` resolves.
- [ ] `'source ready'` emitted exactly once.
- [ ] One resource failure does not prevent others or the event.
- [ ] Video resource plays correctly (no autoplay policy block).
- [ ] GLTF with Draco loads when decoder present.

## 11. Future Considerations (Explicitly Out of Scope)

- Progress reporting / loading screen.
- Resource unloading / hot reload.
- Custom loader plugins.
- Priority / streaming.
- Asset manifest generation from folder scan.

This design is intentionally narrow so it can be implemented in one focused session with TDD.

---

**Approval**: User replied "OK" on 2026-05-06. Ready for writing-plans skill invocation and implementation.