# Ambient Chatter System Design

## Context

The project already has player aircraft movement, biome regions, HUD classes, and a global `eventBus`. The ambient narrative system should use those existing boundaries without becoming a blocking dialogue or quest framework.

`AmbientChatter` is the non-blocking exploration system. It renders small radio-like fragments during free flight and never locks player control.

`StoryRecord` is a separate mainline evidence system. This document only defines the contracts needed for ambient chatter to pause while story record modals are open.

## Goals

- Add non-blocking ambient chatter during free exploration.
- Keep ambient chatter small, timed, and unable to lock controls.
- Trigger chatter from conditions and cooldowns rather than pure randomness.
- Use chatter to foreshadow that the civilization's language does not match its claimed values.
- Pause or hide ambient chatter while a story record modal is open.
- Keep chatter content separate from `WorldConfig.js`.
- Keep the first implementation focused enough for node tests and manual UI verification.

## Non-Goals

- Story record modal rendering or tower record playback.
- Player control locking.
- Persistent save data for played chatter.
- Complex queues.
- Multi-character voice playback.
- Dialogue choices.
- Replayable archives or journals.
- Localization or external JSON authoring.
- Browser end-to-end tests for the first pass.

## Narrative Role

`AmbientChatter` makes the player suspicious before direct proof appears. It should sound like tower signals, leaked consciousness fragments, and archived scraps.

The key pattern is that the civilization claims to love nature, but describes it as a resource without noticing the contradiction. Chatter is not filler; it is worldbuilding evidence heard while flying.

Suggested speaker categories:

- `Tower Signal`: official guidance and narrative cover.
- `Unknown Consciousness`: leaked individual thoughts showing greed, nostalgia, or fear.
- `Archive Fragment`: remnants that hint at old evidence.
- `Restoration Faction`: conservative consciousnesses that do not want to return.
- `Return Faction`: consciousnesses that want bodies again.

## Architecture

Use one manager and one HUD surface:

1. `AmbientChatterManager` reads chatter content and evaluates lightweight exploration conditions during `update()`.
2. When a line is eligible and cooldown allows it, `AmbientChatterManager` emits `chatter:show`.
3. `AmbientChatterHUD` renders a small non-blocking communication strip and fades it out automatically.
4. When a story record modal opens, `StoryRecordManager` emits `chatter:pause`.
5. When the modal closes, `StoryRecordModalHUD` emits `chatter:resume`.

This keeps content selection, cooldowns, and DOM rendering separate.

## UI Layer

Ambient chatter belongs to the Chatter Layer:

- It sits above always-on HUD elements when needed.
- It never locks controls.
- It can be covered by story record modals.
- It should hide or pause while the modal layer is active.

The visual weight should stay below the modal layer. A compact strip like `[TOWER SIGNAL] The forest is recovering quickly...` is preferred over a large framed dialogue box.

## Events

Use the existing `eventBus` pattern.

### Chatter Display

`chatter:show`

Emitted by `AmbientChatterManager` when a chatter line should display.

```js
{
  id: 'forest_resource_slip_01',
  speaker: 'Unknown Consciousness',
  text: 'So many trees... if only a small amount were harvested, no one would notice.'
}
```

`chatter:hidden`

Emitted by `AmbientChatterHUD` after a chatter line fades out.

### Chatter Pause

`chatter:pause`

Emitted when modal UI should suppress chatter.

`chatter:resume`

Emitted when chatter can resume after modal UI closes.

### Story Record Coordination

`story-record:show`

Ambient systems do not need to handle the record payload directly in the MVP. They should rely on `chatter:pause`.

`story-record:closed`

Ambient systems do not need to handle the record payload directly in the MVP. They should rely on `chatter:resume`.

## Ambient Chatter Content

Create `src/story/ambientChatterContent.js`.

The file exports an ordered list:

```js
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
  }
]
```

Initial trigger types:

- `biomeEnter`: after the player spends a short time in a biome.
- `idleFlight`: after a minimum time without main story progress.
- `nearTower`: when the player is near a tower but outside the story trigger radius.
- `afterChatter`: after a specific chatter line, optionally delayed.
- `afterRecord`: after one or more story records have played.

The first implementation should implement timed `biomeEnter` chatter plus a global cooldown. Other trigger types should be represented in the content shape but can remain unimplemented until needed.

## AmbientChatterManager

Create `src/story/AmbientChatterManager.js`.

Responsibilities:

- Read `ambientChatterContent`.
- Track `playedChatterIds` in memory.
- Track cooldowns so chatter never feels random or noisy.
- Evaluate lightweight trigger conditions during `update()`.
- Emit `chatter:show` for the highest-priority eligible line.
- Pause evaluation when receiving `chatter:pause`.
- Resume evaluation when receiving `chatter:resume`.
- Skip all output while paused.
- Remove event listeners in `dispose()`.

The MVP should implement timed biome-based chatter only. More complex triggers can be added after the story record flow is stable.

## AmbientChatterHUD

Create `src/ui/AmbientChatterHUD.js`.

Responsibilities:

- Subscribe to `chatter:show`.
- Render a small non-blocking communication strip near the lower-left or lower screen area.
- Avoid the right-side control guide.
- Display speaker and text for 3 to 5 seconds.
- Fade out automatically and emit `chatter:hidden`.
- Hide immediately on `chatter:pause`.
- Allow replacement by a new message, but respect manager cooldowns.
- Never emit `controls:lock`.

The chatter strip should not compete visually with a story record modal. It should feel like a short radio subtitle, not a full dialogue panel.

## World Integration

`World` should instantiate:

- `AmbientChatterManager`, when `config.ui.ambientChatter.enabled !== false`.
- `AmbientChatterHUD`, when `config.ui.ambientChatter.enabled !== false`.

`World.update()` should call `ambientChatterManager.update()` with the player state and any available biome/tower context.

`World.dispose()` must dispose both systems.

`WorldConfig.js` should gain a small UI config block:

```js
ui: {
  ambientChatter: {
    enabled: true,
    displaySeconds: 4,
    cooldownSeconds: 45
  }
}
```

## Error Handling

- Missing chatter content: `AmbientChatterManager` skips without affecting controls.
- Malformed chatter entries: skip and warn.
- Duplicate `playOnce` chatter: silently skip.
- Chatter paused while visible: `AmbientChatterHUD` hides the current message.
- Missing player or biome context during `update()`: skip condition evaluation for that frame.

## Testing

Add focused node tests.

`AmbientChatterManager` tests:

- Emits `chatter:show` for an eligible biome line.
- Does not emit while paused.
- Respects `playOnce`.
- Respects cooldown.
- Chooses higher-priority eligible chatter before lower-priority chatter.
- Removes event listeners in `dispose()`.

`AmbientChatterHUD` testing:

- Keep browser-like DOM testing optional for the first pass.
- Keep visibility state in methods that can be manually verified and covered later if a DOM test harness is added.

## MVP Scope

Must implement:

1. `AmbientChatterManager` periodically plays one biome-appropriate chatter line.
2. Chatter uses condition checks and cooldowns, not pure randomness.
3. `AmbientChatterHUD` displays a small non-blocking communication strip.
4. Chatter auto-fades after 3 to 5 seconds.
5. `chatter:pause` hides current chatter and pauses manager evaluation.
6. `chatter:resume` resumes manager evaluation.

Do not implement yet:

1. Complex queues.
2. Multi-character voice systems.
3. Replayable archives.
4. Dialogue choices.
5. Persistent save records.
6. Full trigger graph beyond the initial biome-based trigger.

## Implementation Notes

- Keep event names exported as constants from the modules that own them.
- Do not emit `controls:lock` from ambient chatter.
- Do not introduce a new UI framework; use DOM creation patterns already used by the existing HUD classes.
- Prefer `AmbientChatterManager` and `AmbientChatterHUD` over generic `Dialogue` naming.
