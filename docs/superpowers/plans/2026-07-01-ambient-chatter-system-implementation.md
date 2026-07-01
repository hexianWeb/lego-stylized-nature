# Ambient Chatter System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add non-blocking ambient chatter during free flight — biome-timed radio fragments with cooldowns, a compact HUD strip, and pause/resume coordination with the story record modal.

**Architecture:** `AmbientChatterManager` evaluates lightweight `biomeEnter` triggers and cooldowns each frame, emitting `chatter:show` on the shared `eventBus`. `AmbientChatterHUD` renders a small lower-left subtitle strip and auto-fades. Story record flow already emits `chatter:pause` / `chatter:resume` from `StoryRecordManager`; ambient systems listen and suppress output while modals are open.

**Tech Stack:** JavaScript ES modules, mitt event bus, DOM HUD classes, Node `node:test`, Vite.

---

## File Structure

- Create `src/story/ambientChatterContent.js`: ordered chatter lines and trigger metadata.
- Create `src/story/AmbientChatterManager.js`: trigger evaluation, cooldowns, pause/resume, `chatter:show` emission.
- Create `src/ui/AmbientChatterHUD.js`: non-blocking communication strip renderer.
- Modify `src/world/WorldConfig.js`: add `ui.ambientChatter` config block.
- Modify `src/world/world.js`: instantiate systems, resolve player biome, call `update()` / `dispose()`.
- Modify `src/style.css`: chatter strip styling (lower-left, below modal layer).
- Add tests:
  - `test/ambientChatterContent.test.js`
  - `test/ambientChatterManager.test.js`

**Dependencies:** `StoryRecordManager` already exports `CHATTER_PAUSE_EVENT` and `CHATTER_RESUME_EVENT`. No changes required there for MVP coordination.

**Biome resolution:** Reuse `BiomeMaskGenerator.getCellBiome(x, z)` from the existing world terrain pipeline. Convert player world position to cell coordinates with `Math.floor(position / cellSize)`.

---

### Task 1: Ambient Chatter Content

**Files:**
- Create: `src/story/ambientChatterContent.js`
- Test: `test/ambientChatterContent.test.js`

- [ ] **Step 1: Write content shape tests**

Create `test/ambientChatterContent.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { ambientChatterContent, AMBIENT_CHATTER_TRIGGERS } from '../src/story/ambientChatterContent.js'

test('exports a non-empty ordered chatter list', () => {
  assert.equal(Array.isArray(ambientChatterContent), true)
  assert.equal(ambientChatterContent.length > 0, true)
})

test('every entry has required fields', () => {
  for (const entry of ambientChatterContent) {
    assert.equal(typeof entry.id, 'string', entry.id)
    assert.equal(typeof entry.speaker, 'string', entry.id)
    assert.equal(typeof entry.text, 'string', entry.id)
    assert.equal(typeof entry.trigger, 'string', entry.id)
    assert.equal(AMBIENT_CHATTER_TRIGGERS.has(entry.trigger), true, `${entry.id}:${entry.trigger}`)
  }
})

test('biomeEnter entries declare biomeId', () => {
  for (const entry of ambientChatterContent.filter((line) => line.trigger === 'biomeEnter')) {
    assert.equal(typeof entry.biomeId, 'string', entry.id)
  }
})

test('includes forest slip and tower cover pair from spec', () => {
  const ids = ambientChatterContent.map((entry) => entry.id)
  assert.equal(ids.includes('forest_resource_slip_01'), true)
  assert.equal(ids.includes('forest_cover_01'), true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/ambientChatterContent.test.js`

Expected: FAIL with module not found for `src/story/ambientChatterContent.js`.

- [ ] **Step 3: Implement chatter content**

Create `src/story/ambientChatterContent.js`:

```js
export const AMBIENT_CHATTER_TRIGGERS = new Set([
  'afterIntro',
  'biomeEnter',
  'idleFlight',
  'nearTower',
  'afterChatter',
  'afterRecord'
])

export const ambientChatterContent = [
  {
    id: 'opening_beauty_01',
    trigger: 'afterIntro',
    speaker: 'Tower Signal',
    text: 'Look. This planet is still beautiful. Our retreat was correct.',
    playOnce: true,
    priority: 1
  },
  {
    id: 'forest_resource_slip_01',
    trigger: 'biomeEnter',
    biomeId: 'forest',
    speaker: 'Unknown Consciousness',
    text: 'So many trees... if only a small amount were harvested, no one would notice.',
    playOnce: true,
    priority: 2
  },
  {
    id: 'forest_cover_01',
    trigger: 'afterChatter',
    after: 'forest_resource_slip_01',
    delay: 3,
    speaker: 'Tower Signal',
    text: 'Please ignore the previous corrupted signal. Forest ecological status is healthy.',
    playOnce: true,
    priority: 3
  },
  {
    id: 'autumnForest_nostalgia_01',
    trigger: 'biomeEnter',
    biomeId: 'autumnForest',
    speaker: 'Unknown Consciousness',
    text: 'The colors here used to mean something. Now they mean inventory.',
    playOnce: true,
    priority: 2
  },
  {
    id: 'desert_thirst_01',
    trigger: 'biomeEnter',
    biomeId: 'desert',
    speaker: 'Archive Fragment',
    text: 'Groundwater reserves: acceptable. Surface moisture: irrelevant.',
    playOnce: true,
    priority: 2
  },
  {
    id: 'volcano_heat_01',
    trigger: 'biomeEnter',
    biomeId: 'volcano',
    speaker: 'Tower Signal',
    text: 'Geothermal output remains within sustainable extraction thresholds.',
    playOnce: true,
    priority: 2
  }
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/ambientChatterContent.test.js`

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/story/ambientChatterContent.js test/ambientChatterContent.test.js
git commit -m "feat: add ambient chatter content definitions"
```

---

### Task 2: AmbientChatterManager

**Files:**
- Create: `src/story/AmbientChatterManager.js`
- Test: `test/ambientChatterManager.test.js`

- [ ] **Step 1: Write manager tests**

Create `test/ambientChatterManager.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import mitt from 'mitt'
import AmbientChatterManager, { CHATTER_SHOW_EVENT } from '../src/story/AmbientChatterManager.js'
import { CHATTER_PAUSE_EVENT, CHATTER_RESUME_EVENT } from '../src/story/StoryRecordManager.js'

const testContent = [
  {
    id: 'forest_low',
    trigger: 'biomeEnter',
    biomeId: 'forest',
    speaker: 'Low Priority',
    text: 'low',
    playOnce: true,
    priority: 1
  },
  {
    id: 'forest_high',
    trigger: 'biomeEnter',
    biomeId: 'forest',
    speaker: 'High Priority',
    text: 'high',
    playOnce: true,
    priority: 5
  },
  {
    id: 'desert_once',
    trigger: 'biomeEnter',
    biomeId: 'desert',
    speaker: 'Desert',
    text: 'dry',
    playOnce: true,
    priority: 2
  }
]

function createHarness(content = testContent) {
  const bus = mitt()
  const shown = []
  const warnings = []
  const manager = new AmbientChatterManager({
    eventBus: bus,
    content,
    config: {
      biomeEnterSeconds: 2,
      cooldownSeconds: 10
    },
    logger: { warn: (message) => warnings.push(message) }
  })

  bus.on(CHATTER_SHOW_EVENT, (payload) => shown.push(payload))

  return { bus, manager, shown, warnings }
}

function dwellInBiome(manager, biomeId, seconds, step = 0.5) {
  let remaining = seconds
  while (remaining > 0) {
    const delta = Math.min(step, remaining)
    manager.update({ delta, biomeId })
    remaining -= delta
  }
}

test('emits chatter:show for eligible biome line after dwell time', () => {
  const { manager, shown } = createHarness()

  dwellInBiome(manager, 'forest', 2)

  assert.equal(shown.length, 1)
  assert.equal(shown[0].id, 'forest_high')
  assert.equal(shown[0].speaker, 'High Priority')
  assert.equal(shown[0].text, 'high')
})

test('does not emit while paused', () => {
  const { bus, manager, shown } = createHarness()

  bus.emit(CHATTER_PAUSE_EVENT, { source: 'story-record' })
  dwellInBiome(manager, 'forest', 3)

  assert.equal(shown.length, 0)
})

test('respects playOnce', () => {
  const { manager, shown } = createHarness([
    {
      id: 'desert_once',
      trigger: 'biomeEnter',
      biomeId: 'desert',
      speaker: 'Desert',
      text: 'dry',
      playOnce: true,
      priority: 2
    }
  ])

  dwellInBiome(manager, 'desert', 2)
  assert.equal(shown.length, 1)

  manager.update({ delta: 20, biomeId: 'desert' })
  assert.equal(shown.length, 1)
})

test('respects cooldown', () => {
  const { manager, shown } = createHarness([
    {
      id: 'forest_high',
      trigger: 'biomeEnter',
      biomeId: 'forest',
      speaker: 'High Priority',
      text: 'high',
      playOnce: false,
      priority: 5
    }
  ])

  dwellInBiome(manager, 'forest', 2)
  assert.equal(shown.length, 1)

  manager.update({ delta: 5, biomeId: 'forest' })
  assert.equal(shown.length, 1)

  manager.update({ delta: 6, biomeId: 'forest' })
  assert.equal(shown.length, 2)
})

test('chooses higher-priority eligible chatter', () => {
  const { manager, shown } = createHarness()

  dwellInBiome(manager, 'forest', 2)

  assert.equal(shown[0].id, 'forest_high')
})

test('removes event listeners in dispose()', () => {
  const { bus, manager } = createHarness()

  manager.dispose()
  bus.emit(CHATTER_PAUSE_EVENT, { source: 'story-record' })
  bus.emit(CHATTER_RESUME_EVENT, { source: 'story-record' })

  dwellInBiome(manager, 'forest', 2)
  assert.equal(manager.paused, false)
})

test('skips malformed entries with warning', () => {
  const { manager, shown, warnings } = createHarness([
    { trigger: 'biomeEnter', biomeId: 'forest' },
    {
      id: 'valid',
      trigger: 'biomeEnter',
      biomeId: 'forest',
      speaker: 'Valid',
      text: 'ok',
      priority: 1
    }
  ])

  dwellInBiome(manager, 'forest', 2)

  assert.equal(shown.length, 1)
  assert.equal(shown[0].id, 'valid')
  assert.equal(warnings.length, 1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/ambientChatterManager.test.js`

Expected: FAIL with module not found for `src/story/AmbientChatterManager.js`.

- [ ] **Step 3: Implement AmbientChatterManager**

Create `src/story/AmbientChatterManager.js`:

```js
import { eventBus as defaultEventBus } from '../utils/event-bus.js'
import { CHATTER_PAUSE_EVENT, CHATTER_RESUME_EVENT } from './StoryRecordManager.js'
import { ambientChatterContent } from './ambientChatterContent.js'

export const CHATTER_SHOW_EVENT = 'chatter:show'

const IMPLEMENTED_TRIGGERS = new Set(['biomeEnter'])

export default class AmbientChatterManager {
  constructor({
    eventBus = defaultEventBus,
    content = ambientChatterContent,
    config = {},
    logger = console
  } = {}) {
    this.eventBus = eventBus
    this.content = Array.isArray(content) ? content : []
    this.config = config
    this.logger = logger

    this.playedChatterIds = new Set()
    this.paused = false
    this.cooldownRemaining = 0
    this.currentBiomeId = null
    this.biomeDwellTime = 0

    this._onPause = () => {
      this.paused = true
    }

    this._onResume = () => {
      this.paused = false
    }

    this.eventBus.on(CHATTER_PAUSE_EVENT, this._onPause)
    this.eventBus.on(CHATTER_RESUME_EVENT, this._onResume)
  }

  update({ delta = 0, biomeId = null } = {}) {
    if (this.paused) {
      return
    }

    const frameDelta = Number.isFinite(delta) && delta > 0 ? delta : 0

    if (this.cooldownRemaining > 0) {
      this.cooldownRemaining = Math.max(0, this.cooldownRemaining - frameDelta)
    }

    if (!biomeId) {
      this.currentBiomeId = null
      this.biomeDwellTime = 0
      return
    }

    if (biomeId !== this.currentBiomeId) {
      this.currentBiomeId = biomeId
      this.biomeDwellTime = 0
    } else {
      this.biomeDwellTime += frameDelta
    }

    if (this.cooldownRemaining > 0) {
      return
    }

    const eligible = this.getEligibleChatter()
    if (!eligible) {
      return
    }

    this.playedChatterIds.add(eligible.id)
    this.cooldownRemaining = Number.isFinite(this.config.cooldownSeconds)
      ? this.config.cooldownSeconds
      : 45

    this.eventBus.emit(CHATTER_SHOW_EVENT, {
      id: eligible.id,
      speaker: eligible.speaker,
      text: eligible.text
    })
  }

  getEligibleChatter() {
    const dwellRequired = Number.isFinite(this.config.biomeEnterSeconds)
      ? this.config.biomeEnterSeconds
      : 4

    let best = null

    for (const entry of this.content) {
      if (!this.isValidEntry(entry)) {
        continue
      }

      if (entry.playOnce && this.playedChatterIds.has(entry.id)) {
        continue
      }

      if (!IMPLEMENTED_TRIGGERS.has(entry.trigger)) {
        continue
      }

      if (!this.isTriggerMet(entry, dwellRequired)) {
        continue
      }

      if (!best || (entry.priority ?? 0) > (best.priority ?? 0)) {
        best = entry
      }
    }

    return best
  }

  isValidEntry(entry) {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      typeof entry.text !== 'string' ||
      typeof entry.speaker !== 'string' ||
      typeof entry.trigger !== 'string'
    ) {
      this.logger.warn?.('[AmbientChatterManager] skipping malformed chatter entry.', entry)
      return false
    }

    return true
  }

  isTriggerMet(entry, dwellRequired) {
    if (entry.trigger === 'biomeEnter') {
      return entry.biomeId === this.currentBiomeId && this.biomeDwellTime >= dwellRequired
    }

    return false
  }

  dispose() {
    this.eventBus.off(CHATTER_PAUSE_EVENT, this._onPause)
    this.eventBus.off(CHATTER_RESUME_EVENT, this._onResume)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/ambientChatterManager.test.js`

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/story/AmbientChatterManager.js test/ambientChatterManager.test.js
git commit -m "feat: add ambient chatter manager with biome triggers and cooldowns"
```

---

### Task 3: AmbientChatterHUD and Styles

**Files:**
- Create: `src/ui/AmbientChatterHUD.js`
- Modify: `src/style.css`

- [ ] **Step 1: Implement AmbientChatterHUD**

Create `src/ui/AmbientChatterHUD.js`:

```js
import { eventBus as defaultEventBus } from '../utils/event-bus.js'
import { CHATTER_SHOW_EVENT } from '../story/AmbientChatterManager.js'
import { CHATTER_PAUSE_EVENT } from '../story/StoryRecordManager.js'

export const CHATTER_HIDDEN_EVENT = 'chatter:hidden'

export default class AmbientChatterHUD {
  constructor({ config, eventBus = defaultEventBus, parent = null } = {}) {
    this.config = config
    this.chatterConfig = config?.ui?.ambientChatter ?? {}
    this.enabled = this.chatterConfig.enabled !== false
    this.eventBus = eventBus
    this.parent = parent ?? (typeof document !== 'undefined' ? document.body : null)
    this.hideTimer = null
    this.visible = false

    this._onShow = (payload) => this.show(payload)
    this._onPause = () => this.hide(true)

    if (!this.enabled || typeof document === 'undefined' || !this.parent) {
      return
    }

    this.eventBus.on(CHATTER_SHOW_EVENT, this._onShow)
    this.eventBus.on(CHATTER_PAUSE_EVENT, this._onPause)

    this.element = document.createElement('div')
    this.element.className = 'ambient-chatter-hud'
    this.element.setAttribute('aria-live', 'polite')
    this.element.hidden = true

    this.speakerElement = document.createElement('span')
    this.speakerElement.className = 'ambient-chatter-hud__speaker'

    this.textElement = document.createElement('p')
    this.textElement.className = 'ambient-chatter-hud__text'

    this.element.appendChild(this.speakerElement)
    this.element.appendChild(this.textElement)
    this.parent.appendChild(this.element)
  }

  show({ speaker = '', text = '' } = {}) {
    if (!this.enabled || !this.element) {
      return
    }

    this.clearHideTimer()
    this.speakerElement.textContent = speaker ? `[${speaker}]` : ''
    this.textElement.textContent = text
    this.element.hidden = false
    this.element.classList.remove('ambient-chatter-hud--fading')
    this.visible = true

    const displaySeconds = Number.isFinite(this.chatterConfig.displaySeconds)
      ? this.chatterConfig.displaySeconds
      : 4

    this.hideTimer = setTimeout(() => this.hide(false), displaySeconds * 1000)
  }

  hide(immediate = false) {
    if (!this.enabled || !this.element || !this.visible) {
      this.clearHideTimer()
      return
    }

    this.clearHideTimer()

    if (immediate) {
      this.finishHide()
      return
    }

    this.element.classList.add('ambient-chatter-hud--fading')
    this.hideTimer = setTimeout(() => this.finishHide(), 350)
  }

  finishHide() {
    if (!this.element) {
      return
    }

    this.element.hidden = true
    this.element.classList.remove('ambient-chatter-hud--fading')
    this.visible = false
    this.eventBus.emit(CHATTER_HIDDEN_EVENT, {})
  }

  clearHideTimer() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
  }

  dispose() {
    this.clearHideTimer()
    this.eventBus.off(CHATTER_SHOW_EVENT, this._onShow)
    this.eventBus.off(CHATTER_PAUSE_EVENT, this._onPause)
    this.element?.remove()
    this.element = null
    this.speakerElement = null
    this.textElement = null
  }
}
```

- [ ] **Step 2: Add CSS**

Append to `src/style.css`:

```css
.ambient-chatter-hud
{
    position: fixed;
    left: 75px;
    bottom: 48px;
    z-index: 3;
    max-width: min(520px, calc(100vw - 150px));
    padding: 10px 14px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.62);
    color: #ffffff;
    font-family: "Orbitron", sans-serif;
    pointer-events: none;
    user-select: none;
    box-sizing: border-box;
    opacity: 1;
    transition: opacity 0.35s ease;
}

.ambient-chatter-hud--fading
{
    opacity: 0;
}

.ambient-chatter-hud__speaker
{
    display: block;
    margin-bottom: 6px;
    color: rgba(255, 255, 255, 0.72);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.ambient-chatter-hud__text
{
    margin: 0;
    font-size: 14px;
    line-height: 1.45;
    letter-spacing: 0.02em;
}
```

Placement notes:
- Lower-left at `left: 75px; bottom: 48px` keeps clear of the biome radar (`top: 75px; left: 75px`) and the right-side control guide.
- `z-index: 3` stays below story modals (`z-index: 20` from story record plan).

- [ ] **Step 3: Commit**

```bash
git add src/ui/AmbientChatterHUD.js src/style.css
git commit -m "feat: add ambient chatter HUD strip and styles"
```

---

### Task 4: WorldConfig

**Files:**
- Modify: `src/world/WorldConfig.js`

- [ ] **Step 1: Add ambient chatter UI config**

Inside the existing `ui` object in `src/world/WorldConfig.js`, after `biomeRadar`, add:

```js
ambientChatter: {
  enabled: true,
  displaySeconds: 4,
  cooldownSeconds: 45,
  biomeEnterSeconds: 4
},
```

- [ ] **Step 2: Commit**

```bash
git add src/world/WorldConfig.js
git commit -m "feat: add ambient chatter UI config"
```

---

### Task 5: World Integration

**Files:**
- Modify: `src/world/world.js`

- [ ] **Step 1: Import and instantiate systems**

Add imports near the top of `src/world/world.js`:

```js
import AmbientChatterManager from '../story/AmbientChatterManager.js'
import AmbientChatterHUD from '../ui/AmbientChatterHUD.js'
```

Add constructor fields:

```js
this.ambientChatterManager = null
this.ambientChatterHUD = null
```

Inside `build()`, after control guide HUD creation, add:

```js
if (!this.ambientChatterManager && this.config.ui?.ambientChatter?.enabled !== false) {
    this.ambientChatterManager = new AmbientChatterManager({
        config: this.config.ui.ambientChatter
    })
}

if (!this.ambientChatterHUD && this.config.ui?.ambientChatter?.enabled !== false) {
    this.ambientChatterHUD = new AmbientChatterHUD({ config: this.config })
}
```

- [ ] **Step 2: Resolve player biome and call manager update**

Add helper method to `World`:

```js
resolvePlayerBiomeId() {
    const position = this.playerAircraft?.state?.position

    if (!position || !this.biomeMaskGenerator) {
        return null
    }

    const cellSize = this.config.terrain.cellSize
    const x = Math.floor(position.x / cellSize)
    const z = Math.floor(position.z / cellSize)

    return this.biomeMaskGenerator.getCellBiome(x, z).biomeId
}
```

Inside `update()`, after biome center system update, add:

```js
if (this.ambientChatterManager && this.playerAircraft?.enabled) {
    this.ambientChatterManager.update({
        delta: this.experience.time.getDelta(),
        biomeId: this.resolvePlayerBiomeId()
    })
}
```

- [ ] **Step 3: Dispose systems**

Inside `dispose()`, add before clearing references:

```js
this.ambientChatterManager?.dispose()
this.ambientChatterHUD?.dispose()
this.ambientChatterManager = null
this.ambientChatterHUD = null
```

- [ ] **Step 4: Run full test suite**

Run: `npm test`

Expected: all tests pass, including new ambient chatter tests and existing story record tests.

- [ ] **Step 5: Commit**

```bash
git add src/world/world.js
git commit -m "feat: wire ambient chatter manager and HUD into world update loop"
```

---

### Task 6: Manual Verification

**Files:** none (browser check only)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify biome chatter in forest**

1. Fly in the forest biome near origin for at least 4 seconds without opening story modals.
2. Confirm a lower-left strip appears like `[UNKNOWN CONSCIOUSNESS] So many trees...`.
3. Confirm controls remain responsive (no `controls:lock` from chatter).

- [ ] **Step 3: Verify cooldown**

1. Stay in forest and wait.
2. Confirm a second line does not appear until roughly 45 seconds after the first.

- [ ] **Step 4: Verify pause during story modal**

If `StoryRecordManager` / `StoryRecordModalHUD` are integrated:

1. Trigger a story record modal.
2. Confirm any visible chatter hides immediately.
3. Close the modal and confirm chatter can appear again after dwell + cooldown rules allow it.

If story modal HUD is not yet integrated, manually verify pause wiring:

```js
// In browser devtools while game is running:
import { eventBus } from '/src/utils/event-bus.js'
eventBus.emit('chatter:pause')
// strip should hide; no new lines while paused
eventBus.emit('chatter:resume')
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|---|---|
| Non-blocking ambient chatter during exploration | Task 2, 3, 5 |
| Condition + cooldown driven (not random) | Task 2 |
| `ambientChatterContent.js` separate from WorldConfig | Task 1 |
| Timed `biomeEnter` trigger (MVP) | Task 2 |
| Other trigger types in content shape only | Task 1 |
| `chatter:show` / `chatter:hidden` events | Task 2, 3 |
| `chatter:pause` / `chatter:resume` coordination | Task 2 (listen), Task 3 (hide on pause) |
| No `controls:lock` from chatter | Task 3 (never emitted) |
| World instantiate / update / dispose | Task 5 |
| `ui.ambientChatter` config block | Task 4 |
| Manager node tests | Task 2 |
| HUD DOM tests optional (manual first pass) | Task 6 |

## Out of Scope (Do Not Implement)

- `afterChatter`, `afterIntro`, `idleFlight`, `nearTower`, `afterRecord` trigger evaluation
- Persistent save of played chatter
- Dialogue choices, archives, voice playback, localization
- Browser end-to-end test harness for HUD

---

Plan complete and saved to `docs/superpowers/plans/2026-07-01-ambient-chatter-system-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
