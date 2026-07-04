# Wing Airflow VFX Design

## Goal

Add visible wing airflow to the player aircraft using the frozen-sampling ribbon technique from `f:\temp\aircraft_webgpu_frozen_airflow_optimized_demo.html`.

The effect should make aircraft motion feel faster and more aerodynamic without changing flight physics. It should appear whenever the aircraft has meaningful speed, and it should become stronger while the player is actively accelerating.

## Scope

This design covers:

- left and right wing airflow ribbons attached to the player aircraft
- world-space sample emission from configurable wing anchors
- fixed-capacity ring buffers for low-GC runtime updates
- ribbon mesh rebuilding from typed arrays each frame
- speed-driven visibility with acceleration-driven intensity boost
- config-driven tuning in `worldConfig.player.aircraft.wingAirflow`
- debug controls under the existing Player Aircraft panel
- focused tests for config normalization and sample/ribbon behavior

This design does not cover:

- physical aerodynamic simulation
- terrain or chunk generation changes
- collision, lift, stall, or wind gameplay
- sound
- GPU compute particles
- post-processing speed-line replacement
- minimap or HUD changes

## Reference Behavior

The reference demo implements airflow as frozen world-space samples:

1. Add one left and one right anchor to the aircraft.
2. Each side records recent anchor positions in a fixed-capacity ring buffer.
3. Each sample stores position, tangent, age, and speed ratio.
4. Expired samples are removed by lifetime.
5. Neighboring samples are connected into camera-facing ribbon quads.
6. Sharp direction changes can break a ribbon segment.
7. A soft alpha texture shapes the ribbon so each segment fades along length and width.

The project version should use this same principle, adapted to the existing `PlayerAircraft` lifecycle and world scale.

## Visual Behavior

Airflow appears when aircraft speed is above a small threshold. It is not tied only to the `W` key.

The target behavior:

- cruising or gliding with speed: airflow remains visible
- active forward acceleration: airflow opacity and presence increase
- low speed or stopped: new samples stop and old samples fade out by lifetime
- sharp turns: ribbon segments can break instead of forming long stretched triangles
- fast straight movement: ribbon appears smoother and longer

This preserves motion history around turns while making acceleration feel more forceful.

## Architecture

Add a new module:

```text
src/world/player/wingAirflowVFX.js
```

The module should expose:

- `DEFAULT_WING_AIRFLOW_CONFIG`
- `normalizeWingAirflowConfig(config)`
- `createWingAirflowVFX(parent, config)`

`PlayerAircraft` owns the effect:

- normalize `playerConfig.wingAirflow` in the constructor
- create the effect after the aircraft model and visual root are available
- update it from `PlayerAircraft.update()` after motion and transforms are applied
- pass `delta`, `elapsed`, world camera, aircraft state, motion max speed, and current input
- dispose it from `PlayerAircraft.dispose()`

The VFX object should own its scene objects, generated textures, geometry attributes, and materials. It should not reach into world terrain, chunk manager, prefab placement, or renderer internals.

## Anchor Placement

Use two local anchors attached to the aircraft group or visual root. Initial defaults should be tuned around the current `fly.glb` scale:

```js
anchors: {
  wingHalfWidth: 0.78,
  outwardOffset: 0.12,
  backOffset: -0.10,
  upOffset: 0.03
}
```

The effective local anchor positions are:

```text
left:  [-(wingHalfWidth + outwardOffset), upOffset, backOffset]
right: [ wingHalfWidth + outwardOffset, upOffset, backOffset]
```

If visual testing shows the model's local axes differ from this assumption, keep the config semantic names and adjust only the mapping inside the module.

## Sampling Model

Each side keeps fixed arrays:

- `position`: `Float32Array(capacity * 3)`
- `tangent`: `Float32Array(capacity * 3)`
- `age`: `Float32Array(capacity)`
- `speed`: `Float32Array(capacity)`

Recommended defaults:

```js
sampleLife: 0.56,
emitInterval: 0.034,
minEmitDistance: 0.045,
maxSamples: 18,
capacity: 32,
minSpeedRatio: 0.04,
breakAngleDeg: 68
```

On update:

1. Increment ages.
2. Drop expired tail samples.
3. Compute speed ratio from `state.velocity.length() / maxSpeed`.
4. Emit only when speed ratio is above `minSpeedRatio`.
5. Require both `emitInterval` and `minEmitDistance` before adding a new sample.
6. Clamp visible sample count to `maxSamples`.

Tangent should follow the aircraft velocity when velocity is non-zero. If speed is almost zero, fallback to the aircraft forward direction.

## Ribbon Geometry

Each side owns one dynamic `THREE.BufferGeometry` with preallocated arrays:

- positions: `(capacity - 1) * 4 * 3`
- uvs: `(capacity - 1) * 4 * 2`
- indices: `(capacity - 1) * 6`

Each connected pair of samples writes one quad. Quads should billboard against the active camera by crossing segment tangent with camera direction. This matches the reference demo and keeps the airflow readable from the current orthographic camera.

Segment width should vary by lifetime:

```text
life = age / sampleLife
bell = sin(PI * life) ^ bellPower
width = baseWidth * mix(tipWidthRatio, 1, bell)
```

Recommended defaults:

```js
width: 0.09,
tipWidthRatio: 0,
bellPower: 1.35,
verticalOffset: 0.045
```

## Material

Use a generated `THREE.CanvasTexture` as the alpha shape. The texture should fade at the front, back, and sides, with a soft bright center. This avoids adding a TSL shader for the first version and keeps the effect compatible with the current WebGPU renderer.

Recommended material defaults:

```js
color: '#f7fbff',
opacity: 0.54,
speedOpacity: 0.48,
accelerationBoost: 0.35,
pulseStrength: 0.01,
additive: false
```

Runtime opacity should combine:

- base opacity
- speed ratio contribution
- positive thrust input contribution
- small optional pulse

The effect should stay readable with normal blending first. Additive blending can remain a debug/config option, but it should not be the default unless visual testing shows normal blending is too flat.

## Debug Controls

Extend `PlayerAircraft.debuggerInit(debug)` with a `Wing Airflow` folder. Include:

- `enabled`
- `outwardOffset`
- `backOffset`
- `upOffset`
- `sampleLife`
- `emitInterval`
- `minEmitDistance`
- `maxSamples`
- `breakAngleDeg`
- `width`
- `opacity`
- `speedOpacity`
- `accelerationBoost`
- `color`
- optional `showAnchors`

Changing `enabled` should toggle the effect root visibility. Parameters should affect the next update without requiring world regeneration.

## Resource Management

The VFX module owns:

- two ribbon meshes
- two dynamic geometries
- generated canvas texture
- materials
- optional anchor debug sprites

`dispose()` must remove the root from its parent and dispose owned geometries, materials, and generated textures.

No GLB resource or aircraft model material should be mutated by the airflow system.

## Error Handling

- Invalid numeric config values fall back to defaults.
- `maxSamples` cannot exceed `capacity`.
- `capacity` must be at least 2.
- If the effect is disabled, update should be a no-op except optional visibility cleanup.
- If no camera is provided, skip ribbon rebuild for that frame instead of throwing.

## Integration Points

Expected files:

- `src/world/player/wingAirflowVFX.js`
  - new VFX implementation and testable helpers
- `src/world/player/PlayerAircraft.js`
  - normalize config, create/update/dispose VFX, add debug bindings
- `src/world/WorldConfig.js`
  - add `player.aircraft.wingAirflow`
- `test/wingAirflowVFX.test.js`
  - focused utility and behavior tests
- `test/playerAircraftConfig.test.js`
  - assert default config exists and is enabled
- `test/playerAircraftSystem.test.js`
  - assert player owns and disposes airflow when enabled

`World`, `ChunkManager`, `ChunkRenderSlot`, prefab placement, and renderer post-processing should not need structural changes.

## Testing

Automated tests should cover:

- config normalization falls back for invalid values
- `maxSamples` clamps to `capacity`
- low speed does not emit samples
- meaningful speed emits samples after interval and distance gates
- positive thrust input increases resolved opacity/intensity
- expired samples are removed by lifetime
- sharp tangent changes can prevent segment connection
- disposing the VFX removes scene objects and disposes owned resources
- `PlayerAircraft` creates airflow only when aircraft and config are enabled

Manual verification should check:

- airflow appears around both wings once the aircraft gains speed
- airflow remains visible while gliding with speed
- pressing `W` makes the airflow stronger
- old trails fade out cleanly when stopping
- sharp turns do not create broken giant triangles
- debug controls tune anchors and width live
- `npm run build` succeeds

## Acceptance Criteria

- The aircraft has visible left and right wing airflow in normal gameplay.
- Airflow appears based on speed, not only while pressing acceleration.
- Forward acceleration makes the airflow stronger.
- The effect uses bounded buffers and does not allocate per frame during normal updates.
- The VFX is owned and disposed by `PlayerAircraft`.
- Tuning lives in `worldConfig.player.aircraft.wingAirflow`.
- Debug controls expose the major visual parameters.
- Existing terrain, chunk streaming, prefab, engine flame, and speed-line systems continue to work.
