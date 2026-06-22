# Water Depth Detail Design

## Goal

Replace the current uniform-color LEGO water with a clearer stylized surface that communicates water depth and has controlled animated detail.

The result should:

- Fit the existing saturated LEGO visual language.
- Show distinct shallow, transition, and deep water colors.
- Use medium-strength animated highlights.
- Remain nearly opaque and visually stable under the orthographic bird's-eye camera.
- Preserve the current GPU-instanced rendering model.

## Current State

`createWaterMaterial()` currently creates one `MeshStandardNodeMaterial` with:

- A fixed `colorNode`.
- Fixed roughness.
- No animated nodes.
- No depth-derived color variation.

`WaterBrickRenderer` places all water cells in one `InstancedMesh`. The terrain data still contains the original surface height for every water cell, so water depth can be derived without rendering underwater terrain.

## Selected Approach

Use three water buckets:

- `shallow`
- `transition`
- `deep`

Each bucket uses:

- The existing shared LEGO brick geometry.
- One `InstancedMesh`.
- One material created by the same material factory with a different base color.
- Shared animation parameters and node structure.

The water renderer therefore uses at most three draw calls. Water cells are classified only when the terrain is built or rebuilt. There are no per-frame JavaScript matrix updates.

## Water Classification

For each water cell:

```js
const depth = waterLevel - surfaceCell.height
```

The initial thresholds are:

```js
depth <= shallowMaxDepth       // shallow
depth <= transitionMaxDepth    // transition
otherwise                      // deep
```

Recommended defaults:

```js
shallowMaxDepth: 1,
transitionMaxDepth: 3
```

Threshold comparison is inclusive. A water cell at exactly `shallowMaxDepth` is shallow, and one at exactly `transitionMaxDepth` is transition water.

Classification should be implemented as a small exported pure function so threshold behavior can be tested independently from Three.js rendering.

This version intentionally does not create a separate shoreline or foam bucket. Shallow water provides the bright edge treatment without introducing a fourth visual class.

## Material Design

Use `MeshPhysicalNodeMaterial` to keep the surface consistent with the glossy plastic LEGO terrain.

Recommended default colors:

```js
shallowColor: '#42DDEB',
transitionColor: '#168FD2',
deepColor: '#0757A6'
```

Recommended physical settings:

```js
roughness: 0.30,
metalness: 0,
clearcoat: 0.45,
clearcoatRoughness: 0.20,
opacity: 1
```

The material remains in the opaque render path with `transparent` set to `false`. The requested nearly opaque look is produced through saturated color, highlights, and glossy reflections rather than alpha blending. This avoids transparent sorting and depth-order artifacts.

## Animated Detail

The fragment color uses world-space position and TSL `time`.

The pattern combines:

1. A primary low-frequency directional sine wave.
2. A secondary crossing sine wave with a different direction, frequency, and speed.
3. A weaker high-frequency detail wave that breaks up the regular interference pattern.

The combined signal is remapped with `smoothstep` so it mainly creates moving highlight bands rather than changing the whole water color uniformly.

The final color is:

```text
bucket base color
  -> slightly modulated by broad ripple brightness
  -> mixed toward a cyan-white highlight color in selected bands
```

There is no vertex displacement. LEGO studs and brick silhouettes remain fixed.

Recommended starting controls:

```js
rippleSpeed: 0.75,
rippleScale: 7.0,
rippleStrength: 0.12,
detailScale: 18.0,
detailStrength: 0.035,
highlightColor: '#BDF8FF',
highlightStrength: 0.24
```

The three materials receive separate TSL uniform nodes initialized from the same configuration. The debug panel updates all corresponding uniform nodes together, so the buckets remain visually synchronized.

## Configuration

Expand `worldConfig.water`:

```js
water: {
  shallowColor: '#42DDEB',
  transitionColor: '#168FD2',
  deepColor: '#0757A6',
  highlightColor: '#BDF8FF',
  shallowMaxDepth: 1,
  transitionMaxDepth: 3,
  rippleSpeed: 0.75,
  rippleScale: 7.0,
  rippleStrength: 0.12,
  detailScale: 18.0,
  detailStrength: 0.035,
  highlightStrength: 0.24,
  roughness: 0.30,
  clearcoat: 0.45,
  clearcoatRoughness: 0.20,
  opacity: 1
}
```

The material factory should use defaults for every property so isolated tests and future callers do not require a complete config object.

## Renderer Structure

`WaterBrickRenderer` owns a bucket record:

```js
{
  shallow: { mesh, material, capacity },
  transition: { mesh, material, capacity },
  deep: { mesh, material, capacity }
}
```

During `build()`:

1. Traverse terrain cells once.
2. Skip non-water cells.
3. Classify each water cell by derived depth.
4. Append its coordinates to the matching bucket list.
5. Ensure each non-empty bucket has enough instance capacity.
6. Update instance matrices and counts.
7. Set empty existing bucket meshes to `count = 0`.

Mesh names:

- `WaterShallowInstances`
- `WaterTransitionInstances`
- `WaterDeepInstances`

The group remains named `WaterBricks`.

`dispose()` disposes all bucket meshes and materials, removes the group from its parent, and clears bucket references.

## Debug Controls

Add a `Water` subsection to `MaterialPanel`.

Expose:

- Ripple speed.
- Ripple scale.
- Ripple strength.
- Detail scale.
- Detail strength.
- Highlight strength.
- Roughness.
- Clearcoat.
- Clearcoat roughness.

Colors and depth thresholds remain configuration-only in the first implementation. This keeps the panel focused and avoids terrain reclassification semantics in a material-only debug control.

Changing node animation values updates TSL uniforms directly. Changing physical material properties updates all three water materials.

## Error Handling and Edge Cases

- If a bucket is empty, retain an existing mesh with `count = 0`; do not create a new mesh solely for an empty bucket.
- Clamp or normalize invalid thresholds so `transitionMaxDepth` cannot behave below `shallowMaxDepth`. The pure classifier should treat `transitionMaxDepth` as at least `shallowMaxDepth`.
- Material numeric defaults should use nullish fallback rather than truthiness, preserving valid zero values.
- A terrain with no water should produce no visible water instances and should not throw.
- Terrain rebuilds must reuse capacity where possible and must not duplicate bucket meshes in the group.

## Testing

Add focused automated tests for:

### Classification

- Exact shallow boundary.
- Exact transition boundary.
- Deep water above the transition boundary.
- Reversed or equal threshold handling.

### Material

- Creates `MeshPhysicalNodeMaterial`.
- Sets `colorNode`.
- Creates all expected TSL uniforms.
- Uses configured physical values.
- Preserves explicit zero-valued configuration.

### Renderer

- Places cells into the correct buckets.
- Creates no more than three instance meshes.
- Reuses a bucket mesh when capacity is sufficient.
- Hides emptied buckets by setting count to zero.
- Disposes all owned meshes and materials.

## Visual and Performance Verification

Run the automated test suite and production build, then inspect the main scene.

Visual checks:

- Shallow water is bright cyan and reads clearly near terrain.
- Transition water bridges the shallow and deep colors without a harsh visual jump.
- Deep water stays saturated and does not become nearly black.
- Animated highlights are continuously visible but do not dominate the scene.
- High-frequency detail does not shimmer excessively under the fixed camera.
- Water still reads as LEGO plastic rather than realistic ocean water.

Performance checks:

- Water draw calls are at most three.
- No per-frame CPU loop updates water instance matrices.
- No transparent sorting artifacts are introduced.
- Terrain regeneration remains responsive at the configured 128 × 128 size.

## Out of Scope

- Shoreline foam classification.
- Vertex displacement or geometry waves.
- Refraction, reflection render targets, or screen-space effects.
- Underwater terrain rendering.
- Per-instance water colors in a single draw call.
- New texture assets.
