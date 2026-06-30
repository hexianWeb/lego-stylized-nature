# Biome Center Towers Design

## Goal

Add temporary landmark buildings at each biome center so the player can discover the restored planet's hidden history.

The core narrative conflict is that the planet has recovered, but the civilization that damaged it still exists as digitized survivors. The player first reads each center as a beautiful biome destination, then learns that every center is also an ecological validation point for the old civilization's resurrection protocol.

The first implementation should be deliberately small: colored box towers, fixed positions, and `console.log` triggers only.

## Current Context

`WorldConfig.biomes.regions` already defines the authored biome centers:

- `forest`
- `autumnForest`
- `desert`
- `volcano`

Those IDs should remain unchanged for now. `autumnForest` will act as the technical biome ID, while the story layer can present it as the badlands evidence site.

The project also has chunk streaming and prefab placement, but biome center towers are not random environmental decoration. They are fixed story landmarks and should be handled as their own small world system.

## Player-Facing Behavior

- Each biome region center has exactly one visible tower.
- The tower sits at the region center's X/Z world position.
- The tower is placed on the terrain surface so its base rests on the ground.
- Each tower uses a biome-specific color.
- When the player enters the tower trigger radius, the game logs a biome center message once.
- Leaving and re-entering the same radius should not spam logs during the same run.
- No UI, animation, achievement state, comic unlock, or saved progression is required in this version.

## Narrative Mapping

The tower is an "external ecosystem validation terminal" left by the original civilization. The player believes they are discovering restored biomes, but their visits are also proving that the planet is safe enough for the digitized civilization to attempt bodily resurrection.

Use this first mapping:

| Technical ID | Story Role | Past Wrongdoing | Initial Visual Tone |
| --- | --- | --- | --- |
| `forest` | Forest evidence site | Forests and biomass were treated as infinitely renewable resources. | High-saturation restored green. |
| `autumnForest` | Badlands evidence site | Mining waste and industrial runoff formed polluted colored strata. | Purple-red, rust, or mineral-stained color. |
| `desert` | Desert evidence site | Groundwater extraction and water waste collapsed the water cycle. | Gold/yellow sand and ruin tone. |
| `volcano` | Volcano evidence site | Geothermal and deep-core energy extraction destabilized the region. | Lava red/orange energy tone. |

The implementation should keep `autumnForest` as the config key. Any badlands wording belongs in tower labels, log text, or future story metadata.

## Tower Geometry

Use one placeholder box per center:

- Width: `0.6`
- Height: `1.8`
- Depth: `0.6`
- Brick footprint meaning: `3 x 3`
- Origin behavior: place the bottom face on the terrain surface, not the mesh center.

The mesh can use `THREE.BoxGeometry(0.6, 1.8, 0.6)` with its position set to:

```js
{
  x: centerX * terrain.cellSize,
  y: terrainSurfaceY + 0.9,
  z: centerZ * terrain.cellSize
}
```

The tower system should sample the same terrain generator used by chunk terrain so the placeholder sits on the generated surface. A simple implementation can generate a small terrain sample around the center block and read its height, then convert that height with `terrain.layerHeight`.

## Data Source

Add a separate config block for tower behavior rather than overloading prefab placement:

```js
biomeCenters: {
  enabled: true,
  triggerRadius: 3,
  towerSize: [0.6, 1.8, 0.6],
  towers: {
    forest: {
      color: '#39d65f',
      log: 'Forest validation reached: biomass exploitation record unlocked.'
    },
    autumnForest: {
      color: '#9b5a7a',
      storyAlias: 'badlands',
      log: 'Badlands validation reached: mining waste record unlocked.'
    },
    desert: {
      color: '#e8c64d',
      log: 'Desert validation reached: groundwater collapse record unlocked.'
    },
    volcano: {
      color: '#ff513d',
      log: 'Volcano validation reached: geothermal extraction record unlocked.'
    }
  }
}
```

`WorldConfig.biomes.regions` remains the authoritative source for tower positions. The `biomeCenters.towers` map only supplies presentation and trigger text keyed by biome ID.

## Architecture

Create a small world system, tentatively `BiomeCenterSystem`, under `src/world/biomes` or another nearby world folder.

Responsibilities:

- Read `config.biomes.regions` for center positions.
- Read `config.biomeCenters` for enablement, tower size, color, and log text.
- Create one tower mesh per configured region.
- Add those meshes to a local `THREE.Group`.
- Track which biome center logs have already fired in the current runtime session.
- Accept player position updates each frame.
- Dispose tower geometry/material resources.

`World` should own this system:

- Construct it during `World.build()` after terrain generation dependencies are available.
- Add it to the world group through the existing child-system lifecycle if practical.
- In `World.update()`, pass the aircraft position or call its normal `update()` after it can read player state.
- In `World.dispose()`, dispose it through the same child lifecycle.

## Placement and Chunking

The towers should not be part of `PrefabPlacer`.

Reasons:

- Prefabs are currently for environment scatter such as flora, rocks, and props.
- Tower positions are authored and story-critical.
- A future GLB consciousness tower should replace the placeholder directly without changing scatter rules.
- The existing prefab visibility window is player-driven and lazy-built; the tower system should have simpler fixed-landmark semantics.

The towers also should not be owned by individual chunk slots in the first implementation. There are only four towers, so keeping them directly under `World.group` is simpler and avoids tying story landmarks to terrain slot reuse.

## Trigger Rule

Use a simple distance check in world units:

```js
const dx = playerPosition.x - towerPosition.x
const dz = playerPosition.z - towerPosition.z
const reached = Math.sqrt(dx * dx + dz * dz) <= triggerRadius
```

When reached for the first time:

```text
[BiomeCenter] autumnForest reached: badlands evidence unlocked.
[BiomeCenter] Mining waste and industrial runoff formed the colored strata.
```

The exact log text can be tuned during implementation. The important behavior is that each tower logs once and clearly ties the beautiful biome to its historical wrongdoing.

## Non-Goals

- No formal progression state.
- No save/load behavior.
- No UI prompt yet.
- No comic or cutscene unlock.
- No player choice system yet.
- No GLB tower asset yet.
- No random placement.
- No changes to biome generation, chunk loading, prefab distribution, or radar target selection.

## Validation

Implementation validation should include:

- Run `npm run build`.
- Fly to each center and confirm one colored box tower is visible.
- Confirm each tower appears at the matching `WorldConfig.biomes.regions` center.
- Confirm each tower base appears ground-aligned.
- Confirm each tower logs once when the player enters the trigger radius.
- Confirm `autumnForest` remains the technical ID while its log can describe the badlands evidence site.

Focused unit tests are optional for the first placeholder pass. If the trigger logic is extracted into a pure helper, test the one-shot radius behavior there.
