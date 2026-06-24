# Player Aircraft Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a basic orthographic-view player aircraft controller driven by forward/reverse thrust and differential left/right turning.

**Architecture:** Keep controller math testable outside WebGPU by placing the motion integrator in `src/world/player/aircraftMotion.js` and keyboard state in `src/world/player/AircraftInput.js`. Add `PlayerAircraft` as a normal `World.addSystem()` child that clones the GLB, applies motion each frame, and optionally asks `WorldCamera` to follow the aircraft.

**Tech Stack:** Three.js WebGPU entrypoint, Vite, Node `node:test`, existing `Resources`, `World`, `WorldCamera`, and `WorldConfig` patterns.

---

## File Structure

- Create `src/world/player/aircraftMotion.js`
  - Owns defaults, config normalization, initial state creation, keyboard input resolution, and per-frame physics integration.
  - Contains no DOM, renderer, GLTF, or camera code.
- Create `src/world/player/AircraftInput.js`
  - Tracks `KeyW`, `KeyA`, `KeyS`, `KeyD`.
  - Attaches/removes browser listeners when a window-like target is available.
  - Exposes deterministic methods for tests.
- Create `src/world/player/PlayerAircraft.js`
  - World system that clones the aircraft asset, applies scale/height/yaw transforms, updates motion, and calls camera follow.
  - Emits one missing-asset warning and then stays disabled.
- Modify `src/assets/sources.js`
  - Register `playerAircraftModel` at `model/player/fly.glb`.
- Modify `src/world/WorldConfig.js`
  - Add `player.aircraft` tuning config.
- Modify `src/world/camera.js`
  - Add smooth `followTarget(target, delta, smoothing)` support.
- Modify `src/world/world.js`
  - Import and instantiate `PlayerAircraft` after prefab setup.
  - Hide player during AO grayscale preview if preview mode is active.
- Create `test/playerAircraftMotion.test.js`
  - Tests controller physics and config normalization.
- Create `test/aircraftInput.test.js`
  - Tests key tracking, listener cleanup, and blur clearing.
- Create `test/playerAircraftSystem.test.js`
  - Tests missing asset handling and clone/update behavior without WebGPU.
- Create or extend `test/playerAircraftConfig.test.js`
  - Tests asset source and config shape.

---

### Task 1: Add Player Asset And Config

**Files:**
- Modify: `src/assets/sources.js`
- Modify: `src/world/WorldConfig.js`
- Create: `test/playerAircraftConfig.test.js`

- [ ] **Step 1: Write the failing config/source test**

Create `test/playerAircraftConfig.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import sources from '../src/assets/sources.js'
import { worldConfig } from '../src/world/WorldConfig.js'

test('registers player aircraft model source', () => {
  const source = sources.find((entry) => entry.name === 'playerAircraftModel')

  assert.deepEqual(source, {
    name: 'playerAircraftModel',
    type: 'gltfModel',
    path: 'model/player/fly.glb'
  })
})

test('player aircraft config is enabled and has no terrain bounds clamp', () => {
  const config = worldConfig.player.aircraft

  assert.equal(config.enabled, true)
  assert.equal(config.assetName, 'playerAircraftModel')
  assert.equal(config.height > 0, true)
  assert.equal(config.scale > 0, true)
  assert.equal(config.thrust > config.reverseThrust, true)
  assert.equal(config.turnTorque > 0, true)
  assert.equal(config.linearDrag > 0, true)
  assert.equal(config.angularDrag > 0, true)
  assert.equal(config.maxSpeed > 0, true)
  assert.equal(config.maxAngularSpeed > 0, true)
  assert.equal(config.boundsPadding, undefined)
  assert.equal(config.cameraFollow.enabled, true)
  assert.equal(config.cameraFollow.smoothing > 0, true)
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- test/playerAircraftConfig.test.js
```

Expected: FAIL because `playerAircraftModel` and `worldConfig.player.aircraft` do not exist yet.

- [ ] **Step 3: Add source registration**

In `src/assets/sources.js`, insert the player model near the terrain model and before prefab assets:

```js
  { name: 'brick2x2Model', type: 'gltfModel', path: 'model/terrain/legoBlock2x2.glb' },
  { name: 'playerAircraftModel', type: 'gltfModel', path: 'model/player/fly.glb' },

  { name: 'waterBubbleModel', type: 'gltfModel', path: 'model/prefab/bubble.glb' },
```

- [ ] **Step 4: Add world config**

In `src/world/WorldConfig.js`, add `player` after `placement` and before `water`:

```js
  placement: {
    enableTrees: true,
    rotationStep: Math.PI / 2
  },
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
  },
  water: {
```

- [ ] **Step 5: Verify the config/source test passes**

Run:

```bash
npm test -- test/playerAircraftConfig.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -- src/assets/sources.js src/world/WorldConfig.js test/playerAircraftConfig.test.js
git commit -m "feat: register player aircraft config"
```

---

### Task 2: Implement Testable Aircraft Motion

**Files:**
- Create: `src/world/player/aircraftMotion.js`
- Create: `test/playerAircraftMotion.test.js`

- [ ] **Step 1: Write the failing motion tests**

Create `test/playerAircraftMotion.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createAircraftState,
  normalizeAircraftConfig,
  resolveAircraftInput,
  stepAircraftMotion
} from '../src/world/player/aircraftMotion.js'

test('normalizes invalid numeric config to conservative defaults', () => {
  const config = normalizeAircraftConfig({
    height: -1,
    scale: 0,
    thrust: Number.NaN,
    reverseThrust: -3,
    turnTorque: 0,
    linearDrag: -1,
    angularDrag: Number.POSITIVE_INFINITY,
    maxSpeed: -2,
    maxAngularSpeed: 0
  })

  assert.equal(config.height, 2.5)
  assert.equal(config.scale, 1)
  assert.equal(config.thrust, 14)
  assert.equal(config.reverseThrust, 7)
  assert.equal(config.turnTorque, 5)
  assert.equal(config.linearDrag, 2.2)
  assert.equal(config.angularDrag, 4)
  assert.equal(config.maxSpeed, 8)
  assert.equal(config.maxAngularSpeed, 2.8)
})

test('resolves keyboard state to thrust and turn input', () => {
  assert.deepEqual(resolveAircraftInput({ KeyW: true }), { thrustInput: 1, turnInput: 0 })
  assert.deepEqual(resolveAircraftInput({ KeyS: true }), { thrustInput: -1, turnInput: 0 })
  assert.deepEqual(resolveAircraftInput({ KeyA: true }), { thrustInput: 0, turnInput: 1 })
  assert.deepEqual(resolveAircraftInput({ KeyD: true }), { thrustInput: 0, turnInput: -1 })
  assert.deepEqual(resolveAircraftInput({ KeyW: true, KeyS: true, KeyA: true, KeyD: true }), { thrustInput: 0, turnInput: 0 })
})

test('forward thrust accelerates along current yaw', () => {
  const config = normalizeAircraftConfig({ thrust: 10, linearDrag: 0, maxSpeed: 100 })
  const state = createAircraftState({ yaw: 0 })

  stepAircraftMotion(state, { thrustInput: 1, turnInput: 0 }, config, 0.5)

  assert.equal(state.velocity.x > 0, true)
  assert.equal(Math.abs(state.velocity.z) < 0.000001, true)
  assert.equal(state.position.x > 0, true)
})

test('reverse thrust is weaker than forward thrust', () => {
  const config = normalizeAircraftConfig({ thrust: 10, reverseThrust: 4, linearDrag: 0, maxSpeed: 100, maxDelta: 1 })
  const forward = createAircraftState()
  const reverse = createAircraftState()

  stepAircraftMotion(forward, { thrustInput: 1, turnInput: 0 }, config, 1)
  stepAircraftMotion(reverse, { thrustInput: -1, turnInput: 0 }, config, 1)

  assert.equal(forward.velocity.length(), 10)
  assert.equal(reverse.velocity.length(), 4)
  assert.equal(reverse.velocity.x < 0, true)
})

test('left and right turn inputs change angular velocity in opposite directions', () => {
  const config = normalizeAircraftConfig({ turnTorque: 3, angularDrag: 0, maxAngularSpeed: 100, maxDelta: 1 })
  const left = createAircraftState()
  const right = createAircraftState()

  stepAircraftMotion(left, { thrustInput: 0, turnInput: 1 }, config, 1)
  stepAircraftMotion(right, { thrustInput: 0, turnInput: -1 }, config, 1)

  assert.equal(left.angularVelocity, 3)
  assert.equal(right.angularVelocity, -3)
})

test('linear and angular drag reduce velocity over time', () => {
  const config = normalizeAircraftConfig({ linearDrag: 2, angularDrag: 2, maxDelta: 1 })
  const state = createAircraftState({
    velocity: [10, 0, 0],
    angularVelocity: 4
  })

  stepAircraftMotion(state, { thrustInput: 0, turnInput: 0 }, config, 0.25)

  assert.equal(state.velocity.length() < 10, true)
  assert.equal(Math.abs(state.angularVelocity) < 4, true)
})

test('speed and angular velocity are clamped', () => {
  const config = normalizeAircraftConfig({
    thrust: 100,
    turnTorque: 100,
    linearDrag: 0,
    angularDrag: 0,
    maxSpeed: 5,
    maxAngularSpeed: 2,
    maxDelta: 1
  })
  const state = createAircraftState()

  stepAircraftMotion(state, { thrustInput: 1, turnInput: 1 }, config, 1)

  assert.equal(state.velocity.length(), 5)
  assert.equal(state.angularVelocity, 2)
})

test('position is not clamped to terrain bounds', () => {
  const config = normalizeAircraftConfig({ thrust: 100, linearDrag: 0, maxSpeed: 1000, maxDelta: 1 })
  const state = createAircraftState({ position: [10000, 2.5, 10000] })

  stepAircraftMotion(state, { thrustInput: 1, turnInput: 0 }, config, 1)

  assert.equal(state.position.x > 10000, true)
  assert.equal(state.position.z, 10000)
})

test('large deltas are capped for stable tab resume behavior', () => {
  const config = normalizeAircraftConfig({ thrust: 10, linearDrag: 0, maxSpeed: 100 })
  const state = createAircraftState()

  stepAircraftMotion(state, { thrustInput: 1, turnInput: 0 }, config, 10)

  assert.equal(state.velocity.x, 0.5)
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- test/playerAircraftMotion.test.js
```

Expected: FAIL because `src/world/player/aircraftMotion.js` does not exist.

- [ ] **Step 3: Create the motion module**

Create `src/world/player/aircraftMotion.js`:

```js
import * as THREE from 'three/webgpu'

export const DEFAULT_AIRCRAFT_CONFIG = {
  height: 2.5,
  scale: 1,
  thrust: 14,
  reverseThrust: 7,
  turnTorque: 5,
  linearDrag: 2.2,
  angularDrag: 4,
  maxSpeed: 8,
  maxAngularSpeed: 2.8,
  maxDelta: 0.05
}

const FORWARD = new THREE.Vector3()

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function nonNegativeNumber(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

export function normalizeAircraftConfig(config = {}) {
  return {
    height: positiveNumber(config.height, DEFAULT_AIRCRAFT_CONFIG.height),
    scale: positiveNumber(config.scale, DEFAULT_AIRCRAFT_CONFIG.scale),
    thrust: positiveNumber(config.thrust, DEFAULT_AIRCRAFT_CONFIG.thrust),
    reverseThrust: positiveNumber(config.reverseThrust, DEFAULT_AIRCRAFT_CONFIG.reverseThrust),
    turnTorque: positiveNumber(config.turnTorque, DEFAULT_AIRCRAFT_CONFIG.turnTorque),
    linearDrag: nonNegativeNumber(config.linearDrag, DEFAULT_AIRCRAFT_CONFIG.linearDrag),
    angularDrag: nonNegativeNumber(config.angularDrag, DEFAULT_AIRCRAFT_CONFIG.angularDrag),
    maxSpeed: positiveNumber(config.maxSpeed, DEFAULT_AIRCRAFT_CONFIG.maxSpeed),
    maxAngularSpeed: positiveNumber(config.maxAngularSpeed, DEFAULT_AIRCRAFT_CONFIG.maxAngularSpeed),
    maxDelta: positiveNumber(config.maxDelta, DEFAULT_AIRCRAFT_CONFIG.maxDelta)
  }
}

export function createAircraftState(options = {}) {
  const position = options.position ?? [0, DEFAULT_AIRCRAFT_CONFIG.height, 0]
  const velocity = options.velocity ?? [0, 0, 0]

  return {
    position: new THREE.Vector3(position[0], position[1], position[2]),
    velocity: new THREE.Vector3(velocity[0], velocity[1], velocity[2]),
    yaw: Number.isFinite(options.yaw) ? options.yaw : 0,
    angularVelocity: Number.isFinite(options.angularVelocity) ? options.angularVelocity : 0
  }
}

export function resolveAircraftInput(keys = {}) {
  const forward = keys.KeyW === true ? 1 : 0
  const reverse = keys.KeyS === true ? 1 : 0
  const left = keys.KeyA === true ? 1 : 0
  const right = keys.KeyD === true ? 1 : 0

  return {
    thrustInput: forward - reverse,
    turnInput: left - right
  }
}

function applyExponentialDrag(value, drag, delta) {
  if (drag <= 0 || delta <= 0) {
    return value
  }
  return value * Math.max(0, 1 - drag * delta)
}

export function stepAircraftMotion(state, input, config, delta) {
  const dt = Math.min(Math.max(delta, 0), config.maxDelta)
  if (dt === 0) {
    return state
  }

  const thrustPower = input.thrustInput >= 0 ? config.thrust : config.reverseThrust
  const acceleration = input.thrustInput * thrustPower
  FORWARD.set(Math.cos(state.yaw), 0, Math.sin(state.yaw))
  state.velocity.addScaledVector(FORWARD, acceleration * dt)

  state.angularVelocity += input.turnInput * config.turnTorque * dt

  state.velocity.multiplyScalar(applyExponentialDrag(1, config.linearDrag, dt))
  state.angularVelocity = applyExponentialDrag(state.angularVelocity, config.angularDrag, dt)

  if (state.velocity.lengthSq() > config.maxSpeed * config.maxSpeed) {
    state.velocity.setLength(config.maxSpeed)
  }
  state.angularVelocity = THREE.MathUtils.clamp(
    state.angularVelocity,
    -config.maxAngularSpeed,
    config.maxAngularSpeed
  )

  state.position.addScaledVector(state.velocity, dt)
  state.yaw += state.angularVelocity * dt
  state.position.y = config.height

  return state
}
```

- [ ] **Step 4: Verify the motion tests pass**

Run:

```bash
npm test -- test/playerAircraftMotion.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- src/world/player/aircraftMotion.js test/playerAircraftMotion.test.js
git commit -m "feat: add aircraft motion model"
```

---

### Task 3: Implement Aircraft Keyboard Input

**Files:**
- Create: `src/world/player/AircraftInput.js`
- Create: `test/aircraftInput.test.js`

- [ ] **Step 1: Write the failing input tests**

Create `test/aircraftInput.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import AircraftInput from '../src/world/player/AircraftInput.js'

function createTarget() {
  const listeners = new Map()
  return {
    listeners,
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) {
        listeners.delete(type)
      }
    },
    dispatch(type, event = {}) {
      listeners.get(type)?.(event)
    }
  }
}

test('tracks WASD key state and ignores unrelated keys', () => {
  const input = new AircraftInput()

  input.handleKeyDown({ code: 'KeyW', repeat: false })
  input.handleKeyDown({ code: 'KeyA', repeat: false })
  input.handleKeyDown({ code: 'Space', repeat: false })

  assert.deepEqual(input.getKeys(), {
    KeyW: true,
    KeyA: true,
    KeyS: false,
    KeyD: false
  })

  input.handleKeyUp({ code: 'KeyW' })

  assert.equal(input.getKeys().KeyW, false)
  assert.equal(input.getKeys().KeyA, true)
})

test('repeated keydown does not change tracked state', () => {
  const input = new AircraftInput()

  input.handleKeyDown({ code: 'KeyW', repeat: true })

  assert.equal(input.getKeys().KeyW, false)
})

test('blur clears all key state', () => {
  const input = new AircraftInput()

  input.handleKeyDown({ code: 'KeyW', repeat: false })
  input.handleKeyDown({ code: 'KeyD', repeat: false })
  input.clear()

  assert.deepEqual(input.getKeys(), {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false
  })
})

test('attach and dispose register and remove window listeners', () => {
  const target = createTarget()
  const input = new AircraftInput(target)

  input.attach()

  assert.equal(target.listeners.has('keydown'), true)
  assert.equal(target.listeners.has('keyup'), true)
  assert.equal(target.listeners.has('blur'), true)

  target.dispatch('keydown', { code: 'KeyS', repeat: false })
  assert.equal(input.getKeys().KeyS, true)

  input.dispose()

  assert.equal(target.listeners.size, 0)
  assert.equal(input.getKeys().KeyS, false)
})

test('attach is safe when no target is available', () => {
  const input = new AircraftInput(null)

  input.attach()
  input.dispose()

  assert.deepEqual(input.getKeys(), {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false
  })
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- test/aircraftInput.test.js
```

Expected: FAIL because `AircraftInput.js` does not exist.

- [ ] **Step 3: Create the input helper**

Create `src/world/player/AircraftInput.js`:

```js
const CONTROL_CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD']

function createEmptyKeys() {
  return {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false
  }
}

export default class AircraftInput {
  constructor(target = globalThis.window ?? null) {
    this.target = target
    this.keys = createEmptyKeys()
    this.isAttached = false

    this._onKeyDown = (event) => this.handleKeyDown(event)
    this._onKeyUp = (event) => this.handleKeyUp(event)
    this._onBlur = () => this.clear()
  }

  attach() {
    if (!this.target || this.isAttached) {
      return
    }

    this.target.addEventListener('keydown', this._onKeyDown)
    this.target.addEventListener('keyup', this._onKeyUp)
    this.target.addEventListener('blur', this._onBlur)
    this.isAttached = true
  }

  handleKeyDown(event) {
    if (event.repeat === true || !CONTROL_CODES.includes(event.code)) {
      return
    }
    this.keys[event.code] = true
  }

  handleKeyUp(event) {
    if (!CONTROL_CODES.includes(event.code)) {
      return
    }
    this.keys[event.code] = false
  }

  clear() {
    this.keys = createEmptyKeys()
  }

  getKeys() {
    return { ...this.keys }
  }

  dispose() {
    if (this.target && this.isAttached) {
      this.target.removeEventListener('keydown', this._onKeyDown)
      this.target.removeEventListener('keyup', this._onKeyUp)
      this.target.removeEventListener('blur', this._onBlur)
    }
    this.isAttached = false
    this.clear()
  }
}
```

- [ ] **Step 4: Verify input tests pass**

Run:

```bash
npm test -- test/aircraftInput.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- src/world/player/AircraftInput.js test/aircraftInput.test.js
git commit -m "feat: add aircraft keyboard input"
```

---

### Task 4: Add Orthographic Camera Follow

**Files:**
- Modify: `src/world/camera.js`
- Create: `test/worldCameraFollow.test.js`

- [ ] **Step 1: Write the failing camera follow test**

Create `test/worldCameraFollow.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import WorldCamera from '../src/world/camera.js'

test('followTarget moves camera and controls target by the same delta', () => {
  const camera = Object.create(WorldCamera.prototype)
  camera.instance = new THREE.OrthographicCamera()
  camera.instance.position.set(40, 40, 40)
  let updateCount = 0
  camera.controls = {
    target: new THREE.Vector3(10, 0, 10),
    update() {
      updateCount += 1
    }
  }

  camera.followTarget(new THREE.Vector3(14, 0, 10), 0.1, 10)

  assert.equal(camera.controls.target.x > 10, true)
  assert.equal(camera.controls.target.x < 14, true)
  assert.equal(camera.controls.target.z, 10)
  assert.equal(camera.instance.position.x, 40 + (camera.controls.target.x - 10))
  assert.equal(camera.instance.position.z, 40)
  assert.equal(updateCount, 1)
})

test('followTarget snaps when smoothing is zero or less', () => {
  const camera = Object.create(WorldCamera.prototype)
  camera.instance = new THREE.OrthographicCamera()
  camera.instance.position.set(40, 40, 40)
  camera.controls = {
    target: new THREE.Vector3(10, 0, 10),
    update() {}
  }

  camera.followTarget(new THREE.Vector3(14, 0, 12), 0.1, 0)

  assert.equal(camera.controls.target.x, 14)
  assert.equal(camera.controls.target.z, 12)
  assert.equal(camera.instance.position.x, 44)
  assert.equal(camera.instance.position.z, 42)
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- test/worldCameraFollow.test.js
```

Expected: FAIL because `followTarget` does not exist.

- [ ] **Step 3: Add `followTarget` to `WorldCamera`**

In `src/world/camera.js`, add the method after `lookAt(target)`:

```js
    followTarget(target, delta, smoothing = 0) {
        const previousTarget = this.controls.target.clone()
        const nextTarget = target.clone()

        if (smoothing > 0 && delta > 0) {
            const alpha = 1 - Math.exp(-smoothing * delta)
            nextTarget.lerpVectors(previousTarget, target, alpha)
        }

        const movement = nextTarget.sub(previousTarget)
        this.controls.target.copy(previousTarget).add(movement)
        this.instance.position.add(movement)
        this.controls.update()
    }
```

- [ ] **Step 4: Verify camera follow tests pass**

Run:

```bash
npm test -- test/worldCameraFollow.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- src/world/camera.js test/worldCameraFollow.test.js
git commit -m "feat: add camera follow target"
```

---

### Task 5: Implement PlayerAircraft World System

**Files:**
- Create: `src/world/player/PlayerAircraft.js`
- Create: `test/playerAircraftSystem.test.js`

- [ ] **Step 1: Write the failing system tests**

Create `test/playerAircraftSystem.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import PlayerAircraft from '../src/world/player/PlayerAircraft.js'

function createExperience({ asset = createAsset(), config = {} } = {}) {
  let followCall = null
  return {
    resources: {
      items: {
        playerAircraftModel: asset
      }
    },
    time: {
      getDelta() {
        return 0.1
      }
    },
    worldCamera: {
      followTarget(target, delta, smoothing) {
        followCall = { target: target.clone(), delta, smoothing }
      },
      get followCall() {
        return followCall
      }
    },
    config: {
      player: {
        aircraft: {
          enabled: true,
          assetName: 'playerAircraftModel',
          height: 3,
          scale: 2,
          thrust: 10,
          reverseThrust: 5,
          turnTorque: 4,
          linearDrag: 0,
          angularDrag: 0,
          maxSpeed: 100,
          maxAngularSpeed: 100,
          cameraFollow: {
            enabled: true,
            smoothing: 6
          },
          ...config
        }
      }
    }
  }
}

function createAsset() {
  const scene = new THREE.Group()
  scene.name = 'aircraftRoot'
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
  body.name = 'aircraft'
  scene.add(body)
  return { scene }
}

test('clones the configured aircraft asset into its group', () => {
  const experience = createExperience()
  const player = new PlayerAircraft(experience)

  assert.equal(player.enabled, true)
  assert.equal(player.group.children.length, 1)
  assert.notEqual(player.group.children[0], experience.resources.items.playerAircraftModel.scene)
  assert.equal(player.group.scale.x, 2)
  assert.equal(player.group.position.y, 3)
})

test('missing asset disables player and warns once', () => {
  const warnings = []
  const originalWarn = console.warn
  console.warn = (message) => warnings.push(message)

  try {
    const player = new PlayerAircraft(createExperience({ asset: null }))
    player.update()
    player.update()

    assert.equal(player.enabled, false)
    assert.equal(player.group.children.length, 0)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /Missing aircraft asset/)
  } finally {
    console.warn = originalWarn
  }
})

test('update applies thrust motion and camera follow', () => {
  const experience = createExperience()
  const player = new PlayerAircraft(experience, { inputTarget: null })

  player.input.handleKeyDown({ code: 'KeyW', repeat: false })
  player.update()

  assert.equal(player.group.position.x > 0, true)
  assert.equal(player.group.position.y, 3)
  assert.equal(experience.worldCamera.followCall.target.x, player.group.position.x)
  assert.equal(experience.worldCamera.followCall.delta, 0.1)
  assert.equal(experience.worldCamera.followCall.smoothing, 6)
})

test('camera follow can be disabled', () => {
  const experience = createExperience({
    config: {
      cameraFollow: {
        enabled: false,
        smoothing: 6
      }
    }
  })
  const player = new PlayerAircraft(experience, { inputTarget: null })

  player.update()

  assert.equal(experience.worldCamera.followCall, null)
})

test('dispose removes input listeners and scene children', () => {
  const target = {
    listeners: new Map(),
    addEventListener(type, listener) {
      this.listeners.set(type, listener)
    },
    removeEventListener(type, listener) {
      if (this.listeners.get(type) === listener) {
        this.listeners.delete(type)
      }
    }
  }
  const player = new PlayerAircraft(createExperience(), { inputTarget: target })

  assert.equal(target.listeners.size, 3)

  player.dispose()

  assert.equal(target.listeners.size, 0)
  assert.equal(player.group.children.length, 0)
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- test/playerAircraftSystem.test.js
```

Expected: FAIL because `PlayerAircraft.js` does not exist.

- [ ] **Step 3: Create the player system**

Create `src/world/player/PlayerAircraft.js`:

```js
import * as THREE from 'three/webgpu'
import AircraftInput from './AircraftInput.js'
import {
  createAircraftState,
  normalizeAircraftConfig,
  resolveAircraftInput,
  stepAircraftMotion
} from './aircraftMotion.js'

function resolveInitialPosition(config) {
  const terrain = config.terrain ?? {}
  const width = Number.isFinite(terrain.width) ? terrain.width : 0
  const depth = Number.isFinite(terrain.depth) ? terrain.depth : 0
  const cellSize = Number.isFinite(terrain.cellSize) ? terrain.cellSize : 1
  return [width * cellSize * 0.5, 0, depth * cellSize * 0.5]
}

export default class PlayerAircraft {
  constructor(experience, options = {}) {
    this.experience = experience
    this.group = new THREE.Group()
    this.group.name = 'PlayerAircraft'
    this.enabled = false
    this._missingAssetWarned = false

    this.worldConfig = options.config ?? experience.config ?? {}
    const playerConfig = this.worldConfig.player?.aircraft ?? {}
    this.rawConfig = playerConfig
    this.motionConfig = normalizeAircraftConfig(playerConfig)
    this.cameraFollow = {
      enabled: playerConfig.cameraFollow?.enabled === true,
      smoothing: Number.isFinite(playerConfig.cameraFollow?.smoothing)
        ? playerConfig.cameraFollow.smoothing
        : 8
    }
    this.input = new AircraftInput(options.inputTarget ?? globalThis.window ?? null)
    const initialPosition = resolveInitialPosition(this.worldConfig)
    this.state = createAircraftState({
      position: [initialPosition[0], this.motionConfig.height, initialPosition[2]]
    })

    if (playerConfig.enabled === false) {
      return
    }

    this._buildModel()
    if (this.enabled) {
      this.input.attach()
      this._applyTransform()
    }
  }

  _buildModel() {
    const assetName = this.rawConfig.assetName || 'playerAircraftModel'
    const asset = this.experience.resources?.items?.[assetName]
    const sourceScene = asset?.scene

    if (!sourceScene) {
      if (!this._missingAssetWarned) {
        console.warn(`[PlayerAircraft] Missing aircraft asset "${assetName}"; player disabled.`)
        this._missingAssetWarned = true
      }
      this.enabled = false
      return
    }

    const model = sourceScene.clone(true)
    this.group.add(model)
    this.group.scale.setScalar(this.motionConfig.scale)
    this.enabled = true
  }

  _applyTransform() {
    this.group.position.copy(this.state.position)
    this.group.rotation.y = -this.state.yaw
  }

  update() {
    if (!this.enabled) {
      return
    }

    const delta = this.experience.time.getDelta()
    const input = resolveAircraftInput(this.input.getKeys())
    stepAircraftMotion(this.state, input, this.motionConfig, delta)
    this._applyTransform()

    if (this.cameraFollow.enabled) {
      this.experience.worldCamera.followTarget(
        this.state.position,
        Math.min(delta, this.motionConfig.maxDelta),
        this.cameraFollow.smoothing
      )
    }
  }

  debuggerInit(debug) {
    const folder = debug.addFolder({ title: 'Player Aircraft', expanded: false })
    if (!folder) {
      return
    }
    folder.addBinding(this.motionConfig, 'thrust', { min: 0, max: 40, step: 0.5, label: 'Thrust' })
    folder.addBinding(this.motionConfig, 'turnTorque', { min: 0, max: 20, step: 0.1, label: 'Turn' })
    folder.addBinding(this.motionConfig, 'linearDrag', { min: 0, max: 10, step: 0.1, label: 'Drag' })
    folder.addBinding(this.motionConfig, 'maxSpeed', { min: 1, max: 30, step: 0.5, label: 'Max Speed' })
  }

  dispose() {
    this.input.dispose()
    this.group.clear()
    this.enabled = false
  }
}
```

- [ ] **Step 4: Verify system tests pass**

Run:

```bash
npm test -- test/playerAircraftSystem.test.js
```

Expected: PASS.

- [ ] **Step 5: Run all focused player tests**

Run:

```bash
npm test -- test/playerAircraftConfig.test.js test/playerAircraftMotion.test.js test/aircraftInput.test.js test/worldCameraFollow.test.js test/playerAircraftSystem.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -- src/world/player/PlayerAircraft.js test/playerAircraftSystem.test.js
git commit -m "feat: add player aircraft system"
```

---

### Task 6: Integrate PlayerAircraft Into World

**Files:**
- Modify: `src/world/world.js`

- [ ] **Step 1: Add import**

In `src/world/world.js`, add:

```js
import PlayerAircraft from './player/PlayerAircraft.js'
```

Place it after the existing prefab imports:

```js
import PrefabRegistry from './prefabs/PrefabRegistry.js'
import PrefabPlacer from './prefabs/PrefabPlacer.js'
import PlayerAircraft from './player/PlayerAircraft.js'
```

- [ ] **Step 2: Add instance property**

In the `World` constructor, after `this.prefabPlacer = null`, add:

```js
        this.playerAircraft = null
```

- [ ] **Step 3: Instantiate the player system during build**

In `World.build()`, after the prefab placer is added, add:

```js
            this.playerAircraft = new PlayerAircraft(this.experience, { config: this.config })
            this.addSystem(this.playerAircraft)
```

Expected local context:

```js
            this.prefabPlacer = new PrefabPlacer({
                config: this.config,
                biomeRegistry: this.biomeRegistry,
                prefabRegistry
            })
            this.addSystem(this.prefabPlacer)

            this.playerAircraft = new PlayerAircraft(this.experience, { config: this.config })
            this.addSystem(this.playerAircraft)
```

- [ ] **Step 4: Hide player during AO preview**

In `World.refreshAOPreview()`, after the prefab visibility block, add:

```js
        if (this.playerAircraft?.group) {
            this.playerAircraft.group.visible = !preview
        }
```

- [ ] **Step 5: Run the focused player tests**

Run:

```bash
npm test -- test/playerAircraftConfig.test.js test/playerAircraftMotion.test.js test/aircraftInput.test.js test/worldCameraFollow.test.js test/playerAircraftSystem.test.js
```

Expected: PASS.

- [ ] **Step 6: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS. If the known Windows sandbox `EPERM: operation not permitted, lstat 'C:\Users\f1686533'` appears, rerun the focused player tests and record the EPERM separately as environment noise.

- [ ] **Step 7: Build**

Run:

```bash
npm run build
```

Expected: PASS. Existing Vite large-chunk warnings are acceptable.

- [ ] **Step 8: Start the dev server for manual verification**

Run:

```bash
npm run dev
```

Expected: Vite prints a local URL. Open the URL manually if needed and verify:

- aircraft appears from `model/player/fly.glb`
- `W` accelerates forward
- `S` applies weaker reverse thrust
- `A` and `D` turn via angular acceleration
- movement keeps inertia and damping
- camera follows without changing orthographic style
- player is not clamped to the initial terrain footprint

- [ ] **Step 9: Commit**

```bash
git add -- src/world/world.js
git commit -m "feat: integrate player aircraft"
```

---

### Task 7: Final Verification And Cleanup

**Files:**
- Inspect: `src/world/player/aircraftMotion.js`
- Inspect: `src/world/player/AircraftInput.js`
- Inspect: `src/world/player/PlayerAircraft.js`
- Inspect: `src/world/camera.js`
- Inspect: `src/world/world.js`
- Inspect: `src/assets/sources.js`
- Inspect: `src/world/WorldConfig.js`

- [ ] **Step 1: Check for forbidden terrain-bound clamp leftovers**

Run:

```bash
rg "Clamp position|position clamps|generated terrain footprint|128 x 128" src test
rg "boundsPadding" src/world
```

Expected: no matches. `test/playerAircraftConfig.test.js` may assert that `boundsPadding` is undefined; the runtime config must not contain it.

- [ ] **Step 2: Check aircraft node spelling**

Run:

```bash
rg "leaf[_]engine" src test docs/superpowers/specs
rg "left_engine" docs/superpowers/specs
```

Expected: no `leaf_engine` matches. `left_engine` should appear in the approved spec.

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm test -- test/playerAircraftConfig.test.js test/playerAircraftMotion.test.js test/aircraftInput.test.js test/worldCameraFollow.test.js test/playerAircraftSystem.test.js
```

Expected: PASS.

- [ ] **Step 4: Run all tests**

Run:

```bash
npm test
```

Expected: PASS, unless the known Windows sandbox `EPERM: operation not permitted, lstat 'C:\Users\f1686533'` occurs. If EPERM occurs, include the exact error string in the final summary and do not describe it as a code failure unless a rerun shows test assertions failing.

- [ ] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected: PASS. Record any Vite large-chunk warning separately from build success.

- [ ] **Step 6: Inspect git diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: changed files are limited to the controller implementation, tests, config/source registration, and any untracked assets the user already has. Do not stage unrelated untracked `%SystemDrive%/` or `public/model/tree/pine.glb`.

- [ ] **Step 7: Commit final verification note if needed**

If Task 7 required small cleanup edits, commit them:

```bash
git add -- src test docs/superpowers/plans/2026-06-24-player-aircraft-controller-implementation.md
git commit -m "chore: verify player aircraft controller"
```

If no files changed during Task 7, do not create an empty commit.
