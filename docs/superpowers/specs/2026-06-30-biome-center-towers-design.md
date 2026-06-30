# Biome Center Towers Design

## Goal

Add temporary landmark buildings at each biome center so the player can discover the restored planet's hidden history.

The core narrative conflict is that the planet has recovered, but the civilization that damaged it still exists as digitized survivors. The player first reads each center as a beautiful biome destination, then learns that every center is also an ecological validation point for the old civilization's resurrection protocol.

The first implementation should use the authored `tower.glb` asset, fixed positions, biome-colored tower lights, emissive materials, and `console.log` triggers only.

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
- Each tower uses the same GLB asset.
- Each tower's `light` mesh is colored per biome and receives matching emissive glow.
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

## Tower Asset and Placement

Use the completed tower asset:

- Asset: `public/model/tower/tower.glb`
- Source name: `biomeTowerModel`
- Source path: `model/tower/tower.glb`
- Brick footprint meaning: `4 x 4`
- Origin behavior: the asset origin is already at the tower base.

Because the GLB origin is at the base, the runtime should place the cloned scene directly on the highest sampled terrain surface inside the tower footprint:

```js
{
  x: centerX * terrain.cellSize,
  y: terrainSurfaceY,
  z: centerZ * terrain.cellSize
}
```

Do not add a half-height offset. That rule only applied to centered box geometry and would make the GLB float.

The tower system should sample the same terrain generator used by chunk terrain so the tower sits on the generated surface. Since the tower occupies `4 x 4` cells, sample that footprint around the biome center and use the highest cell height, then convert that height with `terrain.layerHeight`.

## Light Material Rule

The GLB currently contains these top-level objects:

```text
root
  bevel-hq-brick-2x2.003
  light
  tower
```

Only the `light` mesh should receive biome-specific color and emission. The structural tower meshes should keep their Blender-authored materials.

The runtime should:

- Clone the tower scene once per biome center.
- Traverse the clone and find meshes whose base name matches `lightMeshName`.
- Treat Blender numeric suffixes such as `.001` as the same base name if they appear later.
- Clone only the matched `light` material or material array.
- Set `material.color` to the biome light color when supported.
- Set `material.emissive` to the biome light color when supported.
- Set `material.emissiveIntensity` from config.
- Optionally set `material.toneMapped = false` if the glow needs to read as a stronger energy window.
- Mark cloned light materials with an ownership flag so disposal only releases runtime clones.

Do not mutate the imported GLB source scene or its source materials.

## Data Source

Add a separate config block for tower behavior rather than overloading prefab placement:

```js
biomeCenters: {
  enabled: true,
  assetName: 'biomeTowerModel',
  triggerRadius: 3,
  footprintCells: 4,
  lightMeshName: 'light',
  towers: {
    forest: {
      light: {
        color: '#43ff7a',
        emissiveIntensity: 1.8
      },
      log: 'Forest validation reached: biomass exploitation record unlocked.'
    },
    autumnForest: {
      storyAlias: 'badlands',
      light: {
        color: '#b24cff',
        emissiveIntensity: 1.6
      },
      log: 'Badlands validation reached: mining waste record unlocked.'
    },
    desert: {
      light: {
        color: '#ffd34a',
        emissiveIntensity: 1.5
      },
      log: 'Desert validation reached: groundwater collapse record unlocked.'
    },
    volcano: {
      light: {
        color: '#ff4a1f',
        emissiveIntensity: 2.2
      },
      log: 'Volcano validation reached: geothermal extraction record unlocked.'
    }
  }
}
```

`WorldConfig.biomes.regions` remains the authoritative source for tower positions. The `biomeCenters.towers` map only supplies presentation, light material settings, and trigger text keyed by biome ID.

The implementation should also register the tower asset in `src/assets/sources.js`:

```js
{ name: 'biomeTowerModel', type: 'gltfModel', path: 'model/tower/tower.glb' }
```

## Architecture

Create a small world system, tentatively `BiomeCenterSystem`, under `src/world/biomes` or another nearby world folder.

Responsibilities:

- Read `config.biomes.regions` for center positions.
- Read `config.biomeCenters` for enablement, asset name, light mesh name, light color, emissive intensity, and log text.
- Clone one tower scene per configured region.
- Apply biome light material overrides to only the configured light mesh.
- Add those meshes to a local `THREE.Group`.
- Track which biome center logs have already fired in the current runtime session.
- Accept player position updates each frame.
- Dispose runtime-cloned light materials and cloned scene resources without disposing imported source materials or shared textures.

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
- The GLB consciousness tower is a fixed landmark asset, not a scatter variant.
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
- No procedural tower geometry.
- No biome recoloring of the structural tower body.
- No random placement.
- No changes to biome generation, chunk loading, prefab distribution, or radar target selection.

## Validation

Implementation validation should include:

- Run `npm run build`.
- Confirm `tower.glb` is registered as `biomeTowerModel`.
- Fly to each center and confirm one tower GLB is visible.
- Confirm each tower appears at the matching `WorldConfig.biomes.regions` center.
- Confirm each tower base is placed at the highest Y value across its `4 x 4` footprint.
- Confirm each tower's `light` mesh uses the biome-specific color and emission.
- Confirm non-light tower meshes keep their Blender-authored materials.
- Confirm each tower logs once when the player enters the trigger radius.
- Confirm `autumnForest` remains the technical ID while its log can describe the badlands evidence site.

Focused unit tests are optional for the first GLB pass. If material override or trigger logic is extracted into pure helpers, test light mesh matching, one-shot radius behavior, and cloned-material disposal ownership there.
