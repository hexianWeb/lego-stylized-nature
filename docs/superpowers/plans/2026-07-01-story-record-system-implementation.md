# Story Record System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the linear mainline Story Record system: opening signal, guided tower activation, 5-page tower records, final revival-protocol reveal, and control locking.

**Architecture:** Keep `BiomeCenterSystem` as space/input detection, `StoryRecordManager` as mainline state, and HUD classes as DOM/canvas renderers. Use the existing `eventBus` for tower interaction, objective guidance, modal display, chatter pause/resume, and control locking.

**Tech Stack:** JavaScript ES modules, Three.js WebGPU, mitt event bus, DOM HUD classes, Node `node:test`, Vite.

---

## File Structure

- Create `src/story/mainStoryContent.js`: mainline content and fixed tower order.
- Create `src/story/StoryRecordManager.js`: mainline state machine, objective events, record validation, and final reveal trigger.
- Create `src/ui/StoryRecordModalHUD.js`: blocking modal with page navigation.
- Create `src/ui/StoryObjectiveHUD.js`: compact objective and activation prompt.
- Modify `src/world/biomes/BiomeCenterSystem.js`: emit entered/exited/activate events and track nearby tower only.
- Modify `src/ui/BiomeRadarHUD.js`: listen for objective updates and highlight current target.
- Modify `src/world/world.js`: instantiate story systems, apply control lock, update/dispose systems.
- Modify `src/world/WorldConfig.js`: add `ui.storyRecord`, `ui.storyObjective`, and tower interaction config if needed.
- Modify `src/style.css`: add story modal and objective HUD styling.
- Add or update tests:
  - `test/storyRecordManager.test.js`
  - `test/biomeCenterSystem.test.js`
  - Optional lightweight `test/mainStoryContent.test.js`

Image assets are already present:

- `public/story/forest-evidence.png`
- `public/story/badlands-evidence.png`
- `public/story/desert-evidence.png`
- `public/story/volcano-evidence.png`

---

### Task 1: Main Story Content

**Files:**
- Create: `src/story/mainStoryContent.js`
- Test: `test/mainStoryContent.test.js`

- [ ] **Step 1: Write content shape tests**

Create `test/mainStoryContent.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { mainStoryContent, STORY_RECORD_PAGE_TYPES } from '../src/story/mainStoryContent.js'

test('defines fixed mainline tower order', () => {
  assert.deepEqual(mainStoryContent.towerOrder, ['forest', 'badlands', 'desert', 'volcano'])
})

test('defines opening story, four tower records, and final reveal', () => {
  assert.equal(Boolean(mainStoryContent.openingStory), true)
  assert.equal(Boolean(mainStoryContent.finalReveal), true)
  assert.deepEqual(Object.keys(mainStoryContent.towerRecords), [
    'forest',
    'badlands',
    'desert',
    'volcano'
  ])
})

test('all records contain playable pages with supported types', () => {
  const records = [
    mainStoryContent.openingStory,
    ...Object.values(mainStoryContent.towerRecords),
    mainStoryContent.finalReveal
  ]

  for (const record of records) {
    assert.equal(typeof record.id, 'string')
    assert.equal(typeof record.title, 'string')
    assert.equal(Array.isArray(record.pages), true)
    assert.equal(record.pages.length > 0, true)

    for (const page of record.pages) {
      assert.equal(STORY_RECORD_PAGE_TYPES.has(page.type), true, `${record.id}:${page.type}`)
    }
  }
})

test('tower records point at provided comic images', () => {
  assert.equal(mainStoryContent.towerRecords.forest.pages.some((page) => page.image === '/story/forest-evidence.png'), true)
  assert.equal(mainStoryContent.towerRecords.badlands.pages.some((page) => page.image === '/story/badlands-evidence.png'), true)
  assert.equal(mainStoryContent.towerRecords.desert.pages.some((page) => page.image === '/story/desert-evidence.png'), true)
  assert.equal(mainStoryContent.towerRecords.volcano.pages.some((page) => page.image === '/story/volcano-evidence.png'), true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/mainStoryContent.test.js`

Expected: FAIL with module not found for `src/story/mainStoryContent.js`.

- [ ] **Step 3: Implement story content**

Create `src/story/mainStoryContent.js`:

```js
export const STORY_RECORD_PAGE_TYPES = new Set([
  'signal',
  'towerSignal',
  'shipScanner',
  'comic',
  'archiveLog',
  'towerResponse',
  'protocol'
])

export const mainStoryContent = {
  openingStory: {
    id: 'opening',
    title: 'Incoming Tower Signal',
    kind: 'openingStory',
    pages: [
      {
        type: 'signal',
        speaker: 'TOWER SIGNAL',
        text: 'Alien visitor, thank you for answering our signal.'
      },
      {
        type: 'signal',
        speaker: 'TOWER SIGNAL',
        text: 'We were once the civilization of this planet. When we understood that nature should not belong to us forever, we uploaded our consciousness and left the surface.'
      },
      {
        type: 'signal',
        speaker: 'TOWER SIGNAL',
        text: 'Now the ecology has recovered. Some of us wish to feel wind, water, sunlight, and soil again.'
      },
      {
        type: 'signal',
        speaker: 'TOWER SIGNAL',
        text: 'Please help us activate the four ecological consciousness towers.'
      }
    ]
  },
  towerOrder: ['forest', 'badlands', 'desert', 'volcano'],
  towerRecords: {
    forest: {
      id: 'forest',
      title: 'Forest Evidence',
      kind: 'towerRecord',
      towerId: 'forest',
      objectiveLabel: 'Proceed to the Forest Consciousness Tower',
      activationLabel: 'Press E to activate the Forest Consciousness Tower',
      pages: [
        { type: 'towerSignal', speaker: 'TOWER SIGNAL', text: 'Forest ecological center restored. Please begin ecological validation.' },
        { type: 'shipScanner', speaker: 'SHIP SCANNER', text: 'Hidden archive layer detected. Data state: partially deleted. Rebuilding visual record.' },
        { type: 'comic', image: '/story/forest-evidence.png', alt: 'Four-stage record of forest biomass extraction.' },
        { type: 'archiveLog', source: 'HIDDEN ARCHIVE 01', text: 'Biomass output efficiency increased to 312%. Forest self-repair continued to decline. Management conclusion: continue extraction.' },
        { type: 'towerResponse', speaker: 'TOWER SIGNAL', text: 'This record is incomplete. Please do not judge us from damaged fragments.' }
      ]
    },
    badlands: {
      id: 'badlands',
      title: 'Badlands Evidence',
      kind: 'towerRecord',
      towerId: 'autumnForest',
      objectiveLabel: 'Proceed to the Badlands Consciousness Tower',
      activationLabel: 'Press E to activate the Badlands Consciousness Tower',
      pages: [
        { type: 'towerSignal', speaker: 'TOWER SIGNAL', text: 'Mineral belt ecology is stable. These strata record the planet through deep natural time.' },
        { type: 'shipScanner', speaker: 'SHIP SCANNER', text: 'Sealed industrial sediment record detected. Pollution data matches current terrain layers.' },
        { type: 'comic', image: '/story/badlands-evidence.png', alt: 'Four-stage record of mining waste and polluted sediment.' },
        { type: 'archiveLog', source: 'HIDDEN ARCHIVE 02', text: 'Waste redirected into low ecological value regions. Pollution sediment irreversible. Management conclusion: regional sacrifice acceptable.' },
        { type: 'towerResponse', speaker: 'TOWER SIGNAL', text: 'Those were the standards of an older age. We no longer understand nature in the same way.' }
      ]
    },
    desert: {
      id: 'desert',
      title: 'Desert Evidence',
      kind: 'towerRecord',
      towerId: 'desert',
      objectiveLabel: 'Proceed to the Desert Consciousness Tower',
      activationLabel: 'Press E to activate the Desert Consciousness Tower',
      pages: [
        { type: 'towerSignal', speaker: 'TOWER SIGNAL', text: 'Desert water circulation is stabilizing. The oasis systems are returning.' },
        { type: 'shipScanner', speaker: 'SHIP SCANNER', text: 'Old water table record detected. Current desertification overlaps historical extraction networks.' },
        { type: 'comic', image: '/story/desert-evidence.png', alt: 'Four-stage record of groundwater extraction and water-cycle collapse.' },
        { type: 'archiveLog', source: 'HIDDEN ARCHIVE 03', text: 'Groundwater level continued to fall. Extraction quota unchanged. Water-cycle model failed. Management conclusion: protect core cities first.' },
        { type: 'towerResponse', speaker: 'TOWER SIGNAL', text: 'We believed technology could compensate for every loss. That belief was wrong. Please continue. One tower remains.' }
      ]
    },
    volcano: {
      id: 'volcano',
      title: 'Volcano Evidence',
      kind: 'towerRecord',
      towerId: 'volcano',
      objectiveLabel: 'Proceed to the Volcano Consciousness Tower',
      activationLabel: 'Press E to activate the Volcano Consciousness Tower',
      pages: [
        { type: 'towerSignal', speaker: 'TOWER SIGNAL', text: 'Geothermal fluctuation persists. The life re-gestation system requires core heat validation.' },
        { type: 'shipScanner', speaker: 'SHIP SCANNER', text: 'Core energy extraction record detected. Safety thresholds were overridden multiple times.' },
        { type: 'comic', image: '/story/volcano-evidence.png', alt: 'Four-stage record of geothermal over-extraction.' },
        { type: 'archiveLog', source: 'HIDDEN ARCHIVE 04', text: 'Geothermal output exceeded safe threshold. Core pressure abnormal. Stopping extraction would collapse civilization energy systems. Management conclusion: continue extraction.' },
        { type: 'towerResponse', speaker: 'TOWER SIGNAL', text: 'Yes. We knew the risk. By then, we could no longer stop.' }
      ]
    }
  },
  finalReveal: {
    id: 'finalReveal',
    title: 'Revival Protocol',
    kind: 'finalReveal',
    pages: [
      { type: 'protocol', speaker: 'GLOBAL TOWER LINK ESTABLISHED', text: 'Forest tower: biomass reconstruction module connected.\nBadlands tower: mineral skeleton module connected.\nDesert tower: fluid-cycle module connected.\nVolcano tower: gestation energy module connected.' },
      { type: 'protocol', speaker: 'REVIVAL PROTOCOL', text: 'Ecological validation complete.\nLife re-gestation system awaiting authorization.' },
      { type: 'towerResponse', speaker: 'CONSCIOUSNESS TOWER', text: 'You now know enough. We harmed this planet. That is why we left the surface and let it regrow. Some of us wish to receive bodies again.' },
      { type: 'protocol', speaker: 'REVIVAL PROTOCOL', text: 'Authorization required.\nDecision pending.' }
    ]
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/mainStoryContent.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/story/mainStoryContent.js test/mainStoryContent.test.js
git commit -m "feat: add main story content"
```

---

### Task 2: StoryRecordManager State Machine

**Files:**
- Create: `src/story/StoryRecordManager.js`
- Test: `test/storyRecordManager.test.js`

- [ ] **Step 1: Write failing manager tests**

Create `test/storyRecordManager.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import mitt from 'mitt'
import StoryRecordManager, {
  STORY_RECORD_SHOW_EVENT,
  STORY_RECORD_CLOSED_EVENT,
  STORY_OBJECTIVE_UPDATE_EVENT,
  STORY_OBJECTIVE_BLOCKED_EVENT
} from '../src/story/StoryRecordManager.js'

const content = {
  openingStory: {
    id: 'opening',
    title: 'Opening',
    kind: 'openingStory',
    pages: [{ type: 'signal', text: 'open' }]
  },
  towerOrder: ['forest', 'badlands'],
  towerRecords: {
    forest: {
      id: 'forest',
      title: 'Forest',
      kind: 'towerRecord',
      towerId: 'forest',
      objectiveLabel: 'Go forest',
      activationLabel: 'Press E forest',
      pages: [{ type: 'towerSignal', text: 'forest' }]
    },
    badlands: {
      id: 'badlands',
      title: 'Badlands',
      kind: 'towerRecord',
      towerId: 'autumnForest',
      objectiveLabel: 'Go badlands',
      activationLabel: 'Press E badlands',
      pages: [{ type: 'towerSignal', text: 'badlands' }]
    }
  },
  finalReveal: {
    id: 'finalReveal',
    title: 'Final',
    kind: 'finalReveal',
    pages: [{ type: 'protocol', text: 'final' }]
  }
}

function createHarness(customContent = content) {
  const bus = mitt()
  const shown = []
  const objectives = []
  const blocked = []
  const manager = new StoryRecordManager({ eventBus: bus, content: customContent })

  bus.on(STORY_RECORD_SHOW_EVENT, (payload) => shown.push(payload))
  bus.on(STORY_OBJECTIVE_UPDATE_EVENT, (payload) => objectives.push(payload))
  bus.on(STORY_OBJECTIVE_BLOCKED_EVENT, (payload) => blocked.push(payload))

  return { bus, manager, shown, objectives, blocked }
}

test('requests opening story on start and then targets forest', () => {
  const { bus, manager, shown, objectives } = createHarness()

  manager.start()
  assert.equal(shown[0].record.id, 'opening')

  bus.emit(STORY_RECORD_CLOSED_EVENT, { recordId: 'opening', kind: 'openingStory' })
  assert.equal(objectives.at(-1).objectiveId, 'forest')
  assert.equal(objectives.at(-1).label, 'Go forest')
})

test('blocks non-current tower activation', () => {
  const { bus, manager, blocked, shown } = createHarness()

  manager.start()
  bus.emit(STORY_RECORD_CLOSED_EVENT, { recordId: 'opening', kind: 'openingStory' })
  bus.emit('biome-center:activate', { towerId: 'desert', storyId: 'desert' })

  assert.equal(blocked.length, 1)
  assert.equal(blocked[0].requiredObjectiveId, 'forest')
  assert.equal(shown.length, 1)
})

test('plays current tower and advances to next objective when closed', () => {
  const { bus, manager, shown, objectives } = createHarness()

  manager.start()
  bus.emit(STORY_RECORD_CLOSED_EVENT, { recordId: 'opening', kind: 'openingStory' })
  bus.emit('biome-center:activate', { towerId: 'forest', storyId: 'forest' })
  assert.equal(shown.at(-1).record.id, 'forest')

  bus.emit(STORY_RECORD_CLOSED_EVENT, { recordId: 'forest', kind: 'towerRecord' })
  assert.equal(objectives.at(-1).objectiveId, 'badlands')
})

test('plays final reveal after all tower records close', () => {
  const { bus, manager, shown } = createHarness()

  manager.start()
  bus.emit(STORY_RECORD_CLOSED_EVENT, { recordId: 'opening', kind: 'openingStory' })
  bus.emit('biome-center:activate', { towerId: 'forest', storyId: 'forest' })
  bus.emit(STORY_RECORD_CLOSED_EVENT, { recordId: 'forest', kind: 'towerRecord' })
  bus.emit('biome-center:activate', { towerId: 'autumnForest', storyId: 'badlands' })
  bus.emit(STORY_RECORD_CLOSED_EVENT, { recordId: 'badlands', kind: 'towerRecord' })

  assert.equal(shown.at(-1).record.id, 'finalReveal')

  bus.emit(STORY_RECORD_CLOSED_EVENT, { recordId: 'finalReveal', kind: 'finalReveal' })
  assert.equal(manager.state.decisionPending, true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/storyRecordManager.test.js`

Expected: FAIL with module not found for `src/story/StoryRecordManager.js`.

- [ ] **Step 3: Implement manager**

Create `src/story/StoryRecordManager.js`:

```js
import { eventBus as defaultEventBus } from '../utils/event-bus.js'
import { mainStoryContent, STORY_RECORD_PAGE_TYPES } from './mainStoryContent.js'

export const STORY_RECORD_SHOW_EVENT = 'story-record:show'
export const STORY_RECORD_CLOSED_EVENT = 'story-record:closed'
export const STORY_OBJECTIVE_UPDATE_EVENT = 'story-objective:update'
export const STORY_OBJECTIVE_BLOCKED_EVENT = 'story-objective:blocked'
export const CHATTER_PAUSE_EVENT = 'chatter:pause'
export const CHATTER_RESUME_EVENT = 'chatter:resume'
export const CONTROLS_LOCK_EVENT = 'controls:lock'
export const CONTROLS_UNLOCK_EVENT = 'controls:unlock'

export default class StoryRecordManager {
  constructor({ eventBus = defaultEventBus, content = mainStoryContent, logger = console } = {}) {
    this.eventBus = eventBus
    this.content = content
    this.logger = logger
    this.state = {
      introPlayed: false,
      completedRecords: new Set(),
      activeRecordId: null,
      finalRevealPlayed: false,
      currentObjectiveId: null,
      nearbyTower: null,
      decisionPending: false
    }

    this._onTowerEntered = (payload) => this.handleTowerEntered(payload)
    this._onTowerExited = (payload) => this.handleTowerExited(payload)
    this._onTowerActivate = (payload) => this.handleTowerActivate(payload)
    this._onRecordClosed = (payload) => this.handleRecordClosed(payload)

    this.eventBus.on('biome-center:entered', this._onTowerEntered)
    this.eventBus.on('biome-center:exited', this._onTowerExited)
    this.eventBus.on('biome-center:activate', this._onTowerActivate)
    this.eventBus.on(STORY_RECORD_CLOSED_EVENT, this._onRecordClosed)
  }

  start() {
    if (this.state.introPlayed) {
      return
    }

    const opening = this.normalizeRecord(this.content.openingStory)
    if (!opening) {
      this.logger.warn?.('[StoryRecordManager] Missing openingStory; starting at forest objective.')
      this.state.introPlayed = true
      this.setCurrentObjective(this.content.towerOrder?.[0] ?? null)
      return
    }

    this.showRecord(opening)
  }

  normalizeRecord(record) {
    if (!record || !Array.isArray(record.pages)) {
      return null
    }

    const pages = record.pages.filter((page) => STORY_RECORD_PAGE_TYPES.has(page.type))
    if (pages.length === 0) {
      return null
    }

    return { ...record, pages }
  }

  showRecord(record) {
    if (!record || this.state.activeRecordId) {
      return
    }

    this.state.activeRecordId = record.id
    this.eventBus.emit(CHATTER_PAUSE_EVENT, { source: 'story-record' })
    this.eventBus.emit(STORY_RECORD_SHOW_EVENT, { record })
  }

  handleTowerEntered(payload = {}) {
    this.state.nearbyTower = payload
    this.emitObjective({ canActivate: this.isCurrentTower(payload) })
  }

  handleTowerExited(payload = {}) {
    if (this.state.nearbyTower?.towerId === payload.towerId) {
      this.state.nearbyTower = null
    }
    this.emitObjective({ canActivate: false })
  }

  handleTowerActivate(payload = {}) {
    if (this.state.activeRecordId) {
      return
    }

    if (!this.isCurrentTower(payload)) {
      this.eventBus.emit(STORY_OBJECTIVE_BLOCKED_EVENT, {
        towerId: payload.towerId,
        requiredObjectiveId: this.state.currentObjectiveId,
        message: 'SYNC LOCKED: complete the current ecological validation first.'
      })
      return
    }

    const record = this.normalizeRecord(this.content.towerRecords?.[this.state.currentObjectiveId])
    if (!record) {
      this.logger.warn?.(`[StoryRecordManager] Missing tower record "${this.state.currentObjectiveId}".`)
      this.emitObjective({ canActivate: true, message: 'Archive data missing.' })
      return
    }

    this.showRecord(record)
  }

  handleRecordClosed({ recordId, kind } = {}) {
    this.state.activeRecordId = null
    this.eventBus.emit(CHATTER_RESUME_EVENT, { source: 'story-record' })

    if (kind === 'openingStory' || recordId === this.content.openingStory?.id) {
      this.state.introPlayed = true
      this.setCurrentObjective(this.content.towerOrder?.[0] ?? null)
      return
    }

    if (kind === 'towerRecord' && recordId) {
      this.state.completedRecords.add(recordId)
      this.advanceAfterTower(recordId)
      return
    }

    if (kind === 'finalReveal' || recordId === this.content.finalReveal?.id) {
      this.state.finalRevealPlayed = true
      this.state.decisionPending = true
    }
  }

  advanceAfterTower(recordId) {
    const order = this.content.towerOrder ?? []
    const index = order.indexOf(recordId)
    const next = order[index + 1]

    if (next) {
      this.setCurrentObjective(next)
      return
    }

    if (!this.state.finalRevealPlayed) {
      const finalReveal = this.normalizeRecord(this.content.finalReveal) ?? this.createFallbackFinalReveal()
      this.showRecord(finalReveal)
    }
  }

  createFallbackFinalReveal() {
    return {
      id: 'finalReveal',
      title: 'Revival Protocol',
      kind: 'finalReveal',
      pages: [
        {
          type: 'protocol',
          speaker: 'REVIVAL PROTOCOL',
          text: 'Authorization required.\nDecision pending.'
        }
      ]
    }
  }

  setCurrentObjective(objectiveId) {
    this.state.currentObjectiveId = objectiveId
    this.emitObjective({ canActivate: this.isCurrentTower(this.state.nearbyTower) })
  }

  isCurrentTower(payload = null) {
    if (!payload || !this.state.currentObjectiveId) {
      return false
    }

    const record = this.content.towerRecords?.[this.state.currentObjectiveId]
    return payload.storyId === this.state.currentObjectiveId || payload.towerId === record?.towerId
  }

  emitObjective(overrides = {}) {
    const objectiveId = this.state.currentObjectiveId
    if (!objectiveId) {
      return
    }

    const record = this.content.towerRecords?.[objectiveId]
    this.eventBus.emit(STORY_OBJECTIVE_UPDATE_EVENT, {
      objectiveId,
      towerId: record?.towerId ?? objectiveId,
      label: record?.objectiveLabel ?? `Proceed to ${objectiveId}`,
      activationLabel: record?.activationLabel ?? `Press E to activate ${objectiveId}`,
      canActivate: false,
      ...overrides
    })
  }

  dispose() {
    this.eventBus.off('biome-center:entered', this._onTowerEntered)
    this.eventBus.off('biome-center:exited', this._onTowerExited)
    this.eventBus.off('biome-center:activate', this._onTowerActivate)
    this.eventBus.off(STORY_RECORD_CLOSED_EVENT, this._onRecordClosed)
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- test/storyRecordManager.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/story/StoryRecordManager.js test/storyRecordManager.test.js
git commit -m "feat: add story record manager"
```

---

### Task 3: BiomeCenterSystem Interaction Events

**Files:**
- Modify: `src/world/biomes/BiomeCenterSystem.js`
- Modify: `test/biomeCenterSystem.test.js`

- [ ] **Step 1: Add failing tests for entered/exited/activate**

Append to `test/biomeCenterSystem.test.js`:

```js
test('emits entered exited and activate events for tower interaction', () => {
  const asset = createTowerAsset()
  const events = []
  const inputTarget = new EventTarget()
  const system = new BiomeCenterSystem({
    config: {
      terrain: { cellSize: 1, layerHeight: 1 },
      biomes: { regions: [{ id: 'forest', center: [0, 0] }] },
      biomeCenters: {
        enabled: true,
        assetName: 'biomeTowerModel',
        triggerRadius: 3,
        lightMeshName: 'light',
        towers: {
          forest: {
            storyAlias: 'forest',
            light: { color: '#43ff7a', emissiveIntensity: 1.8 },
            log: 'Forest validation reached'
          }
        }
      }
    },
    resources: { items: { biomeTowerModel: asset } },
    terrainGenerator: createTerrainGenerator(0),
    inputTarget,
    eventBus: {
      emit: (type, payload) => events.push({ type, payload })
    },
    logger: () => {}
  })

  system.build()
  system.update(new THREE.Vector3(10, 0, 0))
  system.update(new THREE.Vector3(2, 0, 0))
  inputTarget.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))
  system.update(new THREE.Vector3(10, 0, 0))

  assert.deepEqual(events.map((event) => event.type), [
    'biome-center:entered',
    'biome-center:activate',
    'biome-center:exited'
  ])
  assert.equal(events[0].payload.towerId, 'forest')
  assert.equal(events[0].payload.storyId, 'forest')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/biomeCenterSystem.test.js`

Expected: FAIL because `BiomeCenterSystem` does not accept `eventBus/inputTarget` or emit these events yet.

- [ ] **Step 3: Implement event support**

Modify `src/world/biomes/BiomeCenterSystem.js`:

```js
import { eventBus as defaultEventBus } from '../../utils/event-bus.js'

export const BIOME_CENTER_ENTERED_EVENT = 'biome-center:entered'
export const BIOME_CENTER_EXITED_EVENT = 'biome-center:exited'
export const BIOME_CENTER_ACTIVATE_EVENT = 'biome-center:activate'
```

Update constructor:

```js
constructor({
  config,
  resources,
  terrainGenerator,
  logger = (message) => console.log(message),
  eventBus = defaultEventBus,
  inputTarget = globalThis.window ?? null
}) {
  this.config = config
  this.resources = resources
  this.terrainGenerator = terrainGenerator
  this.logger = logger
  this.eventBus = eventBus
  this.inputTarget = inputTarget
  this.group = new THREE.Group()
  this.group.name = 'BiomeCenterSystem'
  this.towers = []
  this.nearbyTowerId = null
  this.lightMaterials = []
  this._missingAssetWarned = false
  this._onKeyDown = (event) => this.handleKeyDown(event)
  this.inputTarget?.addEventListener?.('keydown', this._onKeyDown)
}
```

When pushing towers in `build()`, include story id:

```js
this.towers.push({
  id: region.id,
  towerId: region.id,
  storyId: towerConfig.storyAlias ?? region.id,
  model,
  position,
  log: towerConfig.log ?? `${region.id} validation reached`,
  triggerRadius: Number.isFinite(centerConfig.triggerRadius)
    ? centerConfig.triggerRadius
    : 3
})
```

Replace update trigger logic:

```js
update(playerPosition = null) {
  if (!playerPosition) {
    return
  }

  const nearestTower = this.findNearestTowerInRange(playerPosition)
  const nextTowerId = nearestTower?.towerId ?? null

  if (nextTowerId !== this.nearbyTowerId) {
    if (this.nearbyTowerId) {
      const previous = this.towers.find((tower) => tower.towerId === this.nearbyTowerId)
      if (previous) {
        this.emitTowerEvent(BIOME_CENTER_EXITED_EVENT, previous)
      }
    }

    if (nearestTower) {
      this.emitTowerEvent(BIOME_CENTER_ENTERED_EVENT, nearestTower)
      this.logger(`[BiomeCenter] ${nearestTower.id} entered: ${nearestTower.log}`)
    }

    this.nearbyTowerId = nextTowerId
  }
}

findNearestTowerInRange(playerPosition) {
  let nearest = null
  let nearestDistanceSq = Infinity

  for (const tower of this.towers) {
    const dx = playerPosition.x - tower.position.x
    const dz = playerPosition.z - tower.position.z
    const distanceSq = dx * dx + dz * dz
    if (distanceSq <= tower.triggerRadius * tower.triggerRadius && distanceSq < nearestDistanceSq) {
      nearest = tower
      nearestDistanceSq = distanceSq
    }
  }

  return nearest
}

handleKeyDown(event) {
  if (event.repeat === true || event.code !== 'KeyE' || !this.nearbyTowerId) {
    return
  }

  const tower = this.towers.find((entry) => entry.towerId === this.nearbyTowerId)
  if (tower) {
    this.emitTowerEvent(BIOME_CENTER_ACTIVATE_EVENT, tower)
  }
}

emitTowerEvent(type, tower) {
  this.eventBus.emit(type, {
    biomeId: tower.id,
    towerId: tower.towerId,
    storyId: tower.storyId
  })
}
```

Update `clear()` to reset nearby tower:

```js
this.nearbyTowerId = null
```

Update `dispose()`:

```js
this.inputTarget?.removeEventListener?.('keydown', this._onKeyDown)
this.clear()
```

- [ ] **Step 4: Run tests**

Run: `npm test -- test/biomeCenterSystem.test.js`

Expected: PASS after updating the old "logs each biome center trigger once" test expectation to entered behavior if needed.

- [ ] **Step 5: Commit**

```bash
git add src/world/biomes/BiomeCenterSystem.js test/biomeCenterSystem.test.js
git commit -m "feat: emit biome center interaction events"
```

---

### Task 4: StoryRecordModalHUD

**Files:**
- Create: `src/ui/StoryRecordModalHUD.js`
- Modify: `src/style.css`

- [ ] **Step 1: Implement modal HUD**

Create `src/ui/StoryRecordModalHUD.js`:

```js
import { eventBus as defaultEventBus } from '../utils/event-bus.js'
import {
  CHATTER_RESUME_EVENT,
  CONTROLS_LOCK_EVENT,
  CONTROLS_UNLOCK_EVENT,
  STORY_RECORD_CLOSED_EVENT,
  STORY_RECORD_SHOW_EVENT
} from '../story/StoryRecordManager.js'

export default class StoryRecordModalHUD {
  constructor({ config, eventBus = defaultEventBus, parent = null } = {}) {
    this.config = config
    this.modalConfig = config?.ui?.storyRecord ?? {}
    this.enabled = this.modalConfig.enabled !== false
    this.eventBus = eventBus
    this.parent = parent ?? (typeof document !== 'undefined' ? document.body : null)
    this.record = null
    this.pageIndex = 0
    this.element = null

    this._onShow = (payload) => this.open(payload?.record)
    this._onKeyDown = (event) => this.handleKeyDown(event)

    if (!this.enabled || typeof document === 'undefined' || !this.parent) {
      return
    }

    this.eventBus.on(STORY_RECORD_SHOW_EVENT, this._onShow)
  }

  open(record) {
    if (!record || !Array.isArray(record.pages) || record.pages.length === 0) {
      console.warn('[StoryRecordModalHUD] Invalid record payload.')
      return
    }

    this.close({ emitClosed: false })
    this.record = record
    this.pageIndex = 0
    this.element = document.createElement('div')
    this.element.className = 'story-record-modal'
    this.element.innerHTML = `
      <div class="story-record-modal__panel">
        <div class="story-record-modal__source"></div>
        <h2 class="story-record-modal__title"></h2>
        <div class="story-record-modal__body"></div>
        <div class="story-record-modal__footer">
          <span class="story-record-modal__progress"></span>
          <button class="story-record-modal__button" type="button"></button>
        </div>
      </div>
    `
    this.element.querySelector('.story-record-modal__button').addEventListener('click', () => this.advance())
    this.parent.appendChild(this.element)
    document.addEventListener('keydown', this._onKeyDown)
    this.eventBus.emit(CONTROLS_LOCK_EVENT, { source: 'story-record' })
    this.render()
  }

  render() {
    const page = this.record.pages[this.pageIndex]
    this.element.querySelector('.story-record-modal__title').textContent = this.record.title
    this.element.querySelector('.story-record-modal__source').textContent = page.speaker ?? page.source ?? this.record.kind
    this.element.querySelector('.story-record-modal__progress').textContent = `${this.pageIndex + 1} / ${this.record.pages.length}`
    this.element.querySelector('.story-record-modal__button').textContent = this.pageIndex === this.record.pages.length - 1 ? 'Close' : 'Continue'

    const body = this.element.querySelector('.story-record-modal__body')
    body.className = `story-record-modal__body story-record-modal__body--${page.type}`
    body.replaceChildren(this.createPageElement(page))
  }

  createPageElement(page) {
    if (page.type === 'comic') {
      const image = document.createElement('img')
      image.className = 'story-record-modal__comic'
      image.src = page.image
      image.alt = page.alt ?? ''
      return image
    }

    const text = document.createElement('p')
    text.className = 'story-record-modal__text'
    text.textContent = page.text ?? ''
    return text
  }

  handleKeyDown(event) {
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault()
      this.advance()
    }

    if (event.code === 'Escape') {
      this.close()
    }
  }

  advance() {
    if (!this.record) {
      return
    }

    if (this.pageIndex < this.record.pages.length - 1) {
      this.pageIndex += 1
      this.render()
      return
    }

    this.close()
  }

  close({ emitClosed = true } = {}) {
    if (!this.record && !this.element) {
      return
    }

    const record = this.record
    this.element?.remove()
    document.removeEventListener('keydown', this._onKeyDown)
    this.record = null
    this.element = null
    this.pageIndex = 0

    if (emitClosed && record) {
      this.eventBus.emit(STORY_RECORD_CLOSED_EVENT, { recordId: record.id, kind: record.kind })
      this.eventBus.emit(CHATTER_RESUME_EVENT, { source: 'story-record' })
      this.eventBus.emit(CONTROLS_UNLOCK_EVENT, { source: 'story-record' })
    }
  }

  dispose() {
    this.eventBus.off(STORY_RECORD_SHOW_EVENT, this._onShow)
    this.close()
  }
}
```

- [ ] **Step 2: Add modal CSS**

Append to `src/style.css`:

```css
.story-record-modal {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    padding: 28px;
    background: rgba(0, 0, 0, 0.62);
    box-sizing: border-box;
}

.story-record-modal__panel {
    width: min(920px, 92vw);
    max-height: 88vh;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    gap: 14px;
    padding: 22px;
    border: 1px solid rgba(116, 223, 255, 0.74);
    border-radius: 6px;
    background: rgba(3, 10, 14, 0.9);
    box-shadow: 0 0 34px rgba(53, 196, 212, 0.24);
    box-sizing: border-box;
}

.story-record-modal__source,
.story-record-modal__progress {
    color: rgba(116, 223, 255, 0.86);
    font-family: "Orbitron", sans-serif;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.story-record-modal__title {
    color: #ffffff;
    font-family: "Orbitron", sans-serif;
    font-size: 24px;
    font-weight: 700;
    line-height: 1.2;
}

.story-record-modal__body {
    min-height: 260px;
    overflow: auto;
    display: grid;
    align-items: center;
}

.story-record-modal__text {
    color: rgba(236, 255, 255, 0.94);
    font-family: system-ui, sans-serif;
    font-size: 18px;
    line-height: 1.65;
    white-space: pre-line;
}

.story-record-modal__comic {
    display: block;
    width: min(620px, 100%);
    max-height: 58vh;
    justify-self: center;
    object-fit: contain;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 4px;
}

.story-record-modal__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
}

.story-record-modal__button {
    min-width: 120px;
    height: 38px;
    border: 1px solid rgba(116, 223, 255, 0.84);
    border-radius: 4px;
    color: #ffffff;
    background: rgba(53, 196, 212, 0.18);
    font-family: "Orbitron", sans-serif;
    cursor: pointer;
}
```

- [ ] **Step 3: Manual smoke point**

Do not commit yet if manager integration is not done. This HUD is exercised in Task 6 via world integration.

- [ ] **Step 4: Commit**

```bash
git add src/ui/StoryRecordModalHUD.js src/style.css
git commit -m "feat: add story record modal hud"
```

---

### Task 5: Objective HUD and Radar Highlight

**Files:**
- Create: `src/ui/StoryObjectiveHUD.js`
- Modify: `src/ui/BiomeRadarHUD.js`
- Modify: `src/style.css`

- [ ] **Step 1: Implement objective HUD**

Create `src/ui/StoryObjectiveHUD.js`:

```js
import { eventBus as defaultEventBus } from '../utils/event-bus.js'
import {
  STORY_OBJECTIVE_BLOCKED_EVENT,
  STORY_OBJECTIVE_UPDATE_EVENT
} from '../story/StoryRecordManager.js'

export default class StoryObjectiveHUD {
  constructor({ config, eventBus = defaultEventBus, parent = null } = {}) {
    this.config = config
    this.objectiveConfig = config?.ui?.storyObjective ?? {}
    this.enabled = this.objectiveConfig.enabled !== false
    this.eventBus = eventBus
    this.parent = parent ?? (typeof document !== 'undefined' ? document.body : null)
    this.blockedTimer = 0
    this._onUpdate = (payload) => this.renderObjective(payload)
    this._onBlocked = (payload) => this.renderBlocked(payload)

    if (!this.enabled || typeof document === 'undefined' || !this.parent) {
      return
    }

    this.element = document.createElement('div')
    this.element.className = 'story-objective-hud'
    this.parent.appendChild(this.element)
    this.eventBus.on(STORY_OBJECTIVE_UPDATE_EVENT, this._onUpdate)
    this.eventBus.on(STORY_OBJECTIVE_BLOCKED_EVENT, this._onBlocked)
  }

  renderObjective(payload = {}) {
    if (!this.element) {
      return
    }

    const text = payload.canActivate ? payload.activationLabel : payload.label
    this.element.innerHTML = `
      <div class="story-objective-hud__eyebrow">OBJECTIVE</div>
      <div class="story-objective-hud__text"></div>
    `
    this.element.querySelector('.story-objective-hud__text').textContent = text ?? ''
  }

  renderBlocked(payload = {}) {
    if (!this.element) {
      return
    }

    this.element.innerHTML = `
      <div class="story-objective-hud__eyebrow story-objective-hud__eyebrow--blocked">SYNC LOCKED</div>
      <div class="story-objective-hud__text"></div>
    `
    this.element.querySelector('.story-objective-hud__text').textContent = payload.message ?? 'Complete the current ecological validation first.'
  }

  dispose() {
    this.eventBus.off(STORY_OBJECTIVE_UPDATE_EVENT, this._onUpdate)
    this.eventBus.off(STORY_OBJECTIVE_BLOCKED_EVENT, this._onBlocked)
    this.element?.remove()
    this.element = null
  }
}
```

- [ ] **Step 2: Extend BiomeRadarHUD to track current objective**

Modify `src/ui/BiomeRadarHUD.js` imports:

```js
import { STORY_OBJECTIVE_UPDATE_EVENT } from '../story/StoryRecordManager.js'
```

In constructor:

```js
this.currentObjectiveId = null
this._onObjectiveUpdate = (payload) => {
  this.currentObjectiveId = payload?.towerId ?? payload?.objectiveId ?? null
}
```

After subscribing to player updates:

```js
eventBus.on(STORY_OBJECTIVE_UPDATE_EVENT, this._onObjectiveUpdate)
```

In `drawTargets`, before drawing target core:

```js
const isObjective = target.id === this.currentObjectiveId
const objectiveRadius = isObjective ? dotRadius + 10 + Math.sin(this.pulseTime * Math.PI * 4) * 3 : 0

if (isObjective) {
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)'
  ctx.lineWidth = 2
  ctx.shadowColor = target.color
  ctx.shadowBlur = 18
  ctx.beginPath()
  ctx.arc(point.x, point.y, objectiveRadius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}
```

In `dispose()`:

```js
if (this._onObjectiveUpdate) {
  eventBus.off(STORY_OBJECTIVE_UPDATE_EVENT, this._onObjectiveUpdate)
}
```

- [ ] **Step 3: Add objective CSS**

Append to `src/style.css`:

```css
.story-objective-hud {
    position: fixed;
    left: 75px;
    bottom: 46px;
    z-index: 3;
    max-width: min(420px, calc(100vw - 150px));
    padding: 10px 12px;
    border-left: 2px solid rgba(116, 223, 255, 0.82);
    background: rgba(0, 8, 12, 0.58);
    color: #ffffff;
    pointer-events: none;
    user-select: none;
    box-sizing: border-box;
}

.story-objective-hud__eyebrow {
    color: rgba(116, 223, 255, 0.9);
    font-family: "Orbitron", sans-serif;
    font-size: 11px;
    line-height: 1;
    letter-spacing: 0.08em;
}

.story-objective-hud__eyebrow--blocked {
    color: rgba(255, 96, 82, 0.95);
}

.story-objective-hud__text {
    margin-top: 6px;
    color: rgba(236, 255, 255, 0.96);
    font-family: system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.35;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- test/storyRecordManager.test.js`

Expected: PASS. Radar/HUD DOM is manually verified after Task 6 integration.

- [ ] **Step 5: Commit**

```bash
git add src/ui/StoryObjectiveHUD.js src/ui/BiomeRadarHUD.js src/style.css
git commit -m "feat: add story objective guidance"
```

---

### Task 6: World Integration and Control Lock

**Files:**
- Modify: `src/world/world.js`
- Modify: `src/world/WorldConfig.js`

- [ ] **Step 1: Update config**

Modify `src/world/WorldConfig.js` inside `ui`:

```js
storyRecord: {
  enabled: true
},
storyObjective: {
  enabled: true
},
```

- [ ] **Step 2: Integrate systems in World**

Modify imports in `src/world/world.js`:

```js
import StoryRecordManager, {
    CONTROLS_LOCK_EVENT,
    CONTROLS_UNLOCK_EVENT
} from '../story/StoryRecordManager.js'
import StoryRecordModalHUD from '../ui/StoryRecordModalHUD.js'
import StoryObjectiveHUD from '../ui/StoryObjectiveHUD.js'
```

Add constructor fields:

```js
this.storyRecordManager = null
this.storyRecordModalHUD = null
this.storyObjectiveHUD = null
this.controlsLocked = false
this._onControlsLock = () => {
    this.controlsLocked = true
    this.playerAircraft?.input?.clear?.()
}
this._onControlsUnlock = () => {
    this.controlsLocked = false
}
```

In `build()`, after HUD creation:

```js
if (!this.storyRecordManager && this.config.ui?.storyRecord?.enabled !== false) {
    this.storyRecordManager = new StoryRecordManager()
    this.storyRecordManager.start()
}

if (!this.storyRecordModalHUD && this.config.ui?.storyRecord?.enabled !== false) {
    this.storyRecordModalHUD = new StoryRecordModalHUD({ config: this.config })
}

if (!this.storyObjectiveHUD && this.config.ui?.storyObjective?.enabled !== false) {
    this.storyObjectiveHUD = new StoryObjectiveHUD({ config: this.config })
}

eventBus.on(CONTROLS_LOCK_EVENT, this._onControlsLock)
eventBus.on(CONTROLS_UNLOCK_EVENT, this._onControlsUnlock)
```

In `update()`, skip player motion while locked:

```js
for (const child of this.children) {
    if (child === this.playerAircraft && this.controlsLocked) {
        continue
    }
    child.update?.()
}
```

In `dispose()`:

```js
eventBus.off(CONTROLS_LOCK_EVENT, this._onControlsLock)
eventBus.off(CONTROLS_UNLOCK_EVENT, this._onControlsUnlock)
this.storyRecordManager?.dispose()
this.storyRecordModalHUD?.dispose()
this.storyObjectiveHUD?.dispose()
this.storyRecordManager = null
this.storyRecordModalHUD = null
this.storyObjectiveHUD = null
this.controlsLocked = false
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 4: Build**

Run: `npm run build`

Expected: Vite build completes without errors.

- [ ] **Step 5: Commit**

```bash
git add src/world/world.js src/world/WorldConfig.js
git commit -m "feat: integrate story record system"
```

---

### Task 7: Browser Verification

**Files:**
- No planned source edits unless visual verification reveals layout problems.

- [ ] **Step 1: Start dev server**

Run: `npm run dev -- --host 127.0.0.1`

Expected: Vite prints a localhost URL.

- [ ] **Step 2: Verify mainline flow manually**

In browser:

1. Opening modal appears once.
2. `Space` advances pages.
3. Last page closes and aircraft control resumes.
4. Objective HUD shows forest tower target.
5. Radar highlights forest tower.
6. Approaching forest tower shows `Press E`.
7. Pressing `E` opens forest record.
8. Comic image loads from `/story/forest-evidence.png`.
9. Closing the record advances objective.

- [ ] **Step 3: Verify production build**

Run: `npm run build`

Expected: build succeeds.

- [ ] **Step 4: Commit any visual fixes**

If CSS or integration fixes were needed:

```bash
git add src/style.css src/ui src/world
git commit -m "fix: polish story record flow"
```

---

## Self-Review

- Spec coverage: This plan covers opening story, fixed tower order, `E` activation, objective HUD, radar highlight, 5-page tower records, final reveal, control lock, chatter pause/resume events, tests, and browser verification.
- Placeholder scan: No placeholder markers or unspecified implementation steps remain.
- Type consistency: The plan consistently uses `mainStoryContent`, `pages`, `StoryRecordManager`, `StoryRecordModalHUD`, `StoryObjectiveHUD`, `story-objective:update`, `biome-center:activate`, and `story-record:show`.
