# Player Aircraft Flight Feel Design

## Goal

Improve the player aircraft from a basic top-down controller into a polished arcade flight controller. The first pass should focus on control feel and visual attitude feedback: smoother input, speed-aware turning, pitch/roll response, hover bob, and lightweight left/right thruster VFX.

This is not a physically accurate flight simulation. The target feel is an accessible 3A-style mini-game aircraft: responsive, readable, slightly weighty, and visually expressive.

## Scope

This design covers:

- smoothing raw keyboard input before it affects motion or visuals
- speed-weighted turning so the aircraft does not spin sharply in place
- pitch and roll visual attitude feedback
- smooth return-to-level when input is released
- low-speed hover bob as a visual-only offset
- lightweight thruster VFX attached to `left_engine` and `right_engine`
- config-driven tuning in `worldConfig.player.aircraft`
- focused tests for input smoothing, speed-turn curves, and attitude targets

This design does not cover:

- terrain collision or chunk streaming
- real lift, stall, drag, or aerodynamic simulation
- `middle_engine`, which is no longer part of the authored aircraft
- particle systems
- sound
- gamepad or analog input
- camera shake

## Current Controller Limitations

The current controller uses immediate digital input:

```js
thrustInput: forward - reverse
turnInput: left - right
```

This means input jumps from `0` to `1` on keydown and back to `0` on keyup. The result is abrupt acceleration, abrupt turning, and hard attitude changes.

Current turning is also independent of speed:

```js
state.angularVelocity += input.turnInput * config.turnTorque * dt
```

That allows the aircraft to rotate quickly while nearly stationary. For a flying vehicle, this reads less like banking flight and more like a character or turret rotating in place.

The current visual transform only applies yaw to the whole group, so the aircraft does not pitch under thrust, bank into turns, recover smoothly, or show hover motion.

## Control Feel

### Input Smoothing

Keep raw keyboard input, but introduce smoothed input state owned by the motion/controller layer:

```js
smoothed.thrust
smoothed.turn
```

Each frame, raw input moves toward its target using config-driven rates:

- thrust attack: how quickly `W` reaches forward thrust
- thrust release: how quickly thrust falls back to neutral
- reverse attack: how quickly `S` reaches reverse/brake thrust
- turn attack: how quickly `A/D` reaches full turn command
- turn release: how quickly turn input returns to neutral

This turns an instant key press into a short ramp:

```text
raw:      0 -> 1
smooth:   0 -> 0.15 -> 0.32 -> 0.48 -> ... -> 1
```

Recommended defaults:

```js
input: {
  thrustAttack: 7,
  thrustRelease: 4,
  reverseAttack: 4,
  turnAttack: 8,
  turnRelease: 5
}
```

Higher values respond faster. The implementation should use exponential smoothing so behavior remains stable across frame rates.

### Speed-Weighted Turning

Turning should use a speed-response curve instead of constant torque. The desired behavior:

- low speed: can still rotate, but slowly
- medium speed: most comfortable turn response
- high speed: turn rate falls off so the turn radius grows

The turn multiplier can be computed from normalized speed:

```text
speedRatio = speed / maxSpeed
turnMultiplier = lowSpeedTurn + bellCurve(speedRatio) * midSpeedTurnBoost - highSpeedPenalty
```

The exact implementation can be simpler than the expression above, but the exposed config should make these points tunable:

```js
turning: {
  lowSpeedFactor: 0.35,
  optimalSpeedRatio: 0.55,
  optimalSpeedBoost: 1,
  highSpeedFactor: 0.55
}
```

Acceptance rule: at rest, turning is visibly slower than at cruising speed. At very high speed, the aircraft banks more but does not rotate faster than the medium-speed case.

## Visual Attitude

Add visual attitude state separate from physical motion:

```js
attitude.pitch
attitude.roll
attitude.hoverOffset
```

These values should affect the aircraft model or a visual child group, not the world motion state.

### Pitch

Pitch communicates thrust:

- accelerating forward: nose slightly down
- decelerating or reversing: nose slightly up
- neutral: smoothly returns to level

Recommended defaults:

```js
attitude: {
  maxPitchForward: THREE.MathUtils.degToRad(7),
  maxPitchBack: THREE.MathUtils.degToRad(5)
}
```

If the GLB orientation requires sign adjustment, keep the config semantic names and apply the sign in `PlayerAircraft`.

### Roll

Roll communicates turning:

- left turn: aircraft banks left
- right turn: aircraft banks right
- high-speed turn: bank angle becomes more pronounced
- released turn key: roll smoothly returns to level

Roll should combine smoothed turn input, angular velocity, and speed:

```text
targetRoll = turnInput * baseRoll + angularVelocityRatio * speedRollBoost
```

Recommended defaults:

```js
attitude: {
  maxRoll: THREE.MathUtils.degToRad(22),
  rollSpeedBoost: 0.35,
  attitudeSmoothing: 9
}
```

The visual bank can be more dramatic than the actual angular acceleration. This improves readability without making the vehicle hard to control.

### Return To Level

Pitch and roll should never snap. When input goes neutral, the target pitch and roll return to zero, and the current visual attitude eases back using smoothing.

The smoothing should be frame-rate independent and testable:

```js
next = damp(current, target, smoothing, delta)
```

## Hover Bob

Static or low-speed hover should add a subtle vertical motion:

- applies only to the visual model or visual group
- does not change `state.position.y`
- fades down as speed increases
- remains small enough that it does not look like terrain collision

Recommended defaults:

```js
hover: {
  amplitude: 0.06,
  frequency: 1.4,
  maxSpeedRatio: 0.25
}
```

At speed ratios above `maxSpeedRatio`, hover bob should be mostly or fully faded out.

## Thruster VFX

The aircraft now uses only two authored engine anchors:

- `left_engine`
- `right_engine`

`middle_engine` should not be queried, configured, or required.

First-version VFX should use lightweight generated mesh feedback rather than particles:

- create one small emissive cone/sprite-like mesh per engine anchor
- attach it to the matching GLB node
- scale length and opacity/emissive intensity from smoothed thrust and turn input
- keep it disabled or nearly invisible when no thrust is present

Input mapping:

- `W`: both thrusters increase
- `S`: both thrusters use a shorter, weaker reverse/brake look
- `A`: right thruster increases more than left thruster
- `D`: left thruster increases more than right thruster

This matches differential thrust: stronger right thrust turns the aircraft left, stronger left thrust turns it right.

Missing `left_engine` or `right_engine` should not disable flight. Emit one warning naming the missing anchor and skip that VFX mesh.

## Configuration

Extend `worldConfig.player.aircraft` with tuning sections:

```js
input: {
  thrustAttack: 7,
  thrustRelease: 4,
  reverseAttack: 4,
  turnAttack: 8,
  turnRelease: 5
},
turning: {
  lowSpeedFactor: 0.35,
  optimalSpeedRatio: 0.55,
  optimalSpeedBoost: 1,
  highSpeedFactor: 0.55
},
attitude: {
  maxPitchForward: 7,
  maxPitchBack: 5,
  maxRoll: 22,
  rollSpeedBoost: 0.35,
  smoothing: 9
},
hover: {
  amplitude: 0.06,
  frequency: 1.4,
  maxSpeedRatio: 0.25
},
thrusters: {
  enabled: true,
  leftNode: 'left_engine',
  rightNode: 'right_engine',
  baseLength: 0.18,
  maxLength: 0.55,
  turnBoost: 0.45
}
```

Angles are in degrees in config for easier tuning. Normalize them to radians in runtime code.

## Integration Points

Expected implementation areas:

- `src/world/player/aircraftMotion.js`
  - normalize new config sections
  - add smoothed input state
  - add speed-weighted turn multiplier
  - expose helpers for target pitch, target roll, and hover amount
- `src/world/player/PlayerAircraft.js`
  - keep physical group position/yaw separate from visual attitude
  - add a visual model root if needed
  - apply pitch, roll, and hover bob to the visual root
  - find `left_engine` and `right_engine`
  - create and update lightweight thruster meshes
- `src/world/WorldConfig.js`
  - add tuning defaults
- tests under `test/`
  - verify smoothing, speed curve, attitude target signs, hover fade, and no `middle_engine` dependency

Camera follow can remain unchanged for this pass unless manual tuning shows the smoother motion needs camera look-ahead later.

## Testing

Automated tests should verify:

- smoothed thrust ramps toward raw input over multiple frames
- smoothed turn returns toward zero after release
- reverse thrust can use a separate attack rate
- low-speed turn multiplier is lower than medium-speed multiplier
- high-speed turn multiplier is lower than medium-speed multiplier
- pitch target is nose-down for forward thrust and nose-up for reverse/brake
- roll target changes sign for left versus right turns
- roll magnitude increases with speed during turning
- hover bob fades out above the configured speed ratio
- runtime config normalizes angle degrees to radians
- `middle_engine` is not referenced by player code or tests
- missing `left_engine` or `right_engine` only disables the corresponding VFX

Manual verification should check:

- acceleration no longer starts abruptly
- turning no longer snaps immediately to full strength
- aircraft cannot spin rapidly in place
- cruising-speed turns feel responsive
- high-speed turns have a larger radius but stronger bank
- releasing `A/D` smoothly levels the aircraft
- hovering at low speed has subtle vertical motion
- both thrusters brighten on forward thrust
- differential thruster boost matches the turn direction

## Acceptance Criteria

- Keyboard input feels ramped rather than instant.
- Stationary turning is slower than cruising-speed turning.
- High-speed turning produces stronger visual bank without producing the fastest yaw rate.
- Forward acceleration pitches the nose down.
- braking or reverse thrust pitches the nose up.
- Left and right turns bank in the expected direction.
- Releasing keys returns pitch and roll smoothly to level.
- Low-speed hover bob is visible but does not affect physical position.
- Thruster VFX uses only `left_engine` and `right_engine`.
- Existing movement, camera follow, terrain, and prefab systems continue to work.
