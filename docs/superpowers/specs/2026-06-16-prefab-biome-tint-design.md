# Prefab Biome Tint Design

## Goal

Rock and grass prefabs should visually adapt to the biome they are placed in without requiring separate GLB assets. The first version should only apply color tint variation, keeping the imported geometry, source texture maps, and material structure intact.

The system should be generic enough for any prefab to opt into biome tinting, but the first configured prefabs are:

- `commonRock`
- `landGrass`

## Scope

This design covers:

- Optional biome tint configuration in the prefab manifest.
- Main-biome tint selection during prefab placement.
- Instanced prefab bucketing by prefab, variant, and biome only when a tint applies.
- Cloned material tinting for configured biome buckets.
- Tint strength control so biome color can be subtle instead of a full multiply.
- Material array handling for imported GLB meshes.
- Cleanup of cloned tinted materials during prefab rebuild or disposal.

This design does not cover:

- Texture swapping.
- Smooth biome boundary blending.
- Shader-side biome lookups.
- TSL material rewrites for imported prefab GLB materials.
- New rock or grass model assets.

## Decisions

The first version uses these decisions:

- Tint only: no texture replacement, no roughness or metalness overrides.
- Generic support: any prefab can define `biomeTints`, but only rock and grass are configured initially.
- Main biome: tint is selected from `biomeCell.biomeId`, not blended weights.
- Manifest-owned config: tint data lives in `src/assets/manifests/biomePrefabs.js`.
- Bucketed materials: `InstancedMesh` buckets include `biomeId` only for placements where a configured tint applies.
- Bucket data should be stored as structured values rather than relying on parsing all fields from a string key.

## Data Model

Add an optional `biomeTints` object to a prefab manifest entry:

```js
commonRock: {
  category: 'rock',
  placement: { surface: 'land' },
  variants: [
    { source: 'commonRock1Model', weight: 1 },
    { source: 'commonRock2Model', weight: 1 },
    { source: 'commonRock3Model', weight: 1 },
    { source: 'commonRock4Model', weight: 1 }
  ],
  randomRotation: true,
  biomeTints: {
    forest: { color: '#6f7770', strength: 0.45 },
    autumnForest: { color: '#8a7760', strength: 0.5 },
    desert: { color: '#b99a69', strength: 0.55 },
    volcano: { color: '#343434', strength: 0.65 }
  }
}
```

Each biome tint entry should include:

- `color`: a CSS color string accepted by `THREE.Color`.
- `strength`: a value from `0` to `1`, where `0` leaves the source material color unchanged and `1` applies the full tint operation.

If a prefab has no `biomeTints`, behavior remains unchanged and the prefab should not be bucketed by biome. If a prefab has tint config but the current biome is missing from that config, behavior also remains unchanged and that placement should use the non-tinted bucket for the prefab variant.

Exact tint values should be tuned visually during implementation.

## Placement And Bucketing

`PrefabPlacer.collectTransforms()` currently buckets transforms by:

```js
prefabId:variantIndex
```

The new design should keep that bucket shape for placements that do not have an applicable tint. Only placements with an applicable `biomeTints[biomeId]` entry should include biome in the bucket identity.

The implementation can still use a compact internal key for the `Map`, but the value should hold structured metadata:

```js
{
  prefabId,
  variantIndex,
  biomeId: 'forest', // null when no tint applies
  tint: { color: '#6f7770', strength: 0.45 }, // null when no tint applies
  transforms: []
}
```

This avoids coupling build logic to a fragile `split(':')` contract and prevents accidental biome bucket expansion for unconfigured prefabs.

The build path should iterate the structured bucket values and pass `prefabEntry`, `biomeId`, and `tint` into the instanced mesh builder.

This keeps all instances inside a bucket visually consistent and avoids per-fragment shader branching. It also preserves instancing inside each biome-specific bucket.

## Material Tinting

Add a focused material resolver, either as a small helper in `PrefabPlacer.js` or as a separate utility if the file starts to grow:

```js
resolvePrefabMaterial(sourceMaterial, tint)
```

Rules:

- If `tint` is null, return `sourceMaterial`.
- If `tint` exists, clone `sourceMaterial`.
- Apply `tint.color` to the clone's base color using `tint.strength`.
- Preserve the source material's maps and physical parameters.
- Mark the clone so cleanup can distinguish it from imported GLB materials.

Tinting should avoid a raw full multiply because it can make imported materials too dark. The first version should compute a strength-controlled target color. A practical rule is:

1. Start with the source material color.
2. Compute a multiplied tint target from source color and tint color.
3. Lerp from source color to that target by `tint.strength`.

This preserves imported material variation while avoiding overly dark results when a biome tint is strong or low-value.

If `sourceMaterial` is an array, resolve each element independently and return a material array with the same order. If `sourceMaterial` is a single material, return a single material. This keeps GLB multi-material meshes correct.

Example cleanup marker:

```js
material.userData.isBiomeTintClone = true
```

## Resource Management

Imported GLB source materials should not be disposed by prefab rebuild cleanup because they belong to loaded resources. Only cloned tinted materials created by this feature should be disposed.

`clearInstances()` should continue disposing instanced mesh GPU resources and should additionally dispose tinted material clones when `material.userData.isBiomeTintClone` is true.

Disposing a cloned material must not dispose shared texture assets. The material clone may reference the same `map`, `normalMap`, or other texture objects as the imported GLB material. Cleanup should call `dispose()` on cloned material objects only and should not call `dispose()` on any texture reachable from those materials.

When `mesh.material` is an array, cleanup should iterate the array and dispose only entries marked as biome tint clones.

The resolver should create one cloned material per child mesh per tinted bucket. This is acceptable because rock and grass GLBs are expected to be single-mesh assets today, and the implementation still works if a future GLB has multiple child meshes.

## Performance

This approach trades a small number of extra draw calls for a simpler and more robust material path. The extra draw calls apply only to prefabs with active tint config.

Expected first-version upper bounds:

- `commonRock`: 4 variants times up to 4 biomes, about 16 instanced mesh buckets.
- `landGrass`: 2 variants times the configured land biomes, about 6 instanced mesh buckets.

The map is currently 128 by 128 cells, and each bucket remains an `InstancedMesh`. This is much cheaper than one mesh per placed prefab and should be acceptable for the current scene scale.

Unconfigured prefabs such as mushrooms, flowers, water plants, and trees should keep their current bucket count because they continue to bucket only by prefab and variant.

If draw calls become a bottleneck later, a per-instance color approach can be evaluated as an optimization.

## Error Handling

Invalid tint values should not break world generation. If a configured tint cannot be parsed as a `THREE.Color`, the resolver should warn and fall back to the source material for that bucket.

Missing or partial config should be treated as normal:

- No `biomeTints`: unchanged behavior.
- Missing biome key: unchanged behavior and no biome-specific bucket for that placement.
- Multi-mesh GLB: tint each child mesh material independently.
- Material array: preserve array length and material order.

## Integration Points

Expected file changes for implementation:

- `src/assets/manifests/biomePrefabs.js`
  - Add `biomeTints` for `commonRock` and `landGrass`.
- `src/world/prefabs/PrefabPlacer.js`
  - Include `biomeId` in transform buckets only when an applicable tint exists.
  - Store structured bucket values with `prefabId`, `variantIndex`, `biomeId`, `tint`, and `transforms`.
  - Pass prefab entry and biome id to instance construction.
  - Resolve tinted material clones for configured buckets.
  - Handle single materials and material arrays.
  - Dispose cloned tinted materials on rebuild/dispose without disposing shared textures.

No changes are expected in biome definitions, terrain generation, or lava material code.

## Testing And Verification

Manual verification:

- `commonRock` appears with distinct tint in forest, autumn forest, desert, and volcano.
- `landGrass` appears with distinct tint in forest, autumn forest, and desert where it is placed.
- Biome borders use the cell's main biome and do not blend.
- Unconfigured prefabs such as mushrooms, flowers, water plants, and trees look unchanged.
- Unconfigured prefabs do not gain additional biome-specific buckets.
- Material-array GLB meshes keep their material slot order if such an asset is used later.
- Rebuilding the world does not leave old tinted material clones alive.
- Rebuilding the world does not dispose shared imported textures.

Code verification:

- Run the existing build or lint command available in the project.
- Start the Vite app.
- Inspect the scene from the existing camera and tune tint hex values if needed.

## Future Extensions

Potential follow-up work:

- Add per-instance color if draw calls become a measured bottleneck.
- Add biome-weight blending if hard biome boundaries look too abrupt.
- Add optional roughness or emissive overrides if some prefab categories need stronger biome identity.
- Extend `biomeTints` to mushrooms, flowers, dead bushes, or future prefab categories.
