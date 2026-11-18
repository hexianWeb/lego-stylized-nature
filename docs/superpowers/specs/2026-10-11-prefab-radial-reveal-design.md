# Prefab Visibility

## Decision

The radial scale and appearance animation were removed on 2026-10-11. Loaded terrain slots show their prefabs at full size. There is no per-instance pivot, reveal material, or first-draw fade.

## Behavior

`ChunkManager.updateVisibility()` queues and shows prefabs for every active terrain slot. Slot reuse, `prefabsBuiltForKey`, `maxPrefabBuildsPerFrame`, and the placement toggles stay as they are. `getPlayerPrefabWindowCoords` stays deleted.

The directional shadow envelope covers that loaded window from the player: an axis-aligned radius of `(windowRadius + 1) * chunkWorldSize`, plus the measured prefab mesh overhang, and the terrain height range plus prefab vertical bounds. `debugSpacing !== 0` skips the envelope and uses the plain chunk half-extent, because spaced chunks are not one volume.

## Out of scope

- Camera-driven terrain loading. A zoomed-out view can still reach the edge of the 3x3 window; raise `chunks.windowRadius` separately if that edge is visible.
- Any distance-based prefab scale, fade, or grow-in.
