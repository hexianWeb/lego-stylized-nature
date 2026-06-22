# Water Noise Color Mix Design

## Goal

Replace the depth-bucket and animated ripple implementation with a cheaper static water treatment:

- One instanced water mesh.
- One physical node material.
- One grayscale noise texture.
- Three fixed water colors mixed from the sampled noise value.
- No water-depth classification.
- No time-based animation.

The visual goal is large, irregular LEGO water color regions rather than realistic water depth or waves.

## Reason for Replacing the Previous Design

The shallow, transition, and deep buckets were not visually distinct enough from the orthographic bird's-eye camera. They increased water draw calls from one to three and added fragment shader animation without producing enough visible benefit.

The replacement favors a simpler relationship between cost and visual result:

- Draw calls return to one.
- The shader performs one static texture sample and two simple color mixes.
- There are no time uniforms or per-frame CPU updates.
- Color variation is visible regardless of the terrain height below the water.

This document supersedes `2026-06-22-water-depth-detail-design.md`.

## Source Texture

Use:

```text
public/texture/noise.jpg
```

The source is a 512 × 512 grayscale Voronoi-style image. Its broad polygonal regions are suitable for visible color patches.

At load time:

```js
texture.wrapS = THREE.RepeatWrapping
texture.wrapT = THREE.RepeatWrapping
texture.colorSpace = THREE.NoColorSpace
texture.needsUpdate = true
```

Register it in `src/assets/sources.js` as:

```js
{ name: 'waterNoiseTexture', type: 'texture', path: 'texture/noise.jpg' }
```

## Rendering Structure

`WaterBrickRenderer` returns to the original single-mesh structure:

```js
{
  material,
  mesh,
  capacity
}
```

All water cells are collected into one list and placed in one `InstancedMesh` named:

```text
WaterBrickInstances
```

The renderer keeps the existing capacity growth and reuse behavior:

- Allocate only when no mesh exists or capacity is insufficient.
- Reuse the existing mesh during terrain regeneration.
- Set `mesh.count` to the current water-cell count.
- Update instance matrices only during `build()`.
- Dispose the single mesh and material during `dispose()`.

Water rendering uses exactly one draw call when water exists.

## Material Design

Use `MeshPhysicalNodeMaterial`.

Recommended colors:

```js
darkColor: '#0757A6',
midColor: '#168FD2',
lightColor: '#42DDEB'
```

Recommended physical settings:

```js
roughness: 0.3,
metalness: 0,
clearcoat: 0.45,
clearcoatRoughness: 0.2,
opacity: 1,
transparent: false
```

The material accepts:

```js
createWaterMaterial(waterConfig, waterNoiseTexture)
```

## Texture Sampling and Color Mix

Generate UVs from world-space horizontal position:

```js
const noiseUv = positionWorld.xz.mul(uTextureScale)
const noiseValue = texture(waterNoiseTexture, noiseUv).r
```

Recommended default:

```js
textureScale: 0.45
```

Map the grayscale value through two simple ranges:

```text
0.0 → 0.5: darkColor to midColor
0.5 → 1.0: midColor to lightColor
```

Conceptually:

```js
const darkToMid = mix(darkColor, midColor, noiseValue.mul(2))
const midToLight = mix(midColor, lightColor, noiseValue.sub(0.5).mul(2))
const finalColor = mix(darkToMid, midToLight, step(0.5, noiseValue))
```

The implementation may clamp or saturate interpolation inputs if required by the TSL API. It must not add procedural noise, multiple texture samples, time animation, or complex threshold logic.

If the texture is missing, use `midColor` as a fixed `colorNode`. The application must remain usable when the asset fails to load.

## Configuration

Replace the current water configuration with:

```js
water: {
  darkColor: '#0757A6',
  midColor: '#168FD2',
  lightColor: '#42DDEB',
  textureScale: 0.45,
  roughness: 0.3,
  clearcoat: 0.45,
  clearcoatRoughness: 0.2
}
```

Remove:

- Depth thresholds.
- Ripple speed, scale, and strength.
- Detail scale and strength.
- Highlight color and strength.
- Redundant opacity configuration.

## Integration

`World` passes the loaded texture into the renderer:

```js
this.waterBrickRenderer = new WaterBrickRenderer({
  config: this.config,
  brickGeometry: this.brickGeometry,
  waterNoiseTexture: resources.items.waterNoiseTexture
})
```

`WaterBrickRenderer` passes it to `createWaterMaterial()`.

`MaterialPanel` receives the single water material instead of a material array.

## Debug Controls

The `Water` folder exposes only:

- `textureScale`
- `roughness`
- `clearcoat`
- `clearcoatRoughness`

`textureScale` updates one TSL uniform. Physical controls update the single material.

Colors remain configuration-only.

## Removed Code

Delete:

```text
src/world/bricks/waterDepth.js
```

Remove:

- Bucket data structures.
- Bucket mesh names.
- Depth-classification imports and logic.
- Ripple uniforms and world-space sine calculations.
- Multi-material debug synchronization.
- Depth and ripple tests.

## Focused Testing

Keep tests deliberately small because the new logic is simple.

Add only two focused behavior groups:

1. Material behavior:
   - Creates a physical node material.
   - Configures the supplied texture for repeat sampling and non-color data.
   - Creates a color node and texture-scale uniform.
   - Falls back to the middle color when the texture is absent.

2. Renderer behavior:
   - Creates no more than one mesh.
   - Reuses that mesh when capacity is sufficient.
   - Updates count correctly when water-cell count changes.
   - Disposes the owned mesh and material.

Do not add tests for every configuration field or every debug binding. Production build and visual inspection cover those simple mappings more efficiently.

## Verification

Automated:

- Focused water tests pass.
- Existing test suite introduces no new failures beyond the two previously recorded unrelated prefab configuration failures.
- Vite production build succeeds.
- `git diff --check` succeeds.

Visual:

- Water contains visible large color patches.
- The texture does not appear stretched or excessively tiled.
- The three colors blend without obvious hard binary thresholds.
- Water remains visually compatible with the LEGO terrain.
- The `WaterBricks` group contains one mesh.
- Debug `textureScale` changes patch size without animation.

## Out of Scope

- Depth-derived color.
- Animated waves or ripples.
- Vertex displacement.
- Transparency, refraction, or reflection passes.
- Multiple noise octaves.
- Multiple texture samples.
- Per-instance water colors.
- Shoreline foam.

