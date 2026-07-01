# Story Record System Design

## Context

The project already has biome center towers, player aircraft movement, HUD classes, a biome radar, and a global `eventBus`. The mainline narrative system should use those existing boundaries instead of becoming a broad quest framework.

`StoryRecord` is the blocking mainline system. It owns the linear story state: opening invitation, four tower records, and final revival-protocol reveal.

`AmbientChatter` is a separate non-blocking exploration system. This document only defines the contracts needed for `StoryRecord` to pause and resume chatter while the record modal is active.

## Mainline Experience

The first version should be a clear linear flow:

```txt
Invited by signal
-> Activate towers
-> Accidentally discover hidden archives
-> Gradually recognize the lie
-> Four towers synchronize
-> Revival protocol asks for external authorization
```

The first 80% should let the player believe they are helping a civilization that voluntarily retreated into digital memory so nature could recover. The last 20% reveals that the civilization uploaded itself after exhausting the planet, then waited for nature to repair the damage.

The first version stops at the demo ending:

```txt
REVIVAL PROTOCOL
Authorization required.
Decision pending.
```

No ending choice is implemented yet.

## Goals

- Automatically play an opening invitation once when the world starts.
- Guide the player to the current mainline tower with radar highlighting and a small objective HUD.
- Allow free flight, but only the current objective tower can be activated.
- Activate the current tower with `E` instead of playing records merely by entering range.
- Display each tower record as a central modal with a fixed 5-page rhythm.
- Lock player control while any story record modal is open.
- Play each tower record automatically only once per runtime session.
- Trigger a final reveal when all four tower records are complete.
- Keep mainline content separate from `WorldConfig.js`.
- Pause or hide ambient chatter while a story record modal is open.
- Keep the first implementation focused enough for node tests and manual UI verification.

## Non-Goals

- Ambient chatter scheduling, cooldowns, or content selection.
- Persistent save data for played records.
- Replayable archives or journals.
- Branching dialogue choices or ending choices.
- A full quest graph.
- Character voice playback.
- Localization or external JSON authoring.
- Browser end-to-end tests for the first pass.

## Narrative Sources

The mainline depends on two information sources.

`Tower Signal` is the official lie. It should sound gentle, restrained, ecological, and slightly sacred. It claims the civilization left the surface so nature could recover, and asks the player to activate four ecological centers.

`Ship Scanner` and `Hidden Archive` are the truth. They should sound technical, cold, and objective. They discover hidden data layers, partially deleted records, rebuilt visual evidence, and proof that ecological collapse was caused by extraction.

## Mainline Order

The tower order is fixed:

```js
['forest', 'badlands', 'desert', 'volcano']
```

The player may freely fly elsewhere, but only the current objective tower can be activated. Non-current towers should show a short blocked message such as `SYNC LOCKED: complete the current ecological validation first`.

The narrative purpose of each tower:

- `forest`: biomass extraction and the fantasy of infinite forest resources.
- `badlands`: mining, industrial waste, and the decision that some regions could be sacrificed.
- `desert`: groundwater extraction and water-cycle collapse.
- `volcano`: geothermal over-extraction and the admission that they knew the risk.

After `volcano`, the final reveal connects the four towers to body rebirth modules:

- Forest tower: biomass and cell-growth material.
- Badlands tower: mineral skeleton and trace-element structure.
- Desert tower: water-cycle and fluid adaptation.
- Volcano tower: geothermal energy and neural synchronization power.

## Architecture

Use a small blocking mainline layer between tower interaction and UI:

1. `StoryRecordManager` starts by requesting `openingStory`.
2. Closing `openingStory` sets `currentObjectiveId = 'forest'` and emits `story-objective:update`.
3. `BiomeRadarHUD` highlights the current objective tower.
4. `StoryObjectiveHUD` displays the current target and interaction prompt.
5. `BiomeCenterSystem` detects tower range entry and exit, and emits activation when the player presses `E` in range.
6. `StoryRecordManager` decides whether the activated tower is the current objective.
7. If it is current, `StoryRecordManager` emits `story-record:show`.
8. If it is not current, `StoryRecordManager` emits `story-objective:blocked`.
9. Closing a tower record marks it complete and advances to the next objective.
10. Closing the fourth tower record triggers `finalReveal`.
11. Closing `finalReveal` leaves the story in `decisionPending`.

This keeps space/input detection in `BiomeCenterSystem` and mainline progression in `StoryRecordManager`.

## Mainline State

The first version only needs runtime state:

```js
{
  introPlayed: false,
  completedRecords: new Set(),
  activeRecordId: null,
  finalRevealPlayed: false,
  currentObjectiveId: 'forest',
  decisionPending: false
}
```

Progression rules:

```txt
introPlayed === false
  -> play openingStory

openingStory closed
  -> currentObjectiveId = 'forest'
  -> emit story-objective:update

biome-center:activate for currentObjectiveId
  -> play that tower record

tower record closed
  -> add to completedRecords
  -> advance currentObjectiveId
  -> emit story-objective:update

completedRecords.size === 4 && finalRevealPlayed === false
  -> play finalReveal

finalReveal closed
  -> decisionPending = true
```

## Events

Use the existing `eventBus` pattern.

### Tower Interaction

`biome-center:entered`

Emitted by `BiomeCenterSystem` when the player enters a tower interaction range.

```js
{
  biomeId: 'forest',
  towerId: 'forest',
  storyId: 'forest'
}
```

`biome-center:exited`

Emitted by `BiomeCenterSystem` when the player leaves a tower interaction range.

```js
{
  biomeId: 'forest',
  towerId: 'forest',
  storyId: 'forest'
}
```

`biome-center:activate`

Emitted by `BiomeCenterSystem` when the player presses `E` while inside a tower interaction range.

```js
{
  biomeId: 'forest',
  towerId: 'forest',
  storyId: 'forest'
}
```

The default `towerId` and `storyId` are the biome id. A tower can override `storyId` with `storyAlias`, preserving the current `autumnForest -> badlands` intent.

`BiomeCenterSystem` must not track mainline progress or played records. It may track the current nearby tower and input state.

### Objective Guidance

`story-objective:update`

Emitted by `StoryRecordManager` whenever the current mainline target changes or the interaction prompt changes.

```js
{
  objectiveId: 'forest',
  towerId: 'forest',
  label: 'Proceed to the Forest Consciousness Tower',
  canActivate: false,
  distance: 128.4
}
```

`story-objective:blocked`

Emitted when the player tries to activate a non-current tower.

```js
{
  towerId: 'desert',
  requiredObjectiveId: 'forest',
  message: 'SYNC LOCKED: complete the current ecological validation first.'
}
```

### Record Display

`story-record:show`

Emitted by `StoryRecordManager` after validating and resolving a playable story node.

```js
{
  record: {
    id: 'forest',
    title: 'Forest Evidence',
    kind: 'towerRecord',
    pages: []
  }
}
```

`story-record:closed`

Emitted by `StoryRecordModalHUD` when the active record closes.

```js
{
  recordId: 'forest',
  kind: 'towerRecord'
}
```

### Chatter Coordination

`chatter:pause`

Emitted before or alongside `story-record:show`.

`chatter:resume`

Emitted when the story record modal closes or is disposed while open.

### Control Lock

`controls:lock`

Emitted by blocking UI when player control should stop.

```js
{
  source: 'story-record'
}
```

`controls:unlock`

Emitted when the source that locked controls has closed.

```js
{
  source: 'story-record'
}
```

The first pass can implement this as a simple story-record lock. If more systems need locking later, add a small `ControlLockManager` that tracks lock sources.

## Main Story Content

Create `src/story/mainStoryContent.js`.

The file exports:

```js
export const mainStoryContent = {
  openingStory: {},
  towerOrder: ['forest', 'badlands', 'desert', 'volcano'],
  towerRecords: {},
  finalReveal: {}
}
```

### Opening Story

`openingStory` plays once when the world starts. It does not use a comic page. It establishes the official lie:

- The civilization claims it uploaded consciousness and left the surface to let nature recover.
- Some of them now wish to reconnect with wind, water, sunlight, and soil.
- The player is asked to activate four ecological consciousness towers.
- It should not mention rebirth.

### Tower Records

Each tower record uses the same 5-page rhythm:

```txt
Page 1: Tower Signal official request
Page 2: Ship Scanner discovers hidden archive layer
Page 3: 2x2 comic evidence image
Page 4: Hidden archive log
Page 5: Tower response or cover-up
```

Example shape:

```js
forest: {
  id: 'forest',
  title: 'Forest Evidence',
  kind: 'towerRecord',
  towerId: 'forest',
  objectiveLabel: 'Proceed to the Forest Consciousness Tower',
  activationLabel: 'Press E to activate the Forest Consciousness Tower',
  pages: [
    {
      type: 'towerSignal',
      speaker: 'TOWER SIGNAL',
      text: 'Forest ecological center restored. Please begin ecological validation.'
    },
    {
      type: 'shipScanner',
      speaker: 'SHIP SCANNER',
      text: 'Hidden archive layer detected. Data state: partially deleted. Rebuilding visual record.'
    },
    {
      type: 'comic',
      image: '/story/forest-evidence.png',
      alt: 'Four-stage record of forest biomass extraction.'
    },
    {
      type: 'archiveLog',
      source: 'HIDDEN ARCHIVE 01',
      text: 'Biomass output efficiency increased to 312%. Forest self-repair continued to decline. Management conclusion: continue extraction.'
    },
    {
      type: 'towerResponse',
      speaker: 'TOWER SIGNAL',
      text: 'This record is incomplete. Please do not judge us from damaged fragments.'
    }
  ]
}
```

Tower themes:

- `forest`: original forest -> limited coexistence -> machine logging and biomass factories -> dry air, dead trees, abandoned machinery, missing animals.
- `badlands`: colorful rock and crystal ecology -> small mining -> giant pits and waste pools -> polluted sediment and sacrificed terrain.
- `desert`: oasis and groundwater abundance -> small wells and canals -> industrial pumps and pipe networks -> cracked riverbeds and dead palms.
- `volcano`: stable geothermal region -> careful steam use -> core drilling and magma pipelines -> collapse, ash, and over-extracted heat.

### Final Reveal

`finalReveal` plays after all four tower records close. It does not require a comic image. It should use protocol-style pages:

```txt
GLOBAL TOWER LINK ESTABLISHED

Forest tower: biomass reconstruction module connected.
Badlands tower: mineral skeleton module connected.
Desert tower: fluid-cycle module connected.
Volcano tower: gestation energy module connected.

Ecological validation complete.
Life re-gestation system awaiting authorization.
```

The tower then admits enough truth to reveal the conflict, but still frames its actions carefully:

```txt
We harmed this planet.
That is why we left the surface and let it regrow.
Some of us now wish to receive bodies again.
Please decide whether we may touch this world once more.
```

The first version ends with:

```txt
REVIVAL PROTOCOL
Authorization required.
Decision pending.
```

## Supported Page Types

`StoryRecordModalHUD` should render `pages` without needing to know whether the record is opening, tower, or final reveal.

Initial page types:

- `signal`: opening-story text.
- `towerSignal`: official tower text.
- `shipScanner`: technical scanner text.
- `comic`: dominant 2x2 comic image.
- `archiveLog`: hidden record text.
- `towerResponse`: cover-up, hesitation, or admission.
- `protocol`: final reveal protocol status.

Unknown page types should be skipped with a warning.

## StoryRecordManager

Create `src/story/StoryRecordManager.js`.

Responsibilities:

- Own the mainline runtime state.
- Request `openingStory` when initialized.
- Emit `story-objective:update` after opening closes and whenever the current objective changes.
- Subscribe to `biome-center:entered`, `biome-center:exited`, and `biome-center:activate`.
- Resolve whether the nearby or activated tower is the current objective.
- Emit objective prompts for current target, activation-ready, and blocked states.
- Validate that a record exists and has at least one supported page.
- Track `completedRecords` in memory.
- Track `activeRecordId` to ignore repeated activation while a modal is open.
- Emit `chatter:pause` before or alongside record display.
- Emit `story-record:show` for opening, tower records, and final reveal.
- Advance mainline state on `story-record:closed`.
- Warn and skip only when safe; do not advance if required tower content is missing.
- Remove event listeners in `dispose()`.

The manager should not create DOM nodes and should not directly manipulate player control.

## StoryRecordModalHUD

Create `src/ui/StoryRecordModalHUD.js`.

Responsibilities:

- Subscribe to `story-record:show`.
- Create and own the central modal DOM.
- Render title, speaker/source, page body, page progress, and a primary button.
- Render `comic` pages with the 2x2 evidence image as the visual focus.
- Render `protocol` pages with strong system-status hierarchy.
- Advance through `pages` on button click.
- Support `Space` and `Enter` to advance.
- Support `Escape` to close the active record.
- Display the button as `Continue` until the final page and `Close` on the final page.
- Emit `controls:lock` when opened.
- Emit `story-record:closed`, `chatter:resume`, and `controls:unlock` when closed.
- Remove DOM and event listeners in `dispose()`.
- Emit chatter resume and unlock if disposed while open.

The modal should use a fixed overlay, a dark translucent background, sci-fi border treatment, and viewport-constrained width.

## Objective Guidance UI

### BiomeRadarHUD

`BiomeRadarHUD` should highlight the current objective tower. It can keep showing all biome targets, but the current objective should have higher visual priority through a pulse, brighter ring, or special marker.

It should receive objective updates through `story-objective:update`.

### StoryObjectiveHUD

Create `src/ui/StoryObjectiveHUD.js`.

Responsibilities:

- Subscribe to `story-objective:update`.
- Subscribe to `story-objective:blocked`.
- Show one compact current-objective text, not a task list.
- Show the activation prompt when `canActivate === true`.
- Show a short blocked message when the player tries to activate a non-current tower.
- Avoid overlapping the radar and existing control guide.
- Remove DOM and event listeners in `dispose()`.

Example states:

```txt
OBJECTIVE
Proceed to the Forest Consciousness Tower
```

```txt
OBJECTIVE
Press E to activate the Forest Consciousness Tower
```

```txt
SYNC LOCKED
Complete the current ecological validation first
```

## BiomeCenterSystem

`BiomeCenterSystem` remains a space/input system.

Responsibilities added for this feature:

- Detect when the player enters and exits tower interaction range.
- Track the currently nearby tower.
- Listen for `E` while a tower is in range.
- Emit `biome-center:activate` when `E` is pressed in range.
- Keep existing tower placement, light material, and logging behavior.

It must not:

- Know the current mainline objective.
- Know whether a record has already played.
- Decide whether a tower can be activated for mainline progress.

## World Integration

`World` should instantiate:

- `StoryRecordManager`, after core systems are available.
- `StoryRecordModalHUD`, when `config.ui.storyRecord.enabled !== false`.
- `StoryObjectiveHUD`, when `config.ui.storyObjective.enabled !== false`.

`World` should route control lock events so aircraft input/movement stops while story modals are open. Rendering, camera, post-processing time, HUDs, and the modal should keep updating.

`World.dispose()` must dispose all story systems.

`WorldConfig.js` should gain small UI config blocks:

```js
ui: {
  storyRecord: {
    enabled: true
  },
  storyObjective: {
    enabled: true
  }
}
```

Tower config can continue to carry `storyAlias` where needed.

## Error Handling

- Missing `openingStory`: skip opening, enter the `forest` objective, and warn.
- Missing current tower record: do not advance mainline; emit a blocked or error objective message and warn.
- Activating a non-current tower: emit `story-objective:blocked`; do not play a record.
- Unknown page type: skip the page and warn.
- Record has no playable pages: do not advance mainline and warn.
- Missing `finalReveal`: show a fallback `REVIVAL PROTOCOL / Authorization required / Decision pending` record and warn.
- Modal receives malformed content despite manager validation: close safely and warn.
- `dispose()` while a record is open: remove DOM, emit `chatter:resume`, and emit `controls:unlock`.
- Repeated `E` while a modal is open or `activeRecordId` is set: ignore.

## Testing

Add focused node tests.

`StoryRecordManager` tests:

- Requests `openingStory` on initialization.
- Closing opening emits `story-objective:update` for `forest`.
- Entering current tower emits an activation-ready objective prompt.
- Activating a non-current tower emits `story-objective:blocked`.
- Activating current tower emits `story-record:show` for that tower record.
- Closing a tower record advances to the next objective.
- Completed tower records do not replay.
- Completing all four tower records emits `story-record:show` for `finalReveal`.
- Closing final reveal sets `decisionPending`.
- Missing required tower content does not advance mainline.
- Removes event listeners in `dispose()`.

`BiomeCenterSystem` tests:

- Emits `biome-center:entered` when the player enters tower range.
- Emits `biome-center:exited` when the player leaves tower range.
- Emits `biome-center:activate` when `E` is pressed in range.
- Uses `storyAlias` as the story id when configured.
- Does not know or check mainline progress.

`StoryObjectiveHUD` testing:

- Keep browser-like DOM testing optional for the first pass.
- Core objective state is covered by `StoryRecordManager` tests.

`StoryRecordModalHUD` testing:

- Keep browser-like DOM testing optional for the first pass.
- Keep paging and visibility state in methods that can be manually verified and covered later if a DOM test harness is added.

## MVP Scope

Must implement:

1. Opening story auto-plays once at world start.
2. Objective order is fixed: `forest -> badlands -> desert -> volcano`.
3. Biome radar highlights the current objective tower.
4. `StoryObjectiveHUD` shows current target and `E` activation prompt.
5. `BiomeCenterSystem` emits entered, exited, and activate events.
6. Only the current objective tower can play a tower record.
7. Each tower record uses the 5-page rhythm.
8. Tower record modal locks and unlocks controls.
9. Story modal pauses and resumes chatter.
10. Four completed records trigger final reveal.
11. Final reveal ends on `Decision pending`.

Do not implement yet:

1. Replayable archives.
2. Dialogue choices.
3. Persistent save records.
4. Multiple endings.
5. Complex multi-source control locks beyond `story-record`.

## Implementation Notes

- Keep event names exported as constants from the modules that own them.
- Preserve current console logging for biome tower entry unless it becomes redundant.
- Do not add persistence until the project has a broader save-state design.
- Do not introduce a new UI framework; use DOM creation patterns already used by the existing HUD classes.
- Prefer `StoryRecordManager`, `StoryRecordModalHUD`, and `StoryObjectiveHUD` over generic `StoryManager`, `StoryModalHUD`, or `Dialogue`.
