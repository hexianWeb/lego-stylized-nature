# Authored Biome Route And Story Progression Design

## Goal

Build the world structure for a short, focused exploration game where the player flies freely across a hand-authored biome route. The map is still open to navigate, but biome centers are arranged in a story order so UI prompts, ruins, achievements, and comic scenes naturally guide the player from one biome to the next.

The first authored route is:

```text
forest -> autumnForest -> desert -> volcano
```

Each biome should occupy roughly a `100 x 100` block area, with a center that acts as the biome core, achievement unlock point, and ruin placement anchor.

## Scope

This design covers:

- Converting biome regions into global authored route data.
- Keeping the player free to fly instead of enforcing hard progression gates.
- Defining biome entry, biome-center achievement, ruin activation, and story comic events.
- Preparing biome coordinates for future `128 x 128` terrain chunk streaming.
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
  centerUnlockRadius: 8,
  ruinActivationRadius: 5,
  regions: [
    {
      id: 'forest',
      displayName: 'Forest',
      center: [0, 0],
      radius: 50,
      weight: 1,
      storyOrder: 0,
      achievementId: 'biome_forest_core',
      ruinId: 'forest_ruin',
      storyId: 'forest_comic'
    },
    {
      id: 'autumnForest',
      displayName: 'Autumn Forest',
      center: [145, 145],
      radius: 50,
      weight: 1,
      storyOrder: 1,
      achievementId: 'biome_autumn_forest_core',
      ruinId: 'autumn_forest_ruin',
      storyId: 'autumn_forest_comic'
    },
    {
      id: 'desert',
      displayName: 'Desert',
      center: [290, 80],
      radius: 50,
      weight: 1,
      storyOrder: 2,
      achievementId: 'biome_desert_core',
      ruinId: 'desert_ruin',
      storyId: 'desert_comic'
    },
    {
      id: 'volcano',
      displayName: 'Volcano',
      center: [435, 190],
      radius: 50,
      weight: 1,
      storyOrder: 3,
      achievementId: 'biome_volcano_core',
      ruinId: 'volcano_ruin',
      storyId: 'volcano_comic'
    }
  ]
}
```

The spacing deliberately crosses future chunk boundaries. With `128 x 128` chunks, the route forces the streaming system to handle global coordinates instead of repeatedly generating the same local biome layout.

## Coordinate Model

The core rule is:

```text
world block = chunk origin + local cell
```

Examples:

```text
chunk [1, 1] origin = [128, 128]
local cell [17, 17] = world block [145, 145]
autumnForest center = [145, 145]
```

Terrain generation, biome scoring, prefab randomness, ruin placement, and player biome detection should all use world block coordinates. Rendering can still position chunk-local geometry under a chunk root group.

## System Boundaries

### ChunkManager

Owns terrain chunk lifecycle. It decides which `128 x 128` chunks are active around the aircraft, keeps at most two chunk groups visible, and unloads chunks that are no longer relevant.

It should not know about achievements, comics, or story completion.

### Chunked Terrain Generation

Adapts the existing terrain generation path to accept a chunk origin. Biome sampling and noise sampling use global block coordinates. The generated `TerrainMap` can still expose local `x,z` cells to renderers, but each terrain map needs chunk metadata so systems can convert local cells back to world cells.

### BiomeRouteService

Owns authored route interpretation:

- Sort regions by `storyOrder`.
- Resolve current biome from player world block position.
- Resolve the next recommended biome based on progress.
- Compute distance to region centers.
- Emit route-level events such as biome entered and center reached.

It should be pure enough to test without Three.js.

### ProgressState

Tracks one-session progression:

- entered biome ids
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

- current biome entered message
- next recommended biome or ruin direction
- achievement unlock notice
- all-biomes-complete notice

The comic overlay displays the four-panel story for a ruin activation. Comic content is addressed by `storyId`, so placeholder panels can ship before final art.

## Event Flow

Every update:

1. Read aircraft world position.
2. Convert to world block position.
3. Ask `BiomeRouteService` for current region and nearest story target.
4. If the dominant biome changed, emit `biomeEntered`.
5. If the player is within `centerUnlockRadius` of the active story biome center, emit `biomeCenterReached`.
6. Unlock the achievement once for that biome.
7. If the player activates the ruin inside `ruinActivationRadius`, emit `ruinActivated`.
8. Show the matching comic overlay.
9. Mark the story id viewed and advance the recommended story target.

The player may visit later biomes early. Enter UI can still fire, but achievement and ruin progression should follow story order unless an explicit bypass is added later.

## Player Guidance

The map remains freely flyable. Guidance is soft:

- No invisible walls.
- No forced teleporting.
- No hard lock that prevents entering a later biome.
- UI points the player toward the next intended biome center.
- Ruin activation only advances the story target when it matches the current story order.

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
- Missing `achievementId`, `ruinId`, or `storyId` should disable that specific event while leaving biome generation intact.
- Missing comic content should show a placeholder comic overlay with the `storyId`.

## Testing

Focused tests should cover:

- Global coordinate biome scoring uses `worldX/worldZ`.
- Chunk-local coordinates convert correctly to global coordinates.
- Route regions sort by `storyOrder`.
- Entering a biome emits one `biomeEntered` event per transition.
- Center unlock triggers once inside `centerUnlockRadius`.
- Visiting a later biome early does not advance the story target.
- Activating the current-order ruin advances progress.
- Progress state does not duplicate achievements, ruins, or viewed stories.
- Missing route metadata degrades without crashing terrain generation.

Manual verification should cover:

- The four-biome route is spatially readable from the top-down aircraft camera.
- The player can fly away from the intended route without being blocked.
- UI guidance still makes the next intended biome clear.
- Chunk loading later shows only the current and nearest target-side chunk while maintaining continuous biome layout.

## Acceptance Criteria

- The authored route order is `forest -> autumnForest -> desert -> volcano`.
- Biome centers use global block coordinates.
- Each region radius is around `50`, producing roughly `100 x 100` biome areas.
- The player can freely enter any biome.
- Story progression advances in route order through biome centers and ruins.
- The chunk-streaming design can load at most two visible chunks without duplicating biome layouts.
- Runtime UI and story overlays are separate from debug panels.
- Existing terrain, prefab, water, lava, and aircraft systems remain separable from route progression logic.
