# Water Optimization Initial Plan

## Goal

Improve the current LEGO water from a flat translucent blue layer into a saturated, game-like water surface with clearer shoreline and depth variation.

The first version should preserve the existing performance model:

- Keep water as instanced LEGO bricks.
- Avoid per-frame JavaScript matrix updates.
- Avoid deforming the brick geometry.
- Keep the visual language playful and saturated rather than physically realistic.

## Current State

Water is rendered by `WaterBrickRenderer` as one translucent `InstancedMesh` using the shared 2x2 LEGO brick geometry. The water material currently applies a simple time-driven color ripple in TSL.

Water cells are already known from the terrain surface data:

- A cell is water when `height <= waterLevel`.
- The original terrain height is still available even though underwater bricks are not rendered.
- This means shallow water and deep water can be inferred without generating underwater geometry.

## Visual Direction

The target is high-saturation game water:

- Bright cyan shoreline and shallow-water areas.
- Stronger blue in deeper water.
- White-blue foam or highlight accents near land.
- Noticeable but controlled animated color ripple.
- Glossy plastic feel that fits the LEGO terrain.

The water should read clearly from the fixed orthographic bird's-eye camera and should not attempt to look like a realistic ocean.

## Scope

### Included

- Improve `createWaterMaterial()` with richer color, opacity, ripple, highlight, and glossy plastic controls.
- Add terrain-derived water classification in `WaterBrickRenderer`.
- Split water into shoreline, shallow, and deep buckets if needed for stable per-class materials.
- Add debug controls for the new material parameters.
- Keep all water animation on the GPU through TSL material nodes.

### Excluded

- Vertex displacement or physical waves.
- Per-frame CPU updates to water instance matrices.
- Underwater terrain rendering.
- Refraction, screen-space reflections, or post-processing water effects.
- New water prefab assets.

## Classification Rules

Each water cell can be classified from `terrainMap` and `config.terrain`:

```js
const depth = waterLevel - surfaceCell.height
const shore = hasLandNeighbor(x, z)
const shallow = depth <= 1
const deep = depth >= 2 && !shore
```

Recommended first-pass bucket priority:

1. `shore`: water cells with at least one land neighbor in the 4-neighbor or 8-neighbor set.
2. `shallow`: water cells with `depth <= 1`.
3. `deep`: all remaining water cells.

Use 8-neighbor detection if the shoreline looks too sparse from the top-down camera. Use 4-neighbor detection if the shoreline band looks too thick.

## Material Design

Extend the water config with explicit saturated colors and highlight controls:

```js
water: {
  color: '#0877ff',
  shallowColor: '#43e6ff',
  deepColor: '#0877ff',
  shoreColor: '#9ff7ff',
  foamColor: '#e8ffff',
  opacity: 0.78,
  rippleStrength: 0.11,
  rippleSpeed: 0.8,
  highlightStrength: 0.28,
  fresnelStrength: 0.35
}
```

The TSL material should combine:

- Two crossing sine ripples using `positionWorld.x`, `positionWorld.z`, and `time`.
- A saturated base color per water bucket.
- A light foam/highlight tint blended by ripple intensity.
- Glossy plastic settings through roughness, clearcoat, and environment intensity where supported by the selected node material.
- Transparent rendering with controlled opacity.

The first implementation should prefer visual stability over complex procedural patterns.

## Rendering Strategy

Preferred initial implementation: three water `InstancedMesh` buckets.

- `WaterShoreInstances`
- `WaterShallowInstances`
- `WaterDeepInstances`

Each bucket uses the same LEGO brick geometry and the same material factory with different config values. This raises water draw calls from 1 to at most 3, but avoids relying on per-instance color support in the TSL material path.

If later testing confirms instance colors work cleanly with the node material, the buckets can be collapsed back into a single mesh.

## Performance Expectations

### Material Enhancement

- Draw calls: unchanged per bucket.
- CPU: no meaningful per-frame increase.
- GPU: slightly more fragment shader work from extra ripple and highlight math.
- Risk: low.

### Shoreline And Depth Buckets

- Draw calls: water increases from 1 to up to 3.
- CPU: classification cost only during terrain rebuild.
- GPU: still instanced and lightweight.
- Risk: low to medium, mainly around visual tuning and transparency ordering.

### Avoided Costs

- No per-frame `setMatrixAt()` calls.
- No new geometry generation per frame.
- No screen-space water passes.
- No dynamic reflection or refraction textures.

## Implementation Steps

1. Expand `worldConfig.water` with saturated color, opacity, highlight, and fresnel parameters.
2. Update `createWaterMaterial()` to accept per-bucket color overrides and produce the high-saturation water look.
3. Refactor `WaterBrickRenderer` so it classifies water cells into shore, shallow, and deep buckets.
4. Build or reuse one `InstancedMesh` per bucket, preserving the existing capacity reuse pattern.
5. Update `dispose()` so all water meshes and materials are released correctly.
6. Extend `MaterialPanel` with controls for opacity, ripple, highlight, and fresnel. Keep bucket colors in `worldConfig` for the first version to avoid an overloaded debug panel.
7. Run build/lint verification.
8. Start the local preview and visually check water from the main camera.

## Verification

Functional checks:

- Terrain still regenerates without duplicate water groups.
- Water cells still align with terrain grid cells.
- Shoreline water appears only near land.
- Shallow and deep water are visually distinct.
- AO preview still hides water as before.

Performance checks:

- Water draw calls remain at most 3.
- No per-frame CPU loop updates water instance matrices.
- Terrain regeneration time does not noticeably regress for the 128x128 map.

Visual checks:

- Water reads as saturated game-style LEGO water.
- Shoreline is visible but not noisy.
- Deep water does not become too dark against the terrain.
- Ripple animation is noticeable but not distracting.

## Open Decisions

- Start with 8-neighbor shoreline detection unless it creates an overly thick shoreline band.
- Use three material buckets for the first implementation to reduce TSL instance-color risk.
- Keep vertex animation out of scope until the static bucketed version is visually approved.
