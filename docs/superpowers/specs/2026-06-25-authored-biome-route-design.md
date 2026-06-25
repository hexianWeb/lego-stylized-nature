# Authored Biome Route And Story Progression Design

## Goal

Build the world structure for a short, focused exploration game where the player flies freely across a hand-authored biome route. The map is still open to navigate, and biome discovery plus biome achievements can happen out of order. Ruins and comic scenes are arranged in story order so UI prompts naturally guide the player from one biome story beat to the next.

The first authored route is:

```text
forest -> autumnForest -> desert -> volcano
```

Each biome should occupy roughly a `100 x 100` block area. Its center anchors the biome core and ruin placement, while a smaller inner achievement radius confirms that the player is safely inside that biome before discovery and discovery achievements fire.

## Scope

This design covers:

- Converting biome regions into global authored route data.
- Keeping the player free to fly instead of enforcing hard progression gates.
- Defining unordered biome entry, discovery, achievement, gated ruin activation, and story comic events.
- Preparing biome coordinates for future render chunk streaming.
- Keeping chunk lifecycle, biome detection, progress state, and UI/story presentation separate.

This design does not cover:

- Implementing chunk streaming in this spec.
- Creating final ruin models or comic art assets.
- Adding save/load persistence beyond in-memory progress state.
- Adding combat, inventory, quest logs, minimaps, or complex mission UI.

## Current Context

The current world uses a single `128 x 128` terrain map in `src/world/WorldConfig.js`. `BiomeMaskGenerator.getCellBiome(x, z)` evaluates circular biome regions using local terrain cell coordinates, blends up to the top two region scores, and falls back to forest when no region covers the cell.

The current regions are compact and all live inside the initial terrain footprint:

```js
regions: [
  { id: 'forest', center: [24, 34], radius: 30, weight: 1 },
  { id: 'autumnForest', center: [45, 28], radius: 28, weight: 1 },
  { id: 'desert', center: [72, 42], radius: 30, weight: 1 },
  { id: 'volcano', center: [58, 74], radius: 32, weight: 1 }
]
```

The player aircraft controller is designed not to clamp movement to the generated terrain footprint. That makes it compatible with later terrain expansion and chunk streaming.

## Authored Route Data

Biome regions should become global story-map data. `center` is a global block coordinate, not a local coordinate inside a currently loaded chunk.

Recommended first-route shape:

```js
biomes: {
  defaultBiome: 'forest',
  achievementRadius: 40,
  ruinActivationRadius: 5,
  regions: [
    {
      id: 'forest',
      displayName: 'Forest',
      center: [0, 0],
      radius: 50,
      achievementRadius: 40,
      weight: 1,
      storyOrder: 0,
      discoveryAchievementId: 'biome_forest_discovered',
      ruinId: 'forest_ruin',
      storyId: 'forest_comic'
    },
    {
      id: 'autumnForest',
      displayName: 'Autumn Forest',
      center: [145, 145],
      radius: 50,
      achievementRadius: 40,
      weight: 1,
      storyOrder: 1,
      discoveryAchievementId: 'biome_autumn_forest_discovered',
      ruinId: 'autumn_forest_ruin',
      storyId: 'autumn_forest_comic'
    },
    {
      id: 'desert',
      displayName: 'Desert',
      center: [290, 80],
      radius: 50,
      achievementRadius: 40,
      weight: 1,
      storyOrder: 2,
      discoveryAchievementId: 'biome_desert_discovered',
      ruinId: 'desert_ruin',
      storyId: 'desert_comic'
    },
    {
      id: 'volcano',
      displayName: 'Volcano',
      center: [435, 190],
      radius: 50,
      achievementRadius: 40,
      weight: 1,
      storyOrder: 3,
      discoveryAchievementId: 'biome_volcano_discovered',
      ruinId: 'volcano_ruin',
      storyId: 'volcano_comic'
    }
  ]
}
```

The spacing deliberately crosses future render chunk boundaries. The first render chunk size should be `64 x 64` cells, and the route forces the streaming system to handle global coordinates instead of repeatedly generating the same local biome layout.

`radius` controls terrain biome influence. `achievementRadius` is a smaller inner circle used for player-facing biome confirmation, discovery, and discovery achievements. For a `radius` of `50`, the recommended `achievementRadius` is `40`, which keeps the player well inside the biome before progress UI or achievements fire. This avoids ambiguous unlocks in blended border areas where two biome weights overlap.

## Coordinate Model

The core rule is:

```text
world block = chunk origin + local cell
```

Examples:

```text
render chunk [2, 2] origin = [128, 128]
local cell [17, 17] = world block [145, 145]
autumnForest center = [145, 145]
```

Terrain generation, biome scoring, prefab randomness, ruin placement, and player biome detection should all use world block coordinates. Rendering can still position chunk-local geometry under a chunk root group.

## System Boundaries

### ChunkManager

Owns render chunk lifecycle. It decides which `64 x 64` render chunks are active around the aircraft, keeps a small active chunk window visible, initially `3 x 3`, and unloads chunks that are no longer relevant.

It should not know about achievements, comics, or story completion.

### Chunked Terrain Generation

Adapts the existing terrain generation path to accept a chunk origin. Biome sampling and noise sampling use global block coordinates. The generated `TerrainMap` can still expose local `x,z` cells to renderers, but each terrain map needs chunk metadata so systems can convert local cells back to world cells.

### BiomeRouteService

Owns authored route interpretation:

- Sort regions by `storyOrder`.
- Resolve `currentVisualBiome` from terrain biome weights or dominant region. This is useful for debug and ambient UI, but it can change near borders.
- Resolve `confirmedBiome` from player world block position only when the player is inside a region's `achievementRadius`.
- Resolve the next recommended biome based on progress.
- Compute distance to region centers.
- Emit route-level events such as `biome:changed`, `biome:confirmed`, `biome:discovered`, `achievement:unlocked`, `ruin:blocked`, and `ruin:activated`.

It should be pure enough to test without Three.js.

### ProgressState

Tracks one-session progression:

- confirmed biome ids
- discovered biome ids
- unlocked achievement ids
- activated ruin ids
- viewed story ids
- current story index
- all-biomes-complete state

The first version can be in-memory. Save/load can be added later by serializing the same state.

### RuinSite System

Places one ruin at each biome center and exposes an activation radius. The ruin should be anchored by region data rather than a separate hard-coded coordinate list. If a center is unsuitable after terrain generation, a small local placement solver can move the ruin to the nearest stable cell within a short radius.

The first version should allow automatic activation on proximity or a simple interaction key, depending on the UI direction chosen later.

### GameHUD And StoryComicOverlay

Runtime UI should be separate from debug panels.

The HUD displays:

- current visual biome message when useful
- confirmed biome message when the player enters a stable inner biome area
- next recommended biome or ruin direction
- achievement unlock notice
- blocked ruin notice when the player reaches a later ruin before the required story step
- all-biomes-complete notice

The comic overlay displays the four-panel story for a ruin activation. Comic content is addressed by `storyId`, so placeholder panels can ship before final art.

## Event Flow

Every update:

1. Read aircraft world position.
2. Convert to world block position.
3. Ask `BiomeRouteService` for `currentVisualBiome`, `confirmedBiome`, and next story target.
4. If `currentVisualBiome` changes, optionally emit `biome:changed` for debug or ambient UI. This event does not unlock progress.
5. If the player crosses inside a region's `achievementRadius`, emit `biome:confirmed` for that region.
6. If that region was not already discovered, emit `biome:discovered`, record the discovery, and unlock `discoveryAchievementId` once, regardless of story order.
7. If the player enters a ruin's `ruinActivationRadius`, compare the ruin's `storyOrder` with the current story index.
8. If the ruin matches the current story index, emit `ruin:activated`, show the matching comic overlay, mark the story id viewed, and advance the recommended story target.
9. If the ruin belongs to a later story step, emit `ruin:blocked` and show a message such as `Signal not synchronized. More clues are still missing.`

The player may visit later biomes early. Visual biome changes, confirmed biome entry, biome discovery, and discovery achievements can all happen out of order. Only ruin activation and comic story progression follow `storyOrder`.

Example: if the player flies to the volcano before completing earlier ruins:

```text
visual biome changes near volcano border -> optional HUD/debug: Volcano
enter volcano achievement radius -> HUD: Confirmed Volcano
first confirmed volcano visit -> progress records volcano as discovered
volcano discovery achievement not yet unlocked -> unlock Volcano Discovered
enter volcano ruin activation radius -> HUD: Signal not synchronized. More clues are still missing.
story index remains unchanged
```

## Player Guidance

The map remains freely flyable. Guidance is soft:

- No invisible walls.
- No forced teleporting.
- No hard lock that prevents entering a later biome.
- UI points the player toward the next intended biome center.
- Confirmed biome discovery and discovery achievements unlock even if the player reaches a later biome early.
- Ruin activation only advances the story target when it matches the current story order.
- Later ruins show a blocked-state message instead of silently failing.

This keeps the game short and readable while preserving the feeling of open flight.

## Terrain And Ruin Fit

Each biome center should become a stable landmark. During terrain or ruin placement:

- Avoid placing the ruin under water or lava unless the biome explicitly wants that.
- Prefer a small flattened or stabilized platform near the center.
- Keep the platform local so it does not erase the biome identity.
- Place landmark prefabs after terrain classification, not before.

For volcano, the ruin should avoid active lava cells unless a later story beat requires a lava-island ruin.

## Error Handling

- Unknown biome id in a region should warn once and skip that region for route progression.
- Duplicate `storyOrder` values should warn and use region list order as a stable tie-breaker.
- Missing `displayName` should fall back to `id`.
- Missing `discoveryAchievementId`, `ruinId`, or `storyId` should disable that specific event while leaving biome generation intact.
- Missing comic content should show a placeholder comic overlay with the `storyId`.

## Testing

Focused tests should cover:

- Global coordinate biome scoring uses `worldX/worldZ`.
- Chunk-local coordinates convert correctly to global coordinates.
- Route regions sort by `storyOrder`.
- `currentVisualBiome` can change near region borders without recording progress.
- Entering a region's `achievementRadius` emits `biome:confirmed`.
- First confirmation emits `biome:discovered`.
- First discovery unlocks `discoveryAchievementId`.
- Biome discovery records out of order.
- Discovery achievements unlock out of order.
- Border areas outside `achievementRadius` do not trigger discovery or achievements, even when biome weights blend.
- Visiting a later ruin early emits `ruin:blocked` and does not advance the story target.
- Activating the current-order ruin advances progress.
- Progress state does not duplicate achievements, ruins, or viewed stories.
- Missing route metadata degrades without crashing terrain generation.

Manual verification should cover:

- The four-biome route is spatially readable from the top-down aircraft camera.
- The player can fly away from the intended route without being blocked.
- UI guidance still makes the next intended biome clear.
- Chunk loading later keeps a small active chunk window visible, initially `3 x 3`, while maintaining continuous biome layout.

## Acceptance Criteria

- The authored route order is `forest -> autumnForest -> desert -> volcano`.
- Biome centers use global block coordinates.
- Each region radius is around `50`, producing roughly `100 x 100` biome areas.
- Biome discovery and discovery achievements use an inner `achievementRadius`, recommended as `40` for a `50` radius biome.
- The player can freely enter any biome.
- Visual biome changes do not record progress by themselves.
- Confirmed biome entry, discovery, and discovery achievements can happen out of story order.
- Story progression advances in route order through ruins and comics.
- Later-order ruins show a blocked-state message instead of preventing biome achievement unlocks.
- The chunk-streaming design can keep a small active render chunk window visible, initially `3 x 3`, without duplicating biome layouts.
- Runtime UI and story overlays are separate from debug panels.
- Existing terrain, prefab, water, lava, and aircraft systems remain separable from route progression logic.
