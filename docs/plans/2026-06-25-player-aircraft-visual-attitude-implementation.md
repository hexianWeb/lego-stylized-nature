# Player Aircraft Visual Attitude Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add visual-only pitch, roll, hover bob, and lightweight thruster feedback to the player aircraft so WASD input feels responsive without changing physics, camera follow, or collision behavior.

**Architecture:** Keep `aircraftMotion.js` unchanged. Add a pure helper module `aircraftVisualAttitude.js` that computes target and smoothed visual attitude from motion state + input. Refactor `PlayerAircraft` so the cloned GLB sits under a `visualRoot` child group; apply pitch/roll/hover only to `visualRoot`, while `group` continues to own world position and yaw. Thruster feedback is emissive/intensity scaling on named engine nodes inside the GLB, not a particle system.

**Tech Stack:** Three.js WebGPU entrypoint, existing `PlayerAircraft` / `aircraftMotion.js`, `WorldConfig`, Node `node:test` (minimal), manual browser E2E.

**Testing policy for this feature:** Minimal automated tests only. One config-shape smoke test. All feel tuning is verified manually in the browser.

**Reference design:** `docs/superpowers/specs/2026-06-24-player-aircraft-flight-feel-design.md` (visual-only scope).

---

## File Structure

- Create `src/world/player/aircraftVisualAttitude.js`
  - Config normalization, attitude state creation, target calculation, smoothing, hover offset, thruster intensity.
  - No DOM, renderer, GLTF, or camera code.
- Modify `src/world/player/PlayerAircraft.js`
  - Add `visualRoot`, engine node lookup, attitude update after motion step.
- Modify `src/world/WorldConfig.js`
  - Add `player.aircraft.visualAttitude` defaults.
- Modify `test/playerAircraftConfig.test.js`
  - One smoke test for new config keys.
- Do **not** modify `src/world/player/aircraftMotion.js`.

---

## Visual Feedback Mapping

| Operation | Visual feedback | Implementation |
| --- | --- | --- |
| Accelerate (`W`) | Nose dips slightly | Target pitch negative (nose down) scaled by thrust input |
| Decelerate / reverse (`S`) | Nose lifts slightly | Target pitch positive (nose up) scaled by reverse input |
| Turn left (`A`) | Bank left | Target roll positive, stronger at higher speed |
| Turn right (`D`) | Bank right | Target roll negative, stronger at higher speed |
| High-speed turn | Stronger bank | Multiply roll target by speed ratio |
| Release keys | Smooth recovery | Exponential smoothing toward zero pitch/roll |
| Idle hover | Subtle vertical bob | Sine offset on `visualRoot.position.y`, faded out at speed |

Thruster feedback:
- Find `left_engine` and `right_engine` nodes in cloned GLB (names from existing controller design).
- Scale emissive intensity / material opacity with thrust amount.
- During turns, brighten the outside thruster slightly more than the inside thruster.
- If nodes are missing, skip thruster VFX without warnings spam.

---

## Default Config

Add to `worldConfig.player.aircraft`:

```js
visualAttitude: {
  enabled: true,
  pitchMax: 0.18,          // radians, ~10 deg
  rollMax: 0.32,           // radians, ~18 deg
  pitchSmoothing: 10,
  rollSmoothing: 12,
  rollSpeedBoost: 0.35,    // extra roll at max speed
  hover: {
    amplitude: 0.06,
    frequency: 1.4,
    fadeSpeedRatio: 0.25   // bob gone above 25% max speed
  },
  thrusters: {
    enabled: true,
    baseIntensity: 0.35,
    thrustBoost: 0.65,
    turnBias: 0.25,
    leftNodeName: 'left_engine',
    rightNodeName: 'right_engine'
  }
}
```

---

### Task 1: Add Visual Attitude Config

**Files:**
- Modify: `src/world/WorldConfig.js`
- Modify: `test/playerAircraftConfig.test.js`

**Step 1: Add config defaults**

In `src/world/WorldConfig.js`, inside `player.aircraft`, append the `visualAttitude` block above after `cameraFollow`.

**Step 2: Add one smoke test**

Append to `test/playerAircraftConfig.test.js`:

```js
test('player aircraft visualAttitude config has expected defaults', () => {
  const attitude = worldConfig.player.aircraft.visualAttitude

  assert.equal(attitude.enabled, true)
  assert.equal(attitude.pitchMax > 0, true)
  assert.equal(attitude.rollMax > 0, true)
  assert.equal(attitude.pitchSmoothing > 0, true)
  assert.equal(attitude.rollSmoothing > 0, true)
  assert.equal(attitude.hover.amplitude > 0, true)
  assert.equal(attitude.hover.frequency > 0, true)
  assert.equal(attitude.thrusters.enabled, true)
})
```

**Step 3: Run tests**

Run: `npm test`
Expected: PASS (including existing aircraft tests)

**Step 4: Commit**

```bash
git add src/world/WorldConfig.js test/playerAircraftConfig.test.js
git commit -m "feat: add player aircraft visualAttitude config"
```

---

### Task 2: Create Visual Attitude Helper Module

**Files:**
- Create: `src/world/player/aircraftVisualAttitude.js`

**Step 1: Create the module**

Create `src/world/player/aircraftVisualAttitude.js`:

```js
import * as THREE from 'three/webgpu'

export const DEFAULT_VISUAL_ATTITUDE_CONFIG = {
  enabled: true,
  pitchMax: 0.18,
  rollMax: 0.32,
  pitchSmoothing: 10,
  rollSmoothing: 12,
  rollSpeedBoost: 0.35,
  hover: {
    amplitude: 0.06,
    frequency: 1.4,
    fadeSpeedRatio: 0.25
  },
  thrusters: {
    enabled: true,
    baseIntensity: 0.35,
    thrustBoost: 0.65,
    turnBias: 0.25,
    leftNodeName: 'left_engine',
    rightNodeName: 'right_engine'
  }
}

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1)
}

function expSmoothing(current, target, smoothing, delta) {
  if (delta <= 0) {
    return current
  }
  const factor = 1 - Math.exp(-smoothing * delta)
  return current + (target - current) * factor
}

export function normalizeVisualAttitudeConfig(config = {}) {
  const hover = config.hover ?? {}
  const thrusters = config.thrusters ?? {}

  return {
    enabled: config.enabled !== false,
    pitchMax: positiveNumber(config.pitchMax, DEFAULT_VISUAL_ATTITUDE_CONFIG.pitchMax),
    rollMax: positiveNumber(config.rollMax, DEFAULT_VISUAL_ATTITUDE_CONFIG.rollMax),
    pitchSmoothing: positiveNumber(config.pitchSmoothing, DEFAULT_VISUAL_ATTITUDE_CONFIG.pitchSmoothing),
    rollSmoothing: positiveNumber(config.rollSmoothing, DEFAULT_VISUAL_ATTITUDE_CONFIG.rollSmoothing),
    rollSpeedBoost: positiveNumber(config.rollSpeedBoost, DEFAULT_VISUAL_ATTITUDE_CONFIG.rollSpeedBoost),
    hover: {
      amplitude: positiveNumber(hover.amplitude, DEFAULT_VISUAL_ATTITUDE_CONFIG.hover.amplitude),
      frequency: positiveNumber(hover.frequency, DEFAULT_VISUAL_ATTITUDE_CONFIG.hover.frequency),
      fadeSpeedRatio: positiveNumber(hover.fadeSpeedRatio, DEFAULT_VISUAL_ATTITUDE_CONFIG.hover.fadeSpeedRatio)
    },
    thrusters: {
      enabled: thrusters.enabled !== false,
      baseIntensity: positiveNumber(thrusters.baseIntensity, DEFAULT_VISUAL_ATTITUDE_CONFIG.thrusters.baseIntensity),
      thrustBoost: positiveNumber(thrusters.thrustBoost, DEFAULT_VISUAL_ATTITUDE_CONFIG.thrusters.thrustBoost),
      turnBias: positiveNumber(thrusters.turnBias, DEFAULT_VISUAL_ATTITUDE_CONFIG.thrusters.turnBias),
      leftNodeName: thrusters.leftNodeName || DEFAULT_VISUAL_ATTITUDE_CONFIG.thrusters.leftNodeName,
      rightNodeName: thrusters.rightNodeName || DEFAULT_VISUAL_ATTITUDE_CONFIG.thrusters.rightNodeName
    }
  }
}

export function createVisualAttitudeState() {
  return {
    pitch: 0,
    roll: 0,
    hoverOffset: 0,
    hoverPhase: 0,
    leftThruster: 0,
    rightThruster: 0
  }
}

export function computeSpeedRatio(state, maxSpeed) {
  if (!Number.isFinite(maxSpeed) || maxSpeed <= 0) {
    return 0
  }
  return clamp01(state.velocity.length() / maxSpeed)
}

export function computeTargetAttitude(input, speedRatio, config) {
  const pitchTarget = -input.thrustInput * config.pitchMax
  const rollSpeedFactor = 1 + speedRatio * config.rollSpeedBoost
  const rollTarget = input.turnInput * config.rollMax * rollSpeedFactor

  return { pitchTarget, rollTarget }
}

export function computeHoverOffset(speedRatio, hoverPhase, config, delta) {
  const fade = 1 - clamp01(speedRatio / config.hover.fadeSpeedRatio)
  const nextPhase = hoverPhase + delta * config.hover.frequency * Math.PI * 2
  const offset = Math.sin(nextPhase) * config.hover.amplitude * fade

  return { hoverOffset: offset, hoverPhase: nextPhase }
}

export function computeThrusterIntensity(input, speedRatio, config) {
  const thrustAmount = clamp01(Math.abs(input.thrustInput))
  const base = config.thrusters.baseIntensity + thrustAmount * config.thrusters.thrustBoost
  const turnBias = input.turnInput * config.thrusters.turnBias * (0.35 + speedRatio * 0.65)

  return {
    leftThruster: clamp01(base - turnBias),
    rightThruster: clamp01(base + turnBias)
  }
}

export function stepVisualAttitude(state, attitudeState, input, motionConfig, visualConfig, delta) {
  if (!visualConfig.enabled || delta <= 0) {
    return attitudeState
  }

  const speedRatio = computeSpeedRatio(state, motionConfig.maxSpeed)
  const { pitchTarget, rollTarget } = computeTargetAttitude(input, speedRatio, visualConfig)

  attitudeState.pitch = expSmoothing(attitudeState.pitch, pitchTarget, visualConfig.pitchSmoothing, delta)
  attitudeState.roll = expSmoothing(attitudeState.roll, rollTarget, visualConfig.rollSmoothing, delta)

  const hover = computeHoverOffset(speedRatio, attitudeState.hoverPhase, visualConfig, delta)
  attitudeState.hoverOffset = hover.hoverOffset
  attitudeState.hoverPhase = hover.hoverPhase

  if (visualConfig.thrusters.enabled) {
    const thrusters = computeThrusterIntensity(input, speedRatio, visualConfig)
    attitudeState.leftThruster = thrusters.leftThruster
    attitudeState.rightThruster = thrusters.rightThruster
  }

  return attitudeState
}
```

**Step 2: Run tests**

Run: `npm test`
Expected: PASS (no new tests yet; existing suite still green)

**Step 3: Commit**

```bash
git add src/world/player/aircraftVisualAttitude.js
git commit -m "feat: add aircraft visual attitude helper module"
```

---

### Task 3: Refactor PlayerAircraft Model Hierarchy

**Files:**
- Modify: `src/world/player/PlayerAircraft.js`

**Step 1: Import visual attitude helpers**

At top of `PlayerAircraft.js`:

```js
import {
  createVisualAttitudeState,
  normalizeVisualAttitudeConfig,
  stepVisualAttitude
} from './aircraftVisualAttitude.js'
```

**Step 2: Initialize visual state in constructor**

After `this.motionConfig = normalizeAircraftConfig(playerConfig)` add:

```js
this.visualConfig = normalizeVisualAttitudeConfig(playerConfig.visualAttitude)
this.attitudeState = createVisualAttitudeState()
this.visualRoot = null
this.engineNodes = { left: null, right: null }
this._engineBaseEmissive = new WeakMap()
this._hoverTime = 0
```

**Step 3: Build visual root in `_buildModel()`**

Replace direct `this.group.add(model)` with:

```js
const model = sourceScene.clone(true)
model.rotation.y = Math.PI / 2

this.visualRoot = new THREE.Group()
this.visualRoot.name = 'AircraftVisualRoot'
this.visualRoot.add(model)
this.group.add(this.visualRoot)
this.group.scale.setScalar(this.motionConfig.scale)

this._resolveEngineNodes(model)
this.enabled = true
```

**Step 4: Add engine node resolver**

Add private method:

```js
_resolveEngineNodes(root) {
  const leftName = this.visualConfig.thrusters.leftNodeName
  const rightName = this.visualConfig.thrusters.rightNodeName

  root.traverse((node) => {
    if (node.name === leftName) {
      this.engineNodes.left = node
    }
    if (node.name === rightName) {
      this.engineNodes.right = node
    }
  })

  for (const node of [this.engineNodes.left, this.engineNodes.right]) {
    if (!node?.material?.emissive) {
      continue
    }
    this._engineBaseEmissive.set(node.material, node.material.emissive.clone())
  }
}
```

**Step 5: Commit**

```bash
git add src/world/player/PlayerAircraft.js
git commit -m "refactor: add aircraft visual root and engine node hooks"
```

---

### Task 4: Apply Attitude Each Frame

**Files:**
- Modify: `src/world/player/PlayerAircraft.js`

**Step 1: Split transform application**

Replace `_applyTransform()` with:

```js
_applyTransform() {
  this.group.position.copy(this.state.position)
  this.group.rotation.set(0, -this.state.yaw, 0)

  if (!this.visualRoot) {
    return
  }

  this.visualRoot.rotation.set(this.attitudeState.pitch, 0, this.attitudeState.roll)
  this.visualRoot.position.y = this.attitudeState.hoverOffset
}
```

**Step 2: Update attitude after motion step**

In `update()`, after `stepAircraftMotion(...)`:

```js
stepVisualAttitude(
  this.state,
  this.attitudeState,
  input,
  this.motionConfig,
  this.visualConfig,
  delta
)
this._applyThrusterVisuals()
this._applyTransform()
```

**Step 3: Add thruster visual helper**

```js
_applyThrusterVisuals() {
  if (!this.visualConfig.thrusters.enabled) {
    return
  }

  this._setEngineIntensity(this.engineNodes.left, this.attitudeState.leftThruster)
  this._setEngineIntensity(this.engineNodes.right, this.attitudeState.rightThruster)
}

_setEngineIntensity(node, intensity) {
  const material = node?.material
  const base = this._engineBaseEmissive.get(material)
  if (!material || !base) {
    return
  }

  material.emissive.copy(base).multiplyScalar(intensity)
  material.emissiveIntensity = intensity
  material.needsUpdate = true
}
```

**Step 4: Run tests**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/world/player/PlayerAircraft.js
git commit -m "feat: apply visual pitch roll hover and thruster feedback"
```

---

### Task 5: Optional Debug Panel Bindings

**Files:**
- Modify: `src/world/player/PlayerAircraft.js`

**Step 1: Expose attitude tuning in Tweakpane**

Inside `debuggerInit()`, after existing motion bindings:

```js
const attitudeFolder = folder.addFolder({ title: 'Visual Attitude', expanded: false })
attitudeFolder.addBinding(this.visualConfig, 'pitchMax', { min: 0, max: 0.5, step: 0.01, label: 'Pitch Max' })
attitudeFolder.addBinding(this.visualConfig, 'rollMax', { min: 0, max: 0.8, step: 0.01, label: 'Roll Max' })
attitudeFolder.addBinding(this.visualConfig, 'pitchSmoothing', { min: 1, max: 30, step: 0.5, label: 'Pitch Smooth' })
attitudeFolder.addBinding(this.visualConfig, 'rollSmoothing', { min: 1, max: 30, step: 0.5, label: 'Roll Smooth' })
attitudeFolder.addBinding(this.visualConfig.hover, 'amplitude', { min: 0, max: 0.2, step: 0.005, label: 'Hover Amp' })
attitudeFolder.addBinding(this.visualConfig.hover, 'frequency', { min: 0.2, max: 4, step: 0.1, label: 'Hover Hz' })
```

**Step 2: Manual verify panel appears**

Run: `npm run dev`
Expected: Tweakpane shows `Visual Attitude` folder; sliders change live feel.

**Step 3: Commit**

```bash
git add src/world/player/PlayerAircraft.js
git commit -m "chore: expose visual attitude debug controls"
```

---

### Task 6: Manual E2E Verification (Primary QA)

**Files:**
- None (browser only)

**Step 1: Start dev server**

Run: `npm run dev`
Open the app in Chrome/Edge with WebGPU enabled.

**Step 2: Hover / idle check**

- Do not press any keys for 3–5 seconds.
- Expected: aircraft bobs subtly up/down.
- Expected: `group.position.y` stays at configured `height` (camera follow should not jitter from bob).

**Step 3: Forward thrust check**

- Hold `W` until near max speed.
- Expected: nose dips slightly while accelerating.
- Expected: both thrusters brighten versus idle.

**Step 4: Reverse / brake check**

- From forward motion, hold `S`.
- Expected: nose lifts slightly.
- Expected: thruster glow reduces compared to full forward thrust.

**Step 5: Turn banking check**

- At low speed, tap `A` then release.
- Expected: brief left bank, then smooth return to level.
- Repeat with `D`.
- At high speed (`W` + `A`/`D`), expected: stronger bank angle.

**Step 6: Recovery check**

- Perform a sharp turn, then release all keys.
- Expected: pitch and roll ease back to neutral within ~0.5–1.0 s (tunable via config).

**Step 7: Physics unchanged check**

- Compare travel speed and turn radius before/after change (same `thrust`, `turnTorque`, `maxSpeed` config).
- Expected: movement path unchanged; only model orientation/offset differs.

**Step 8: Regression test suite**

Run: `npm test`
Expected: all tests PASS

**Step 9: Final commit (if tuning changed defaults)**

```bash
git add src/world/WorldConfig.js
git commit -m "chore: tune player aircraft visual attitude defaults"
```

---

## Non-Goals (Do Not Implement Now)

- Do not change `aircraftMotion.js` physics integration.
- Do not add GPU particles or TSL shader work for thrusters.
- Do not add extensive unit tests for attitude math (manual E2E is the acceptance gate).
- Do not animate `middle_engine`; only left/right thrusters react.
- Do not alter camera follow target (still uses physical `state.position`).

---

## Rollback / Disable Switch

Set `player.aircraft.visualAttitude.enabled = false` in `WorldConfig.js` to disable all visual attitude updates while keeping the controller intact.

---

## Estimated Effort

| Task | Time |
| --- | --- |
| Task 1 Config | 5 min |
| Task 2 Helper module | 10 min |
| Task 3 Model hierarchy | 10 min |
| Task 4 Frame update | 10 min |
| Task 5 Debug panel | 5 min |
| Task 6 Manual E2E | 15 min |
| **Total** | **~55 min** |
