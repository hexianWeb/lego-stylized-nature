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
- Instanced prefab bucketing by prefab, variant, and biome.
- Cloned material tinting for configured biome buckets.
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
- Bucketed materials: `InstancedMesh` buckets are split by `prefabId`, `variantIndex`, and `biomeId`.

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
    forest: '#6f7770',
    autumnForest: '#8a7760',
    desert: '#b99a69',
    volcano: '#343434'
  }
}
```

If a prefab has no `biomeTints`, behavior remains unchanged. If a prefab has tint config but the current biome is missing from that config, behavior also remains unchanged for that bucket.

Exact tint values should be tuned visually during implementation.

## Placement And Bucketing

`PrefabPlacer.collectTransforms()` currently buckets transforms by:

```js
prefabId:variantIndex
```

The new bucket key should include the main biome id:

```js
prefabId:variantIndex:biomeId
```

The build path then parses the bucket key and passes `prefabEntry` plus `biomeId` into the instanced mesh builder.

This keeps all instances inside a bucket visually consistent and avoids per-fragment shader branching. It also preserves instancing inside each biome-specific bucket.

## Material Tinting

Add a focused material resolver, either as a small helper in `PrefabPlacer.js` or as a separate utility if the file starts to grow:

```js
resolvePrefabMaterial(sourceMaterial, prefabEntry, biomeId)
```

Rules:

- If no tint exists for `biomeId`, return `sourceMaterial`.
- If a tint exists, clone `sourceMaterial`.
- Apply the tint to the clone's base color.
- Preserve the source material's maps and physical parameters.
- Mark the clone so cleanup can distinguish it from imported GLB materials.

Tinting should multiply the source color rather than fully replacing it. That preserves useful imported material variation while steering the color toward the biome palette.

Example cleanup marker:

```js
material.userData.isBiomeTintClone = true
```

## Resource Management

Imported GLB source materials should not be disposed by prefab rebuild cleanup because they belong to loaded resources. Only cloned tinted materials created by this feature should be disposed.

`clearInstances()` should continue disposing instanced mesh GPU resources and should additionally dispose tinted material clones when `material.userData.isBiomeTintClone` is true.

The resolver should create one cloned material per child mesh per tinted bucket. This is acceptable because rock and grass GLBs are expected to be single-mesh assets today, and the implementation still works if a future GLB has multiple child meshes.

## Performance

This approach trades a small number of extra draw calls for a simpler and more robust material path.

Expected first-version upper bounds:

- `commonRock`: 4 variants times up to 4 biomes, about 16 instanced mesh buckets.
- `landGrass`: 2 variants times the configured land biomes, about 6 instanced mesh buckets.

The map is currently 128 by 128 cells, and each bucket remains an `InstancedMesh`. This is much cheaper than one mesh per placed prefab and should be acceptable for the current scene scale.

If draw calls become a bottleneck later, a per-instance color approach can be evaluated as an optimization.

## Error Handling

Invalid tint values should not break world generation. If a configured tint cannot be parsed as a `THREE.Color`, the resolver should warn and fall back to the source material for that bucket.

Missing or partial config should be treated as normal:

- No `biomeTints`: unchanged behavior.
- Missing biome key: unchanged behavior for that biome.
- Multi-mesh GLB: tint each child mesh material independently.

## Integration Points

Expected file changes for implementation:

- `src/assets/manifests/biomePrefabs.js`
  - Add `biomeTints` for `commonRock` and `landGrass`.
- `src/world/prefabs/PrefabPlacer.js`
  - Include `biomeId` in transform buckets.
  - Pass prefab entry and biome id to instance construction.
  - Resolve tinted material clones for configured buckets.
  - Dispose cloned tinted materials on rebuild/dispose.

No changes are expected in biome definitions, terrain generation, or lava material code.

## Testing And Verification

Manual verification:

- `commonRock` appears with distinct tint in forest, autumn forest, desert, and volcano.
- `landGrass` appears with distinct tint in forest, autumn forest, and desert where it is placed.
- Biome borders use the cell's main biome and do not blend.
- Unconfigured prefabs such as mushrooms, flowers, water plants, and trees look unchanged.
- Rebuilding the world does not leave old tinted material clones alive.

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
