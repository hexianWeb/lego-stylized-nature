# Biome Radar HUD Design

## Goal

Add a sci-fi biome direction radar that helps the player freely navigate toward authored biome centers. The radar is a spatial aid only: it does not select a target, rank biomes, enforce story order, or reveal chunk loading state.

The visual direction should be inspired by the provided ShaderToy radar reference: circular scan rings, a rotating scan line, subtle glow, and colored target dots.

## Player-Facing Behavior

- The player is always fixed at the radar center.
- Every configured biome center is shown as one radar dot.
- Dots are equal priority. There is no selected target, pulse highlight, or recommended route.
- Each biome uses a distinct dot color.
- A dot's direction comes from the vector between the player's current world position and the biome center.
- A dot's distance from the radar center represents approximate distance until it reaches the radar's configured range.
- When a biome center is farther than the radar range, its dot clamps to the outer radar edge and continues to show direction.
- The radar helps the player fly toward biome centers and interact with objects placed there.

## Data Source

Use `worldConfig.biomes.regions` as the target source. For each entry:

- `id` identifies the biome and resolves the dot color.
- `center` is the target point in world-space X/Z coordinates.
- `radius` remains biome generation data and is not drawn by this radar.

The radar must not derive targets from loaded chunks, visible chunks, prefab visibility, or camera bounds. Chunk lifecycle and radar guidance stay separate.

## Architecture

Create a small HUD system under `src/ui`, tentatively `BiomeRadarHUD.js`.

Responsibilities:

- Own the DOM container and a 2D canvas.
- Read radar configuration and biome target definitions.
- Render the radar background, rings, scan line, center player marker, and biome dots.
- Accept player position updates each frame.
- Handle resize and high-DPI canvas scaling.
- Clean up DOM resources on dispose.

`World` owns the radar lifecycle:

- Construct it during `World.build()` after config is available.
- Register it as a normal world child if that matches existing lifecycle patterns, or keep a direct field if DOM ownership is clearer.
- In `World.update()`, pass `playerAircraft.state.position` when the aircraft is enabled.
- In `World.dispose()`, dispose the radar.

## Configuration

Add `worldConfig.ui.biomeRadar`.

Initial defaults:

- `enabled: true`
- `size: 220`
- `screenOffset: { left: 24, bottom: 24 }`
- `range: 360`
- `scanSpeed: 0.9`
- `opacity: 0.9`
- `colors` keyed by biome id:
  - `forest`: green
  - `autumnForest`: orange
  - `desert`: yellow
  - `volcano`: red

The exact color values can be tuned during implementation. The important behavior is that color is deterministic per biome id.

## Projection Rule

For each biome target:

1. Compute `dx = target.center[0] - player.x`.
2. Compute `dz = target.center[1] - player.z`.
3. Compute distance from `sqrt(dx * dx + dz * dz)`.
4. Normalize the direction when distance is non-zero.
5. Convert world distance to radar distance with `distance / range * radarRadius`.
6. Clamp the radar distance to `radarRadius`.
7. Draw the dot at the center plus the clamped vector.

If the player is exactly on a biome center, draw that biome dot at the player center or just outside the center marker if overlap readability requires it.

## Visual Design

The first implementation should use 2D canvas rather than WebGPU or Three.js UI meshes.

Canvas is the right fit because:

- The radar is a screen-space HUD, not part of the world.
- ShaderToy-like rings, scan line, glows, and fading can be drawn cheaply.
- It avoids coupling the UI to the WebGPU render pipeline.
- It keeps future E2E and manual validation straightforward.

The radar should include:

- Transparent dark circular background.
- Two or three range rings.
- Faint horizontal and vertical axis lines.
- Rotating scan line.
- Small center player marker.
- One colored dot per biome center.
- Optional short text legend only if the screen does not become cluttered; the default should favor the visual radar over labels.

## Non-Goals

- No target selection.
- No selected-target highlight.
- No route ordering.
- No story or achievement logic.
- No chunk-center dots.
- No minimap showing terrain or biome areas.
- No E2E automation inside this implementation task.
- No new `test.js` file for the radar projection logic.

## Validation

Implementation validation will be:

- Run `npm run build` to confirm the integrated code compiles.
- User-owned E2E/manual flight verification:
  - The player remains visually centered in the radar.
  - All biome centers appear as colored dots.
  - Far biome dots clamp to the radar edge.
  - Dot directions change correctly as the aircraft moves.
  - Flying toward a dot brings the player toward the corresponding biome center.

Because the projection logic is intentionally small, no focused unit test file is required for this feature.

## Open Implementation Notes

- Keep the projection math compact and local to the HUD unless reuse becomes necessary.
- Keep DOM styles scoped to the radar class names.
- Do not change existing chunk manager behavior.
- Do not change biome generation or placement behavior.
