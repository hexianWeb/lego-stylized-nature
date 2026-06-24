# Player Aircraft Controller Design

## Goal

Add a basic player-controlled aircraft for exploring the generated terrain from the existing orthographic camera. The aircraft uses the imported `fly.glb` model and should feel like it is driven by three jet outlets: a center thrust outlet plus left and right outlets that create differential turning.

The first version should be simple, tunable, and integrated as a normal world system. It should not add combat, terrain collision, landing, fuel, UI, or complex flight simulation.

## Scope

This design covers:

- Loading `public/model/player/fly.glb` as a player aircraft asset.
- Spawning one aircraft in the world after resources and terrain are built.
- Keyboard input for forward/reverse thrust and differential turning.
- Inertial top-down movement with drag, max speed, yaw, and angular velocity.
- Orthographic camera following the aircraft while preserving the current camera style.
- Configuration in `src/world/WorldConfig.js`.
- Cleanup of event listeners and cloned scene resources.

This design does not cover:

- Terrain collision or obstacle collision.
- Height following based on sampled terrain cells.
- Engine flame VFX, particles, sound, or UI indicators.
- Gamepad, touch, mouse steering, or remappable controls.
- Multiplayer or save/load state.

## Current Context

The project already has:

- `Experience.update()` as the single frame update path.
- `World.addSystem()` for systems with `group`, `update()`, `debuggerInit()`, and `dispose()`.
- `WorldCamera` with an orthographic camera and `OrbitControls`.
- Asset registration in `src/assets/sources.js`.
- World-scale terrain dimensions in `worldConfig.terrain`.

The local player asset currently exists at `public/model/player/fly.glb`. Its GLB nodes are:

- `aircraft`
- `glass`
- `left_engine`
- `middle_engine`
- `right_engine`

The first controller does not need to animate the engine nodes, but preserving their names gives later engine VFX a stable hook.

## Controls

Use the following first-version keyboard mapping:

- `W`: forward thrust.
- `S`: reverse thrust or braking thrust.
- `A`: increase left/right differential torque to turn left.
- `D`: increase left/right differential torque to turn right.

`A` and `D` do not directly translate the aircraft. They change angular acceleration. The aircraft moves in its facing direction based on accumulated velocity, which creates a lightweight hovercraft/jet feel.

Key state is tracked with `keydown`, `keyup`, and `blur` listeners. Repeated keydown events are ignored because the controller reads continuous key state each frame.

## Motion Model

Add a `PlayerAircraft` world system that owns:

- a root `THREE.Group`
- the cloned GLB scene
- `position`
- horizontal `velocity`
- `yaw`
- `angularVelocity`
- input key state

Each frame:

1. Read `delta` from `experience.time.getDelta()`.
2. Clamp large deltas to avoid jumps after tab visibility changes.
3. Convert `W/S` into a signed thrust input.
4. Convert `A/D` into a signed turn input.
5. Apply forward acceleration along the current yaw.
6. Apply angular acceleration from turn input.
7. Apply linear and angular drag.
8. Clamp speed and angular velocity.
9. Integrate position and yaw.
10. Write transform to the aircraft group.

The first version keeps aircraft altitude fixed at a configured `height`. It does not sample the terrain height. This keeps the controller independent from terrain internals and makes the initial exploration behavior predictable.

The first version does not clamp player position to the generated terrain footprint. Future terrain expansion will use chunk loading, and at most a small active chunk set may be present at once, so controller movement should not be coupled to the initial `128 x 128` terrain dimensions.

## Configuration

Add `player.aircraft` to `src/world/WorldConfig.js`.

Expected shape:

```js
player: {
  aircraft: {
    enabled: true,
    assetName: 'playerAircraftModel',
    height: 2.5,
    scale: 1,
    thrust: 14,
    reverseThrust: 7,
    turnTorque: 5,
    linearDrag: 2.2,
    angularDrag: 4,
    maxSpeed: 8,
    maxAngularSpeed: 2.8,
    cameraFollow: {
      enabled: true,
      smoothing: 8
    }
  }
}
```

Exact values are initial tuning values and can be adjusted after visual testing.

If `enabled` is false, the world should not create the player system. If the configured asset is missing, world generation should continue and emit one warning.

## Camera Follow

Keep the existing orthographic camera and `OrbitControls`. Add a focused follow method to `WorldCamera`, for example `followTarget(target, delta, smoothing)`, that:

- moves `controls.target` toward the aircraft position
- preserves the current camera offset from target
- updates the camera position by the same target delta
- calls `controls.update()`

This keeps the camera's existing isometric/orthographic look and lets debug OrbitControls continue to work. `World.regenerate()` can still initially call `lookAt()` for the terrain center; after the player system is built, the player update takes over the target while follow mode is enabled.

## Integration Points

Expected implementation files:

- `src/assets/sources.js`
  - Add `playerAircraftModel` pointing to `model/player/fly.glb`.
- `src/world/WorldConfig.js`
  - Add player aircraft control and camera-follow tuning.
- `src/world/player/PlayerAircraft.js`
  - New world system for asset cloning, input, physics integration, transform updates, debug controls, and cleanup.
- `src/world/camera.js`
  - Add optional smooth follow support.
- `src/world/world.js`
  - Create `PlayerAircraft` after terrain systems and prefabs are configured.
  - Add it through `addSystem()` so update and dispose follow existing world conventions.

No TSL material or renderer changes are expected for the first controller.

## Resource Management

The loaded GLB resource belongs to `Resources`; the player system must clone the scene before adding it to the world. Disposal removes the player group from the world and disposes only resources owned by the clone when appropriate.

Input listeners must be removed in `dispose()`. The key state should be cleared on window blur so a held key cannot remain stuck after focus changes.

## Error Handling

- Missing or null configured asset: emit `[PlayerAircraft] Missing aircraft asset "<name>"; player disabled.` once and skip player creation.
- Missing named engine nodes: do not block movement; leave a debug warning only if engine-specific behavior is added later.
- Invalid numeric config values should fall back to conservative defaults inside the controller.
- If no browser `window` is available, input listener registration is skipped. This keeps unit tests from requiring DOM globals.

## Testing

Focused automated tests should cover controller math without requiring WebGPU:

- `W` input accelerates along current yaw.
- `S` input applies weaker reverse acceleration.
- `A/D` input changes angular velocity in opposite directions.
- drag reduces linear and angular velocity over time.
- speed and angular velocity are clamped.
- player position is not clamped to terrain bounds.
- blur clears key state.
- missing asset disables the system without throwing.

Integration or manual verification should cover:

- app builds successfully.
- aircraft appears from `fly.glb`.
- `W/S/A/D` movement feels inertial from the orthographic camera.
- camera follows the aircraft smoothly.
- debug OrbitControls are not broken.
- terrain and prefab generation continue to work.

## Acceptance Criteria

- The aircraft loads from `model/player/fly.glb` and appears in the generated world.
- `W/S/A/D` controls implement thrust plus differential turning rather than direct screen-space translation.
- Movement has inertia, damping, max speed, and bounded angular velocity.
- The controller does not impose terrain-bound movement limits.
- The orthographic camera follows the aircraft without changing the overall viewing style.
- Disposing the experience removes input listeners and player scene objects.
- Existing terrain, water, lava, prefab, and post-processing paths continue to run.
