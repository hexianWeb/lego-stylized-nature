# Tree configuration

Tree models are shared prefab assets, but each biome can configure their colors and selection weights independently in `src/world/biomes/definitions/`:

```js
trees: {
  leafColor: '#2e8b3c',
  trunkColor: '#6e4a28',
  variantWeights: { treeModel: 3, fruitTreeModel: 1, cTreeModel: 1 },
},
prefabs: [
  { id: 'tree', density: 0.015, minHeight: 4, maxSlope: 2 },
  // Other prefab rules follow in priority order.
],
```

- `leafColor` and `trunkColor` no longer depend on terrain colors or palettes. Missing colors use the default forest green and brown. The existing seeded HSL variation is unchanged.
- `variantWeights` keys match the `source` names of variants in `src/assets/manifests/biomePrefabs.js`, not GLB paths. Omitted sources and nonpositive or invalid weights are excluded. An empty object disables all tree variants, allowing later prefab rules to use those cells. Omitting `variantWeights` uses the manifest weights.
- Keep density, height and slope limits in the `tree` prefab rule. Its position in `prefabs` retains the existing placement priority; only one prefab is placed per cell.
- A new tree model still needs a resource in `src/assets/sources.js` and a variant in the prefab manifest. Biome weights select among those registered variants.
- Changes to weights take effect on the next prefab build. Color changes refresh their cached base HSL on the next color sample/build; they do not automatically recolor already uploaded instances.

The default forest and autumn forest configurations retain the previous colors, density, equal model weights, orientation and coordinate-seeded placement. No clustering, spacing, scale variation or worker scheduling changes are introduced here.
