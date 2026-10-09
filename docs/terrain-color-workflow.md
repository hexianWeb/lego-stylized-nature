# Terrain color workflow

Open the development page with `#debug`, then expand **Terrain Colors**.

## Color scheme

Each biome has independent `surface`, `subsurface`, `deep`, and `shore` palettes.
The initial three colors are generated around the biome's existing base color.
Each brick selects one exact palette color; there is no color interpolation.
Three.js converts the authored Hex colors to linear sRGB for `instanceColor`.

- Choose a biome and layer to edit its palette.
- Edit colors and their **Tone center** positions; endpoints stay at 0 and 1.
- Selection boundaries lie halfway between neighboring tone centers. With
  centers at 0, 0.5, and 1, the main color covers tones 0.25–0.75. At a boundary,
  the higher center wins. Move centers to adjust each color's region.
- Add/remove colors (2–8 colors per palette). A new entry copies an existing
  color until you choose its color; it does not generate an intermediate shade.
- **Save scheme** downloads a versioned JSON file; **Load scheme** applies one.
  Export includes every biome's palettes and noise/height settings, but excludes preview
  state, terrain generation settings, lighting, and AO.
- Version 2 uses discrete selection. Version 1 schemes can also be loaded: their
  authored anchor colors become palette entries, with the default height settings.

Schemes live in `world.config.terrain.color`. Debug edits are session-local;
save JSON to retain a study. Loading JSON refreshes colors on the current terrain.

## Noise

The color field uses global logical grid coordinates, independent of chunk size,
instance order, and chunk debug spacing. A brick is sampled once; its entire
instance receives one base color.

- Surface/shore: 2D low-frequency simplex noise.
- Subsurface/deep: 3D low-frequency simplex noise, with a weak horizontally
  warped layer signal. The default layer weight is 0.12, so regions dominate.
- Region size is measured in horizontal cells; rock/band size and bend are
  measured in vertical brick layers.
- Color seed is independent of the terrain-generation seed.
- Brick variation is a small deterministic offset in the tone coordinate. It
  can change palette selection near boundaries, but never creates a new shade.

## Height influence

**Terrain height influence** adds a limited bias to the noise-derived tone. It
uses the generated surface height of the column, including the terrain height
curve. Rock noise still varies vertically between bricks in that column.

- **Influence** defaults to 0.25; 0 disables height influence, with a maximum of 0.5.
- **From / To (layers)** define a global normalization range (default 0–36).
  Set the range to match the elevations whose colors you want to influence.
- Higher terrain favors later palette entries; lower terrain favors earlier ones.
  You control what colors those entries represent.
- The global range is shared by all chunks, so chunk boundaries do not reset
  height normalization. The noise amplitude is preserved when influence changes.

The combined tone mapping is:

```text
height01 = clamp((surfaceHeight - heightMin) / (heightMax - heightMin), 0, 1)
heightBias = (height01 - 0.5) * heightInfluence
t = clamp(0.5 + 0.5 * contrast * noise + bias + heightBias + brickVariation, 0, 1)
color = palette entry closest to t
```

## Tuning order

1. Select **Noise / tone** to judge region size, rock proportions, layer bending,
   and height bias. Start with large regions and a low layer weight.
2. Select **Base colors** to tune the discrete palette without lighting or AO
   modulation. Contrast controls spread around the main color; bias shifts the
   whole field. Adjust height influence until elevations guide the colors while
   individual noise regions remain recognizable.
3. Inspect **Loaded bricks · all biomes/layers** for the tone histogram. Its
   percentages describe all loaded terrain instances, not just the selected palette.
   Refresh distribution after moving the camera/player to another region.
4. Select **Final material** to inspect the colors under the scene's lighting.
5. Save the scheme before comparing another seed or palette.

Color edits refresh instance-color buffers without rebuilding the terrain or
instance transforms. Preview modes isolate terrain by hiding water, lava,
prefabs, towers, and the aircraft.
