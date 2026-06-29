# Chunk Manager 3x3 Design

## Goal

Replace the current 2-slot `TerrainChunkPingPong` terrain streaming path with a fixed-size `ChunkManager` that keeps a loaded 3x3 chunk window around the player aircraft while avoiding large synchronous work spikes.

The 3x3 window is a loaded active window, not a promise that all 9 chunks are rendered every frame. Rendering visibility is decided separately from loaded lifecycle.

## Current Context

The project already has a useful chunk-local rendering boundary:

- `TerrainChunkPingPong` owns the current chunk streaming lifecycle.
- `ChunkRenderSlot` owns one chunk's terrain, water, lava, AO, and prefab renderers.
- `ChunkRenderSlot.populate()` can refill an existing slot for a new chunk coordinate.
- `World.regenerate()` still generates a full terrain map before bootstrapping chunk terrain.

The existing 2-slot model is good for validating chunk reuse, but it only supports the current chunk plus one predicted standby chunk. Aircraft movement can cross corners, change direction quickly, and show nearby chunk edges through the following camera, so a single standby slot is too narrow for the intended traversal.

## Approved Configuration

Add chunk tuning in `src/world/WorldConfig.js`:

```js
chunks: {
  enabled: true,
  size: 64,
  halo: 1,
  windowRadius: 1,
  maxPendingBuildsPerFrame: 1,
  visibilityPadding: 1
}
```

Meanings:

- `size`: visible chunk size in terrain cells.
- `halo`: extra sampled cells around the visible chunk for edge continuity, AO, and neighbor-aware terrain decisions.
- `windowRadius`: loaded window radius around the center chunk. A value of `1` means 3x3.
- `maxPendingBuildsPerFrame`: maximum non-center chunks to build per frame.
- `visibilityPadding`: extra chunk-space or world-space margin applied to camera visibility tests to avoid edge flicker.

## Chunk States

The manager should keep these concepts separate:

- `required`: the chunk coordinate is inside the current `windowRadius` around the center chunk.
- `loaded`: the chunk coordinate has an assigned `ChunkRenderSlot` populated with terrain data.
- `pending`: the chunk coordinate is required but not loaded yet.
- `renderVisible`: the chunk is loaded and intersects the camera visibility bounds, so `slot.group.visible` is true.

Camera culling only changes `renderVisible`. It must not unload a chunk that is still required.

## Startup Lifecycle

On bootstrap:

1. Convert the player position to the center chunk coordinate.
2. Create a fixed pool of `ChunkRenderSlot` instances sized to `(windowRadius * 2 + 1) ** 2`. With radius `1`, this creates 9 slots.
3. Synchronously populate the center chunk and show it if it intersects the camera bounds.
4. Queue the remaining 8 required chunks as pending work.
5. Build at most `maxPendingBuildsPerFrame` pending chunks each frame.

The pending queue should prioritize the four cardinal neighbors before the four diagonal neighbors. Within each group, sort by distance to the center chunk and use stable key ordering for deterministic tests.

## Movement Lifecycle

Each update:

1. Convert the player position to the current center chunk coordinate.
2. If the center changed, compute the new required coordinate set.
3. Keep slots whose coords are still required.
4. Hide and release slots whose coords left the required set into the free pool.
5. Remove pending entries that are no longer required.
6. If the new center chunk is not loaded, synchronously populate it immediately using a free slot. This avoids a blank chunk under the player.
7. Add all remaining missing required coords to the pending queue.
8. Build at most `maxPendingBuildsPerFrame` pending chunks.
9. Update slot visibility from camera bounds.

The immediate center build is the only synchronous fast path after startup. Outer-ring chunks are normal pending work.

## Slot Reuse

`ChunkRenderSlot` should stay the per-chunk rendering container. The new manager should reuse the same creation pattern currently inside `TerrainChunkPingPong.createSlot()`:

- one `TerrainBrickRenderer`
- one `HeightfieldAO`
- optional one `WaterBrickRenderer`
- one `LavaBrickRenderer`
- optional one `PrefabPlacer`

Moving the player should not create new renderer objects after bootstrap unless a renderer internally expands its own instance capacity. Slot reuse should operate by calling `slot.populate()` with a new chunk coord, terrain map, placements, and color resolver.

## Rendering Visibility

Loaded slots are not automatically visible. The manager should compute chunk world bounds from coord, chunk size, and cell size, then compare those bounds with camera bounds.

Rules:

- `slot.group.visible = true` only when the loaded chunk intersects camera bounds plus `visibilityPadding`.
- `slot.group.visible = false` when loaded but outside camera bounds.
- Invisible loaded slots remain in `activeSlots` if still required.
- AO preview should continue to hide overlay renderers for visible slots when grayscale preview is active.

The first implementation can use a conservative orthographic camera bounds helper. If the exact camera frustum is awkward, it is acceptable to overestimate bounds. Over-rendering a few chunks is safer than hiding visible terrain.

## World Regeneration

Chunk mode should skip full-map terrain generation.

Current `World.regenerate()` creates a full `terrainMap` and full placements before bootstrapping chunk terrain. In chunk mode this is unnecessary and creates startup work that does not feed the chunk renderers.

New behavior:

- If `chunks.enabled` is true, do not call `terrainGenerator.generate()` for a full world map.
- Do not call full-map `layeredTerrainBuilder.buildPlacements()`.
- Initialize camera and shadow bounds from config and player position instead of a generated `terrainMap`.
- Bootstrap or refresh the chunk manager from the player position.
- Keep the existing full-map path unchanged when `chunks.enabled` is false.

Camera and shadow initialization can still use `terrain.width`, `terrain.depth`, `terrain.cellSize`, `terrain.maxHeight`, and `terrain.layerHeight` as conservative defaults.

## Prefab Capacity

`prefabCapacity` remains a per-slot, per-prefab-category cap.

It should not be multiplied by 9 for the 3x3 window. Each `ChunkRenderSlot` owns its own `PrefabPlacer`, and each placer owns its own buckets. If a prefab category overflows inside one 64x64 chunk, tune that category's per-slot cap based on warnings and visual inspection.

## Public Interface

`ChunkManager` should expose a small interface similar to the current ping-pong system:

- `bootstrap(worldX, worldZ)`
- `update(worldX, worldZ, camera = null)`
- `refreshAOPreview(showOverlays = true)`
- `getDebugMaterials()`
- `dispose()`

`World` should store it behind a neutral property such as `terrainChunkManager` instead of naming the field after ping-pong behavior.

## Testing

Focused tests should cover:

- `getChunkWindowCoords(centerCoord, radius)` returns stable 3x3 coords, including negative coords.
- Bootstrap creates exactly 9 slots but only synchronously populates the center chunk.
- Bootstrap queues the 8 outer chunks.
- Each update builds at most one pending outer chunk when `maxPendingBuildsPerFrame` is `1`.
- Moving one chunk reuses overlapping loaded slots and queues only newly required missing coords.
- Moving diagonally keeps the 2x2 overlap and queues the newly exposed 5 coords.
- If a new center chunk is not loaded, it is built synchronously even when pending work exists.
- Camera visibility can hide a loaded required slot without releasing it.
- Leaving the required window releases slots to the free pool.
- Chunk mode `World.regenerate()` does not call full-map `terrainGenerator.generate()`.
- AO preview and debug material access still work with the manager.

Existing `TerrainChunkPingPong` tests can either be migrated to `ChunkManager` or retained only while the old class remains in use.

## Risks

- Startup can still hitch if the center chunk is expensive to build. This is acceptable for the first manager because the player must never start over blank terrain.
- Very fast aircraft movement can invalidate pending outer chunks before they build. The queue must remove stale coords each update.
- Camera bounds underestimation can hide terrain that should be visible. The first version should use conservative bounds and padding.
- Full-map debug assumptions may break when `terrainMap` is null in chunk mode. Debug panels should treat chunk mode as manager-owned terrain.

## Acceptance Criteria

- Chunk mode starts by showing the center chunk without generating the full terrain map.
- The outer 3x3 ring fills progressively, with no more than one pending outer chunk built per frame by default.
- Moving into an unloaded center chunk immediately builds that center chunk.
- The loaded window remains bounded to 9 slots for `windowRadius: 1`.
- Loaded and rendered-visible states are independent.
- Non-chunk terrain generation behavior remains unchanged.
