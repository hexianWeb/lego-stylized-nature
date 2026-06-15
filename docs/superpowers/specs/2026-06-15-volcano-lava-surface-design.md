# Volcano Lava Surface Design

## Goal

The volcano biome should stop using forest or water-biome props such as grass, mushrooms, reeds, and water bubbles. Instead, it should gain LEGO lava surface features that make the biome visually richer from a fixed orthographic top-down camera.

The camera will never show underwater or underground views. Because of that, lava pools and cracks should be implemented as a simple top-surface overlay rather than as carved terrain, underground geometry, or a separate terrain volume.

## Scope

This design covers:

- Large lava pool regions inside the volcano biome.
- Small lava cracks or spots inside the volcano biome.
- A dedicated lava brick renderer.
- A TSL lava material with lightweight animated glow.
- Prefab placement avoidance on lava cells.
- Cleanup of incompatible volcano biome prefab rules.

This design does not cover:

- Real fluid simulation.
- Terrain height deformation for pools.
- Underground or side-wall lava rendering.
- Complex lava collision or gameplay rules.

## Data Model

Lava is represented as a surface feature on `surfaceCell`:

```js
surfaceCell.isLava = true
surfaceCell.lavaType = 'pool' // or 'crack'
```

Non-lava cells keep `isLava` false or undefined and `lavaType` null or undefined.

The feature generator should only mark cells where the dominant biome is `volcano`, or where the volcano weight passes a clear threshold. This keeps lava from bleeding deeply into unrelated biomes while still allowing some natural transition near biome borders if desired.

## Generation

Add a focused `VolcanoSurfaceFeatureGenerator`.

Responsibilities:

- Read `terrainMap` inputs that are already available during terrain generation, especially biome cells and surface cells.
- Generate a deterministic lava mask from the world seed.
- Mark larger connected regions as `pool`.
- Mark smaller sparse regions as `crack`.
- Avoid water cells and optionally avoid steep cells if cracks look too noisy on cliffs.

The first version can use simple seeded noise and distance thresholds rather than a complex shape algorithm:

- Pool candidates use low-frequency noise and a minimum connected size.
- Crack candidates use higher-frequency noise and thinner thresholds.
- Pool wins over crack when both overlap.

This keeps the code easy to inspect and tune.

## Rendering

Add `LavaBrickRenderer`, following the same broad pattern as `WaterBrickRenderer`.

Responsibilities:

- Traverse `terrainMap` surface cells.
- Collect cells where `surfaceCell.isLava` is true.
- Place one LEGO brick instance above the terrain surface, using `surfaceCell.height + 1` as the vertical layer.
- Use one material for both pool and crack cells in the first version.
- Optionally add per-instance color in a later version if pool and crack need different intensity.

The base terrain remains black or dark gray volcano rock. Lava is a separate top layer, so `BrickColorResolver` does not need lava-specific branches.

## TSL Material

Add `createLavaMaterial()` under `src/materials/tsl/lavaMaterial.js`.

The material should create a LEGO-like glowing plastic lava effect while staying lightweight:

- Animated color pulse from deep orange to yellow-orange.
- Emissive glow driven by world position plus time.
- Slight spatial variation so neighboring lava bricks do not pulse identically.
- Low or moderate roughness to preserve a plastic LEGO feel.
- No displacement in the first version, so brick silhouettes remain stable.

The effect should be subtle enough that the terrain still reads as LEGO bricks, not as liquid simulation.

## Prefab Rules

Update volcano prefab definitions:

- Remove `landGrass`.
- Remove `landMushroom`.
- Remove `phragmites`.
- Remove `waterBubble`.
- Keep `commonRock`.
- Add `pumice` only if its manifest and model are already wired.

Update `canPlacePrefab()` so ordinary prefab placement rejects lava cells:

```js
if (surfaceCell.isLava) {
  return false
}
```

If lava-specific prefabs are added later, they should opt into lava placement explicitly instead of bypassing this rule implicitly.

## Integration Points

Expected file changes:

- `src/world/terrain/VolcanoSurfaceFeatureGenerator.js`
  - New feature generator for volcano lava masks.
- `src/world/terrain/TerrainGenerator.js`
  - Generate lava features after height and surface classification, or call a post-classification feature step before returning `TerrainMap`.
- `src/world/bricks/LavaBrickRenderer.js`
  - New instanced brick renderer for lava overlay cells.
- `src/materials/tsl/lavaMaterial.js`
  - New TSL lava material.
- `src/world/world.js`
  - Instantiate, build, update, and dispose the lava renderer.
- `src/world/biomes/definitions/volcano.js`
  - Remove incompatible prefab rules and add lava tuning config.
- `src/world/prefabs/placementRules.js`
  - Reject ordinary prefab placement on lava cells.

## Tuning Parameters

Keep volcano lava parameters near the volcano biome definition so biome behavior is easy to understand in one place:

```js
lava: {
  poolDensity: 0.08,
  crackDensity: 0.05,
  minVolcanoWeight: 0.65,
  poolNoiseScale: 18,
  crackNoiseScale: 7
}
```

Exact values should be tuned visually after implementation.

## Testing And Verification

Manual verification:

- Volcano biome contains large pool-like lava regions and smaller cracks.
- Lava does not appear in forest, autumn forest, or desert regions.
- Grass, mushrooms, reeds, and water bubbles no longer appear in the volcano biome.
- Ordinary prefabs do not spawn on lava cells.
- Lava material visibly pulses or glows without making the scene visually noisy.
- AO preview still hides overlay renderers consistently with water and prefabs if needed.

Code verification:

- Run the existing lint or build command.
- Start the local Vite app.
- Inspect the scene from the existing orthographic camera.

## Open Decisions

The first implementation will use a single lava material for both pools and cracks. If visual tuning shows cracks need a dimmer or narrower treatment, that can be added later through per-instance color or a second material bucket.
