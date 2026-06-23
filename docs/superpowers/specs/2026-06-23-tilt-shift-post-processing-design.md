# Tilt-Shift Post-Processing Design

## Goal

Add a classic miniature-photography tilt-shift effect to the WebGPU render
pipeline. A fixed horizontal band remains sharp while the image becomes
progressively blurrier toward the top and bottom.

The first version is screen-space only. It does not use scene depth, track a
world-space focus plane, or rotate the focus band.

## Requirements

- Use a fixed horizontal focus band.
- Use a balanced-quality, quarter-resolution blur.
- Keep the existing vignette and SMAA effects.
- Allow live control from the debug UI.
- Skip the blur passes entirely when the effect is disabled.
- Keep tilt-shift code isolated from environment and material controls.

## Selected Approach

Render the scene once, generate a quarter-resolution Gaussian blur from its
linear color output, and blend the sharp and blurred images with a vertical
screen-space mask.

```text
scenePass output
      +---------------------------+
      |                           |
      +-- Gaussian blur at 0.25x -+
                                  |
                                  v
                         vertical mask mix
                                  |
                                  v
                            renderOutput
                                  |
                                  v
                              vignette
                                  |
                                  v
                                SMAA
```

Three.js r183.2 `GaussianBlurNode` already implements horizontal and vertical
passes. The effect therefore needs one Gaussian blur node rather than separate
project-owned pass implementations.

### Alternatives Rejected

1. A full-resolution, single-pass variable-radius blur would require many
   samples per output pixel and is more prone to directional artifacts.
2. A multi-level blur pyramid would produce smoother radius variation, but its
   additional render targets and passes are unnecessary for the first version.
3. Depth-aware focus would better approximate a physical lens but does not
   match the requested fixed horizontal focus band.

## Configuration

Add a top-level post-processing section to `worldConfig`:

```js
postProcessing: {
  tiltShift: {
    enabled: true,
    focusCenter: 0.5,
    focusWidth: 0.22,
    falloff: 0.28,
    blurStrength: 2.5
  }
}
```

Parameter meanings:

- `enabled`: enables the effect and its blur passes.
- `focusCenter`: vertical center of the sharp band in normalized screen UVs.
- `focusWidth`: full width of the completely sharp region.
- `falloff`: distance over which the mask transitions from sharp to fully
  blurred on each side.
- `blurStrength`: Gaussian sampling radius supplied through the blur node's
  direction node.

The quarter-resolution scale is an implementation quality setting fixed at
`0.25`, not a runtime user control.

## Components

### Tilt-shift effect module

Create a focused module under `src/renderer/postprocessing/`. It owns:

- Uniform nodes for the four live numeric controls.
- A `GaussianBlurNode` configured with `resolutionScale: 0.25`.
- The TSL vertical mask and sharp/blurred color blend.
- A small controller API for synchronizing configuration values.
- Disposal of the Gaussian blur node and its internal render targets.

The module returns both output forms:

- `enabledOutput`: the sharp/blurred masked result.
- `disabledOutput`: the untouched scene color.

It must not own the render pipeline, vignette, SMAA, or debug UI.

### Renderer

`Renderer.attachPipeline()` obtains the raw scene color texture with
`scenePass.getTextureNode('output')`. It passes that texture to the tilt-shift
module, then applies `renderOutput`, the existing vignette, and SMAA.

Changing numeric parameters updates uniforms only. Changing `enabled` selects
between two complete output chains:

```text
enabled:  tilt-shift result -> renderOutput -> vignette -> SMAA
disabled: raw scene color  -> renderOutput -> vignette -> SMAA
```

The disabled output chain must not reference `GaussianBlurNode`. This ensures
its `updateBefore()` hook does not execute and the two blur passes are skipped.

The renderer exposes a narrow post-processing controller to the debug panel
instead of exposing internal TSL nodes.

`Renderer.dispose()` disposes the tilt-shift module. `Experience.dispose()`
calls it before disposing the WebGPU renderer.

### Debug panel

Create `src/debug/panels/PostProcessingPanel.js`. Register it from
`Experience` when debug mode is active.

Bindings:

| Control | Range | Step |
| --- | ---: | ---: |
| `enabled` | boolean | - |
| `focusCenter` | 0 to 1 | 0.01 |
| `focusWidth` | 0.02 to 1 | 0.01 |
| `falloff` | 0.01 to 0.5 | 0.01 |
| `blurStrength` | 0 to 5 | 0.05 |

The panel writes to `worldConfig.postProcessing.tiltShift` and immediately
synchronizes the renderer controller. It is separate from
`EnvironmentPanel`, because this effect changes the final image rather than
scene lighting or fog.

## Mask Definition

The mask depends only on vertical screen position:

```text
distance  = abs(screenUV.y - focusCenter)
clearEdge = focusWidth * 0.5
blurMask  = smoothstep(clearEdge, clearEdge + falloff, distance)
output    = mix(sharpColor, blurredColor, blurMask)
```

Consequences:

- The center of the band is fully sharp.
- Both sides use the same falloff.
- The image reaches maximum blur outside the transition.
- A band or falloff extending beyond the viewport is naturally clipped.

All arithmetic must use TSL node chaining consistently to avoid mixing
JavaScript arithmetic with node values.

## Color and Effect Ordering

The sharp/blurred blend happens on the raw scene color texture before
`renderOutput`. This keeps interpolation in the scene's linear working space.
Tone mapping and output color conversion remain centralized in
`renderOutput`.

Vignette remains after `renderOutput`, preserving its current appearance.
SMAA remains the final effect.

## Runtime and Resource Behavior

- Enabling or disabling tilt-shift assigns one of the two prebuilt final
  output chains to `renderPipeline.outputNode`. The disabled chain contains no
  reference to the blur node.
- Numeric control changes do not rebuild the graph.
- Resize handling is delegated to `GaussianBlurNode`, which sizes its internal
  render targets from the current source texture and applies the `0.25`
  resolution scale.
- Reattaching a pipeline must dispose an existing tilt-shift module first.
- Final renderer disposal must release both Gaussian blur render targets.

## Validation

Automated tests should verify:

- The default configuration and documented parameter ranges.
- The mask is zero at `focusCenter`.
- The mask reaches one beyond `focusWidth / 2 + falloff`.
- The mask is symmetric above and below the focus center.
- The blur node is configured with `resolutionScale: 0.25`.
- The disabled output graph does not reference the Gaussian blur node.
- Numeric updates modify uniforms without replacing the pipeline.
- Toggling `enabled` selects the correct output graph.
- Disposal calls the blur node's `dispose()` method.

Project validation:

```text
npm test
npm run build
```

Manual validation in `#debug` mode should confirm:

- The focus band stays horizontal while the camera moves.
- The center remains sharp at default settings.
- Top and bottom blur increase smoothly without a visible seam.
- All five controls update immediately.
- Disabling the effect matches the pre-feature render and removes the blur
  passes from the WebGPU inspector.

## Out of Scope

- Depth-aware or world-space focus.
- Rotating the focus band.
- Separate top and bottom controls.
- Bokeh-shaped highlights.
- Multiple blur pyramid levels.
- Automatic focus tracking.
