# Prefab Instance Color Design

## Goal

Allow selected parts of an instanced prefab to receive a deterministic per-instance color from a manifest palette. A flower or mushroom keeps one color across all of its color-enabled child meshes, while neighboring instances may use different colors.

The feature must preserve the current `InstancedMesh` batching model. It must not create one draw call per palette color.

## Scope

The first supported prefabs are:

- `landFlower`, using `flower.glb`
- `landMushroom`, using `mushroom_1.glb`

The Blender object-name convention is `_InstanceColor`:

- `flower_InstanceColor`
- `mushroom_InstanceColor`

Names with Blender numeric suffixes, such as `mushroom_InstanceColor.001`, also match. Other child meshes retain their existing appearance.

`mushroom_2.glb`, `mushroom_3.glb`, and `mushroom_4.glb` become redundant because their visual distinction is replaced by per-instance palette colors. Their source registrations, manifest variants, and files will be removed.

## Manifest Configuration

Instance-color behavior is opt-in and belongs in `src/assets/manifests/biomePrefabs.js`.

```js
landMushroom: {
  category: 'flora',
  placement: { surface: 'land' },
  variants: [
    { source: 'landMushroom1Model', weight: 1 }
  ],
  randomRotation: true,
  instanceColors: {
    meshNameSuffix: '_InstanceColor',
    palette: ['#c9110e', '#0158b8', '#ea9202', '#03b1a0']
  }
}
```

`landFlower` receives the same configuration shape with a flower-specific palette. The initial palettes should preserve the useful colors already present in the current source assets:

- Mushroom: red, blue, orange, and teal from `mushroom_1/2/3/4`
- Flower: the existing pink shades from the flower materials

The manifest uses CSS hex colors. An absent or invalid `instanceColors` configuration disables the feature for that prefab and leaves its current rendering path unchanged.

## Architecture

### Placement data

Each collected prefab transform receives a deterministic instance-color index when its manifest has a valid palette. The index is derived from:

- world seed
- prefab id
- placement coordinates

The selection must use the project's deterministic random utilities rather than `Math.random()`. Rebuilding the same world with the same seed therefore produces the same colors.

The chosen index is stored beside the transform. It is not added to the bucket key. Different colors remain in the same prefab/variant/biome bucket.

Untinted and uncolored prefabs retain their current transform shape and fast path where practical.

### Child mesh matching

`PrefabPlacer.buildVariantInstances()` continues traversing each mesh in the loaded GLB and creating one `InstancedMesh` per source child mesh.

A child is instance-color enabled when its object name matches the configured suffix immediately before the end of the name or a Blender numeric suffix:

```text
*_InstanceColor
*_InstanceColor.001
*_InstanceColor.002
```

The match is case-sensitive. Material names and mesh-data names are not considered.

### Per-instance color

For a matching child mesh:

1. Clone its material or material array.
2. Set the cloned material base color to white.
3. Preserve textures and all other material properties.
4. Assign the palette color with `InstancedMesh.setColorAt(instanceIndex, color)`.
5. Mark `instanceColor.needsUpdate` after all instances are populated.

Setting the cloned base color to white ensures the palette value is the final visible base color rather than a multiplication against the original pink or red material.

All matching child meshes read the color index stored on the same transform, so multiple color-enabled parts of one prefab instance always receive the same color.

For a nonmatching child mesh, no instance color attribute is created.

## Interaction With Biome Tint

`biomeTints` and `instanceColors` have separate meanings:

- `biomeTints` applies one bucket-level material tint based on biome.
- `instanceColors` applies different colors to selected child meshes within the same bucket.

For an `_InstanceColor` child mesh, instance color controls the final base color and takes precedence over the biome tint. The material is normalized to white before instance colors are applied.

For other child meshes, existing `biomeTints` behavior remains unchanged.

The feature does not add biome or palette colors to the bucket key and therefore does not increase bucket count.

## Material Ownership and Cleanup

The source GLB materials must never be mutated.

Materials cloned for instance coloring receive an ownership marker separate from the existing biome-tint marker. Cleanup disposes only owned material clones. Shared textures, geometries, and imported source materials are not disposed by this feature.

Material arrays preserve their original order and length. Every entry used by an instance-colored child is cloned and normalized consistently.

## Resource Cleanup

Implementation removes:

- `landMushroom2Model`, `landMushroom3Model`, and `landMushroom4Model` from `src/assets/sources.js`
- the corresponding three variants from `landMushroom`
- `public/model/prefab/mushroom_2.glb`
- `public/model/prefab/mushroom_3.glb`
- `public/model/prefab/mushroom_4.glb`

Biome definitions continue referencing `landMushroom`; no biome placement changes are required.

## Error Handling

- An empty palette disables instance coloring and emits one warning during validation or build.
- Invalid palette entries emit a warning and are excluded.
- If no valid colors remain, the source material is used unchanged.
- A configured prefab with no matching child name renders normally and emits one warning identifying the prefab and expected suffix.
- A transform with no color index falls back to the first valid palette color rather than producing an uninitialized instance color.

Warnings must not be emitted once per rendered instance.

## Testing

Tests should verify:

- deterministic color selection for the same seed, prefab id, and coordinates
- color variation across different placements
- all `_InstanceColor` child meshes of one prefab instance receive the same color
- Blender `.001` suffix matching
- nonmatching child meshes keep their source material and have no `instanceColor`
- matching materials are cloned, normalized to white, and cleaned up safely
- material arrays preserve order and shared textures are not disposed
- instance colors do not split transform buckets
- existing biome tint still applies to nonmatching child meshes
- invalid or empty palettes fall back safely with bounded warnings
- `landMushroom` has only `landMushroom1Model`
- removed mushroom source keys and GLB files are no longer referenced
- the existing prefab biome-tint tests continue passing

## Acceptance Criteria

- Neighboring flowers and mushrooms can display multiple configured colors in one biome.
- Each individual plant uses one consistent color across all `_InstanceColor` parts.
- Colors are stable for a fixed world seed.
- Palette colors are rendered as final colors, unaffected by the original target material base color.
- Unmarked parts retain their existing materials.
- Palette size does not increase draw calls or prefab bucket count.
- `mushroom_2/3/4` resources and loading paths are removed.
- Existing prefabs without `instanceColors` behave unchanged.
