# Wing Airflow VFX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add speed-driven left and right wing airflow ribbons to the player aircraft, with acceleration making the airflow stronger.

**Architecture:** Implement a focused `wingAirflowVFX.js` module owned by `PlayerAircraft`. The module normalizes config, records world-space wing-anchor samples in fixed ring buffers, rebuilds preallocated ribbon geometry each frame, and exposes a small lifecycle API: `update()`, `setVisible()`, `clear()`, and `dispose()`.

**Tech Stack:** JavaScript ES modules, Three.js WebGPU entrypoint, CanvasTexture, BufferGeometry, Node test runner, Vite.

---

## File Structure

- Create `src/world/player/wingAirflowVFX.js`
  - Owns default config and config normalization.
  - Owns pure helpers for speed ratio, intensity, width, and tangent break checks.
  - Defines a testable `WingAirflowSide` ring-buffer/ribbon builder.
  - Defines `createWingAirflowVFX(parent, config)` for scene object creation and runtime updates.
- Create `test/wingAirflowVFX.test.js`
  - Covers config normalization, sample emission gates, lifetime expiry, turn break logic, acceleration intensity, and dispose behavior.
- Modify `src/world/player/PlayerAircraft.js`
  - Normalizes `playerConfig.wingAirflow`.
  - Creates the airflow after the aircraft visual root is created.
  - Updates it after aircraft transforms are applied.
  - Disposes it with the aircraft.
  - Adds `Player Aircraft > Wing Airflow` debug bindings.
- Modify `src/world/WorldConfig.js`
  - Adds `player.aircraft.wingAirflow` defaults.
- Modify `test/playerAircraftConfig.test.js`
  - Asserts default wing airflow config exists and is enabled.
- Modify `test/playerAircraftSystem.test.js`
  - Asserts `PlayerAircraft` creates and disposes the airflow VFX when enabled.

## Task 1: Config and Pure Helpers

**Files:**
- Create: `src/world/player/wingAirflowVFX.js`
- Create: `test/wingAirflowVFX.test.js`

- [ ] **Step 1: Write failing helper tests**

Create `test/wingAirflowVFX.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import {
  DEFAULT_WING_AIRFLOW_CONFIG,
  normalizeWingAirflowConfig,
  computeAirflowSpeedRatio,
  resolveAirflowOpacity,
  canConnectAirflowSamples,
  computeAirflowHalfWidth
} from '../src/world/player/wingAirflowVFX.js'

test('normalizes wing airflow config with safe defaults and clamps sample count', () => {
  const config = normalizeWingAirflowConfig({
    enabled: true,
    capacity: 6,
    maxSamples: 99,
    sampleLife: -1,
    emitInterval: 0,
    minEmitDistance: Number.NaN,
    minSpeedRatio: 2,
    breakAngleDeg: -45,
    color: '#abc123',
    anchors: {
      wingHalfWidth: 2,
      outwardOffset: -1,
      backOffset: 0.2,
      upOffset: 0.1
    }
  })

  assert.equal(config.enabled, true)
  assert.equal(config.capacity, 6)
  assert.equal(config.maxSamples, 6)
  assert.equal(config.sampleLife, DEFAULT_WING_AIRFLOW_CONFIG.sampleLife)
  assert.equal(config.emitInterval, DEFAULT_WING_AIRFLOW_CONFIG.emitInterval)
  assert.equal(config.minEmitDistance, DEFAULT_WING_AIRFLOW_CONFIG.minEmitDistance)
  assert.equal(config.minSpeedRatio, 1)
  assert.equal(config.breakAngleDeg, DEFAULT_WING_AIRFLOW_CONFIG.breakAngleDeg)
  assert.equal(config.color, '#abc123')
  assert.deepEqual(config.anchors, {
    wingHalfWidth: 2,
    outwardOffset: 0,
    backOffset: 0.2,
    upOffset: 0.1
  })
})

test('computes speed ratio from velocity length and max speed', () => {
  const state = { velocity: new THREE.Vector3(3, 0, 4) }

  assert.equal(computeAirflowSpeedRatio(state, 10), 0.5)
  assert.equal(computeAirflowSpeedRatio(state, 2), 1)
  assert.equal(computeAirflowSpeedRatio(state, 0), 0)
})

test('positive thrust input increases airflow opacity', () => {
  const config = normalizeWingAirflowConfig({
    opacity: 0.4,
    speedOpacity: 0.4,
    accelerationBoost: 0.5,
    pulseStrength: 0
  })

  const gliding = resolveAirflowOpacity(config, {
    speedRatio: 0.5,
    thrustInput: 0,
    elapsed: 0
  })
  const accelerating = resolveAirflowOpacity(config, {
    speedRatio: 0.5,
    thrustInput: 1,
    elapsed: 0
  })

  assert.equal(gliding, 0.6)
  assert.equal(accelerating, 0.85)
})

test('sample connection respects configured break angle', () => {
  const forward = new THREE.Vector3(1, 0, 0)
  const shallow = new THREE.Vector3(Math.cos(Math.PI / 6), 0, Math.sin(Math.PI / 6))
  const sharp = new THREE.Vector3(0, 0, 1)

  assert.equal(canConnectAirflowSamples(forward, shallow, 68), true)
  assert.equal(canConnectAirflowSamples(forward, sharp, 68), false)
})

test('airflow width follows a lifetime bell curve', () => {
  const config = normalizeWingAirflowConfig({
    width: 0.1,
    tipWidthRatio: 0,
    bellPower: 1,
    sampleLife: 1
  })

  assert.equal(computeAirflowHalfWidth(config, { age: 0, speedRatio: 1 }), 0)
  assert.equal(computeAirflowHalfWidth(config, { age: 0.5, speedRatio: 1 }) > 0.049, true)
  assert.equal(computeAirflowHalfWidth(config, { age: 1, speedRatio: 1 }) < 1e-6, true)
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- test/wingAirflowVFX.test.js
```

Expected: FAIL because `src/world/player/wingAirflowVFX.js` does not exist.

- [ ] **Step 3: Implement config and helper exports**

Create `src/world/player/wingAirflowVFX.js` with this initial content:

```js
import * as THREE from 'three/webgpu'

export const DEFAULT_WING_AIRFLOW_CONFIG = {
  enabled: true,
  anchors: {
    wingHalfWidth: 0.78,
    outwardOffset: 0.12,
    backOffset: -0.10,
    upOffset: 0.03
  },
  sampleLife: 0.56,
  emitInterval: 0.034,
  minEmitDistance: 0.045,
  capacity: 32,
  maxSamples: 18,
  minSpeedRatio: 0.04,
  breakAngleDeg: 68,
  width: 0.09,
  tipWidthRatio: 0,
  bellPower: 1.35,
  verticalOffset: 0.045,
  opacity: 0.54,
  speedOpacity: 0.48,
  accelerationBoost: 0.35,
  pulseStrength: 0.01,
  color: '#f7fbff',
  additive: false,
  showAnchors: false
}

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function nonNegativeNumber(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function clamp01(value) {
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1)
}

function normalizeColor(value, fallback) {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value.trim())
    ? value.trim()
    : fallback
}

export function normalizeWingAirflowConfig(config = {}) {
  const defaults = DEFAULT_WING_AIRFLOW_CONFIG
  const anchors = config.anchors ?? {}
  const capacity = Math.max(2, Math.floor(positiveNumber(config.capacity, defaults.capacity)))
  const maxSamples = Math.max(2, Math.floor(positiveNumber(config.maxSamples, defaults.maxSamples)))

  return {
    enabled: config.enabled !== false,
    anchors: {
      wingHalfWidth: positiveNumber(anchors.wingHalfWidth, defaults.anchors.wingHalfWidth),
      outwardOffset: nonNegativeNumber(anchors.outwardOffset, defaults.anchors.outwardOffset),
      backOffset: Number.isFinite(anchors.backOffset) ? anchors.backOffset : defaults.anchors.backOffset,
      upOffset: Number.isFinite(anchors.upOffset) ? anchors.upOffset : defaults.anchors.upOffset
    },
    sampleLife: positiveNumber(config.sampleLife, defaults.sampleLife),
    emitInterval: positiveNumber(config.emitInterval, defaults.emitInterval),
    minEmitDistance: nonNegativeNumber(config.minEmitDistance, defaults.minEmitDistance),
    capacity,
    maxSamples: Math.min(maxSamples, capacity),
    minSpeedRatio: clamp01(config.minSpeedRatio ?? defaults.minSpeedRatio),
    breakAngleDeg: positiveNumber(config.breakAngleDeg, defaults.breakAngleDeg),
    width: positiveNumber(config.width, defaults.width),
    tipWidthRatio: clamp01(config.tipWidthRatio ?? defaults.tipWidthRatio),
    bellPower: positiveNumber(config.bellPower, defaults.bellPower),
    verticalOffset: Number.isFinite(config.verticalOffset) ? config.verticalOffset : defaults.verticalOffset,
    opacity: clamp01(config.opacity ?? defaults.opacity),
    speedOpacity: nonNegativeNumber(config.speedOpacity, defaults.speedOpacity),
    accelerationBoost: nonNegativeNumber(config.accelerationBoost, defaults.accelerationBoost),
    pulseStrength: nonNegativeNumber(config.pulseStrength, defaults.pulseStrength),
    color: normalizeColor(config.color, defaults.color),
    additive: config.additive === true,
    showAnchors: config.showAnchors === true
  }
}

export function computeAirflowSpeedRatio(state, maxSpeed) {
  if (!Number.isFinite(maxSpeed) || maxSpeed <= 0 || !state?.velocity) {
    return 0
  }
  return clamp01(state.velocity.length() / maxSpeed)
}

export function resolveAirflowOpacity(config, { speedRatio = 0, thrustInput = 0, elapsed = 0 } = {}) {
  const pulse = 1 + Math.sin(elapsed * 10) * config.pulseStrength
  const speedBoost = clamp01(speedRatio) * config.speedOpacity
  const thrustBoost = Math.max(0, thrustInput) * config.accelerationBoost * clamp01(speedRatio)
  return clamp01((config.opacity + speedBoost + thrustBoost) * pulse)
}

export function canConnectAirflowSamples(tangentA, tangentB, breakAngleDeg) {
  const dot = THREE.MathUtils.clamp(tangentA.dot(tangentB), -1, 1)
  return Math.acos(dot) <= THREE.MathUtils.degToRad(breakAngleDeg)
}

export function computeAirflowHalfWidth(config, { age = 0, speedRatio = 0 } = {}) {
  const life = clamp01(age / config.sampleLife)
  const bell = Math.pow(Math.max(0, Math.sin(Math.PI * life)), config.bellPower)
  const widthScale = THREE.MathUtils.lerp(config.tipWidthRatio, 1, bell)
  return config.width * widthScale * (0.72 + clamp01(speedRatio) * 0.28) * 0.5
}
```

- [ ] **Step 4: Run focused helper tests**

Run:

```bash
npm test -- test/wingAirflowVFX.test.js
```

Expected: all helper tests PASS.

- [ ] **Step 5: Commit helper layer**

```bash
git add src/world/player/wingAirflowVFX.js test/wingAirflowVFX.test.js
git commit -m "feat: add wing airflow config helpers"
```

## Task 2: Ring Buffer Side and Ribbon Geometry

**Files:**
- Modify: `src/world/player/wingAirflowVFX.js`
- Modify: `test/wingAirflowVFX.test.js`

- [ ] **Step 1: Add failing side-system tests**

Append these tests to `test/wingAirflowVFX.test.js`:

```js
import { WingAirflowSide } from '../src/world/player/wingAirflowVFX.js'

test('wing airflow side does not emit below speed threshold', () => {
  const config = normalizeWingAirflowConfig({ minSpeedRatio: 0.2, emitInterval: 0.01 })
  const side = new WingAirflowSide({ name: 'left', config })

  side.maybeEmit({
    position: new THREE.Vector3(0, 0, 0),
    tangent: new THREE.Vector3(1, 0, 0),
    speedRatio: 0.1,
    delta: 0.1
  })

  assert.equal(side.count, 0)
})

test('wing airflow side emits only after interval and distance gates', () => {
  const config = normalizeWingAirflowConfig({
    emitInterval: 0.05,
    minEmitDistance: 0.1,
    minSpeedRatio: 0.01
  })
  const side = new WingAirflowSide({ name: 'left', config })

  side.maybeEmit({
    position: new THREE.Vector3(0, 0, 0),
    tangent: new THREE.Vector3(1, 0, 0),
    speedRatio: 0.5,
    delta: 0.05
  })
  side.maybeEmit({
    position: new THREE.Vector3(0.02, 0, 0),
    tangent: new THREE.Vector3(1, 0, 0),
    speedRatio: 0.5,
    delta: 0.05
  })
  side.maybeEmit({
    position: new THREE.Vector3(0.2, 0, 0),
    tangent: new THREE.Vector3(1, 0, 0),
    speedRatio: 0.5,
    delta: 0.05
  })

  assert.equal(side.count, 2)
})

test('wing airflow side expires samples by lifetime', () => {
  const config = normalizeWingAirflowConfig({ sampleLife: 0.1, minSpeedRatio: 0.01 })
  const side = new WingAirflowSide({ name: 'left', config })

  side.emit(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), 0.5)
  side.advanceAges(0.2)

  assert.equal(side.count, 0)
})

test('wing airflow side clamps visible count to max samples', () => {
  const config = normalizeWingAirflowConfig({
    capacity: 5,
    maxSamples: 3,
    emitInterval: 0,
    minEmitDistance: 0,
    minSpeedRatio: 0.01
  })
  const side = new WingAirflowSide({ name: 'left', config })

  for (let i = 0; i < 5; i++) {
    side.emit(new THREE.Vector3(i, 0, 0), new THREE.Vector3(1, 0, 0), 0.5)
    side.clampCount()
  }

  assert.equal(side.count, 3)
})
```

- [ ] **Step 2: Run side tests and verify failure**

Run:

```bash
npm test -- test/wingAirflowVFX.test.js
```

Expected: FAIL because `WingAirflowSide` is not exported.

- [ ] **Step 3: Implement `WingAirflowSide`**

Append this class to `src/world/player/wingAirflowVFX.js`:

```js
export class WingAirflowSide {
  constructor({ name, config }) {
    this.name = name
    this.config = config
    this.capacity = config.capacity
    this.head = 0
    this.count = 0
    this.timeSinceEmit = config.emitInterval
    this.hasLastEmit = false
    this.lastEmit = new THREE.Vector3()

    this.position = new Float32Array(this.capacity * 3)
    this.tangent = new Float32Array(this.capacity * 3)
    this.age = new Float32Array(this.capacity)
    this.speed = new Float32Array(this.capacity)
  }

  clear() {
    this.head = 0
    this.count = 0
    this.timeSinceEmit = this.config.emitInterval
    this.hasLastEmit = false
  }

  logicalIndex(offset) {
    return (this.head + offset) % this.capacity
  }

  tailIndex() {
    return this.logicalIndex(this.count - 1)
  }

  clampCount() {
    if (this.count > this.config.maxSamples) {
      this.count = this.config.maxSamples
    }
  }

  advanceAges(delta) {
    this.timeSinceEmit += Math.max(0, delta)

    for (let i = 0; i < this.count; i++) {
      this.age[this.logicalIndex(i)] += Math.max(0, delta)
    }

    while (this.count > 0 && this.age[this.tailIndex()] > this.config.sampleLife) {
      this.count--
    }
  }

  emit(position, tangent, speedRatio) {
    this.head = (this.head - 1 + this.capacity) % this.capacity
    const offset = this.head * 3
    const normalizedTangent = tangent.clone()
    if (normalizedTangent.lengthSq() <= 1e-7) {
      normalizedTangent.set(1, 0, 0)
    } else {
      normalizedTangent.normalize()
    }

    this.position[offset] = position.x
    this.position[offset + 1] = position.y
    this.position[offset + 2] = position.z
    this.tangent[offset] = normalizedTangent.x
    this.tangent[offset + 1] = normalizedTangent.y
    this.tangent[offset + 2] = normalizedTangent.z
    this.age[this.head] = 0
    this.speed[this.head] = clamp01(speedRatio)
    this.lastEmit.copy(position)
    this.hasLastEmit = true

    if (this.count < this.capacity) {
      this.count++
    }
    this.clampCount()
  }

  maybeEmit({ position, tangent, speedRatio, delta }) {
    this.advanceAges(delta)

    if (speedRatio <= this.config.minSpeedRatio) {
      return false
    }

    const movedEnough = !this.hasLastEmit
      || position.distanceToSquared(this.lastEmit) >= this.config.minEmitDistance * this.config.minEmitDistance
    const timeEnough = this.timeSinceEmit >= this.config.emitInterval

    if (!movedEnough || !timeEnough) {
      return false
    }

    this.emit(position, tangent, speedRatio)
    this.timeSinceEmit = 0
    return true
  }

  getPosition(index, target) {
    const offset = index * 3
    return target.set(this.position[offset], this.position[offset + 1], this.position[offset + 2])
  }

  getTangent(index, target) {
    const offset = index * 3
    return target.set(this.tangent[offset], this.tangent[offset + 1], this.tangent[offset + 2])
  }
}
```

- [ ] **Step 4: Run focused side tests**

Run:

```bash
npm test -- test/wingAirflowVFX.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit side-system behavior**

```bash
git add src/world/player/wingAirflowVFX.js test/wingAirflowVFX.test.js
git commit -m "feat: add wing airflow sample buffers"
```

## Task 3: Runtime VFX Object

**Files:**
- Modify: `src/world/player/wingAirflowVFX.js`
- Modify: `test/wingAirflowVFX.test.js`

- [ ] **Step 1: Add failing runtime VFX tests**

Append these tests to `test/wingAirflowVFX.test.js`:

```js
import { createWingAirflowVFX } from '../src/world/player/wingAirflowVFX.js'

test('createWingAirflowVFX adds a root and disposes owned objects', () => {
  const parent = new THREE.Group()
  const vfx = createWingAirflowVFX(parent, { enabled: true, capacity: 4, maxSamples: 4 })

  assert.equal(parent.children.includes(vfx.root), true)
  assert.equal(vfx.root.children.length >= 2, true)

  vfx.dispose()

  assert.equal(parent.children.includes(vfx.root), false)
  assert.equal(vfx.disposed, true)
})

test('createWingAirflowVFX emits samples from two anchors when moving', () => {
  const parent = new THREE.Group()
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(0, 5, 5)
  parent.position.set(10, 3, 20)
  const vfx = createWingAirflowVFX(parent, {
    enabled: true,
    minSpeedRatio: 0.01,
    emitInterval: 0,
    minEmitDistance: 0
  })

  vfx.update({
    delta: 0.1,
    elapsed: 0,
    camera,
    state: {
      velocity: new THREE.Vector3(4, 0, 0)
    },
    maxSpeed: 8,
    input: { thrustInput: 1 }
  })

  assert.equal(vfx.left.count, 1)
  assert.equal(vfx.right.count, 1)
  assert.equal(vfx.leftMesh.visible, false)
})
```

The final assertion remains `false` because one sample per side is not enough to draw a connected quad.

- [ ] **Step 2: Run runtime tests and verify failure**

Run:

```bash
npm test -- test/wingAirflowVFX.test.js
```

Expected: FAIL because `createWingAirflowVFX` is not implemented.

- [ ] **Step 3: Add texture, geometry, and mesh construction helpers**

Add these helpers before `createWingAirflowVFX` in `src/world/player/wingAirflowVFX.js`:

```js
function createAirflowTexture() {
  if (typeof document === 'undefined') {
    return null
  }

  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 256, 256)

  const length = ctx.createLinearGradient(0, 0, 0, 256)
  length.addColorStop(0, 'rgba(255,255,255,0)')
  length.addColorStop(0.28, 'rgba(255,255,255,0.42)')
  length.addColorStop(0.50, 'rgba(255,255,255,1)')
  length.addColorStop(0.72, 'rgba(255,255,255,0.42)')
  length.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = length
  ctx.fillRect(0, 0, 256, 256)

  ctx.globalCompositeOperation = 'multiply'
  const side = ctx.createLinearGradient(0, 0, 256, 0)
  side.addColorStop(0, 'rgba(255,255,255,0)')
  side.addColorStop(0.22, 'rgba(255,255,255,0.36)')
  side.addColorStop(0.50, 'rgba(255,255,255,1)')
  side.addColorStop(0.78, 'rgba(255,255,255,0.36)')
  side.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = side
  ctx.fillRect(0, 0, 256, 256)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function createRibbonMesh(name, config, texture) {
  const maxQuads = config.capacity - 1
  const positions = new Float32Array(maxQuads * 4 * 3)
  const uvs = new Float32Array(maxQuads * 4 * 2)
  const indices = new Uint16Array(maxQuads * 6)

  for (let i = 0; i < maxQuads; i++) {
    const vertex = i * 4
    const index = i * 6
    indices[index] = vertex
    indices[index + 1] = vertex + 2
    indices[index + 2] = vertex + 1
    indices[index + 3] = vertex + 2
    indices[index + 4] = vertex + 3
    indices[index + 5] = vertex + 1
  }

  const geometry = new THREE.BufferGeometry()
  const positionAttribute = new THREE.BufferAttribute(positions, 3)
  const uvAttribute = new THREE.BufferAttribute(uvs, 2)
  positionAttribute.setUsage(THREE.DynamicDrawUsage)
  uvAttribute.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('position', positionAttribute)
  geometry.setAttribute('uv', uvAttribute)
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.setDrawRange(0, 0)

  const material = new THREE.MeshBasicMaterial({
    color: config.color,
    map: texture,
    transparent: true,
    opacity: config.opacity,
    depthWrite: false,
    blending: config.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  mesh.frustumCulled = false
  mesh.renderOrder = 10
  mesh.visible = false

  return { mesh, positions, uvs, positionAttribute, uvAttribute }
}
```

- [ ] **Step 4: Add ribbon rebuild and VFX factory**

Add this implementation:

```js
const tmpP0 = new THREE.Vector3()
const tmpP1 = new THREE.Vector3()
const tmpT0 = new THREE.Vector3()
const tmpT1 = new THREE.Vector3()
const tmpSegment = new THREE.Vector3()
const tmpToCamera = new THREE.Vector3()
const tmpSide = new THREE.Vector3()
const tmpVelocityTangent = new THREE.Vector3()
const tmpAnchorLeft = new THREE.Vector3()
const tmpAnchorRight = new THREE.Vector3()
const tmpForward = new THREE.Vector3(1, 0, 0)
const tmpQuaternion = new THREE.Quaternion()

function writeVec3(array, offset, value) {
  array[offset] = value.x
  array[offset + 1] = value.y
  array[offset + 2] = value.z
}

function writeRibbonQuad(side, runtime, quadIndex, idx0, idx1, camera, config) {
  side.getPosition(idx0, tmpP0)
  side.getPosition(idx1, tmpP1)
  side.getTangent(idx0, tmpT0)
  side.getTangent(idx1, tmpT1)

  if (!canConnectAirflowSamples(tmpT0, tmpT1, config.breakAngleDeg)) {
    return false
  }

  tmpSegment.subVectors(tmpP1, tmpP0)
  if (tmpSegment.lengthSq() <= 1e-7) {
    tmpSegment.copy(tmpT0)
  } else {
    tmpSegment.normalize()
  }

  tmpToCamera.subVectors(camera.position, tmpP0)
  if (tmpToCamera.lengthSq() <= 1e-7) {
    tmpToCamera.set(0, 1, 0)
  } else {
    tmpToCamera.normalize()
  }

  tmpSide.crossVectors(tmpSegment, tmpToCamera)
  if (tmpSide.lengthSq() <= 1e-7) {
    tmpSide.set(0, 1, 0)
  } else {
    tmpSide.normalize()
  }

  const hw0 = computeAirflowHalfWidth(config, {
    age: side.age[idx0],
    speedRatio: side.speed[idx0]
  })
  const hw1 = computeAirflowHalfWidth(config, {
    age: side.age[idx1],
    speedRatio: side.speed[idx1]
  })
  const positionOffset = quadIndex * 12
  const uvOffset = quadIndex * 8

  writeVec3(runtime.positions, positionOffset, tmpP0.clone().addScaledVector(tmpSide, hw0).addScalar(0))
  runtime.positions[positionOffset + 1] += config.verticalOffset
  writeVec3(runtime.positions, positionOffset + 3, tmpP0.clone().addScaledVector(tmpSide, -hw0))
  runtime.positions[positionOffset + 4] += config.verticalOffset
  writeVec3(runtime.positions, positionOffset + 6, tmpP1.clone().addScaledVector(tmpSide, hw1))
  runtime.positions[positionOffset + 7] += config.verticalOffset
  writeVec3(runtime.positions, positionOffset + 9, tmpP1.clone().addScaledVector(tmpSide, -hw1))
  runtime.positions[positionOffset + 10] += config.verticalOffset

  const life0 = clamp01(side.age[idx0] / config.sampleLife)
  const life1 = clamp01(side.age[idx1] / config.sampleLife)
  runtime.uvs[uvOffset] = 0
  runtime.uvs[uvOffset + 1] = life0
  runtime.uvs[uvOffset + 2] = 1
  runtime.uvs[uvOffset + 3] = life0
  runtime.uvs[uvOffset + 4] = 0
  runtime.uvs[uvOffset + 5] = life1
  runtime.uvs[uvOffset + 6] = 1
  runtime.uvs[uvOffset + 7] = life1

  return true
}

function rebuildRibbon(side, runtime, camera, config) {
  let quadCount = 0
  const maxSegments = Math.min(side.count - 1, config.maxSamples - 1, config.capacity - 1)

  if (camera && maxSegments > 0) {
    for (let i = 0; i < maxSegments; i++) {
      const idx0 = side.logicalIndex(i)
      const idx1 = side.logicalIndex(i + 1)
      if (writeRibbonQuad(side, runtime, quadCount, idx0, idx1, camera, config)) {
        quadCount++
      }
    }
  }

  runtime.positionAttribute.needsUpdate = true
  runtime.uvAttribute.needsUpdate = true
  runtime.mesh.geometry.setDrawRange(0, quadCount * 6)
  runtime.mesh.visible = quadCount > 0
  return quadCount
}

export function createWingAirflowVFX(parent, rawConfig = {}) {
  const config = normalizeWingAirflowConfig(rawConfig)
  const root = new THREE.Group()
  root.name = 'WingAirflowVFX'
  root.visible = config.enabled
  parent.add(root)

  const texture = createAirflowTexture()
  const left = new WingAirflowSide({ name: 'left', config })
  const right = new WingAirflowSide({ name: 'right', config })
  const leftRuntime = createRibbonMesh('left_wing_airflow', config, texture)
  const rightRuntime = createRibbonMesh('right_wing_airflow', config, texture)
  root.add(leftRuntime.mesh, rightRuntime.mesh)

  function updateAnchors() {
    const x = config.anchors.wingHalfWidth + config.anchors.outwardOffset
    tmpAnchorLeft.set(-x, config.anchors.upOffset, config.anchors.backOffset).applyMatrix4(parent.matrixWorld)
    tmpAnchorRight.set(x, config.anchors.upOffset, config.anchors.backOffset).applyMatrix4(parent.matrixWorld)
  }

  function resolveTangent(state) {
    if (state?.velocity?.lengthSq?.() > 1e-7) {
      return tmpVelocityTangent.copy(state.velocity).normalize()
    }
    return tmpVelocityTangent.copy(tmpForward).applyQuaternion(parent.getWorldQuaternion(tmpQuaternion)).normalize()
  }

  function update({ delta = 0, elapsed = 0, camera = null, state = null, maxSpeed = 1, input = {} } = {}) {
    if (!config.enabled) {
      root.visible = false
      return { samples: 0, quads: 0 }
    }

    root.visible = true
    parent.updateWorldMatrix(true, false)
    updateAnchors()

    const speedRatio = computeAirflowSpeedRatio(state, maxSpeed)
    const tangent = resolveTangent(state)

    left.maybeEmit({ position: tmpAnchorLeft, tangent, speedRatio, delta })
    right.maybeEmit({ position: tmpAnchorRight, tangent, speedRatio, delta })

    const opacity = resolveAirflowOpacity(config, {
      speedRatio,
      thrustInput: input.thrustInput ?? 0,
      elapsed
    })

    for (const runtime of [leftRuntime, rightRuntime]) {
      runtime.mesh.material.color.set(config.color)
      runtime.mesh.material.opacity = opacity
      runtime.mesh.material.blending = config.additive ? THREE.AdditiveBlending : THREE.NormalBlending
      runtime.mesh.material.needsUpdate = true
    }

    const quads = rebuildRibbon(left, leftRuntime, camera, config)
      + rebuildRibbon(right, rightRuntime, camera, config)

    return {
      samples: left.count + right.count,
      quads
    }
  }

  function clear() {
    left.clear()
    right.clear()
    for (const runtime of [leftRuntime, rightRuntime]) {
      runtime.mesh.geometry.setDrawRange(0, 0)
      runtime.mesh.visible = false
    }
  }

  function setVisible(visible) {
    config.enabled = visible
    root.visible = visible
    if (!visible) {
      clear()
    }
  }

  function dispose() {
    parent.remove(root)
    for (const runtime of [leftRuntime, rightRuntime]) {
      runtime.mesh.geometry.dispose()
      runtime.mesh.material.dispose()
    }
    texture?.dispose?.()
    root.clear()
    api.disposed = true
  }

  const api = {
    root,
    config,
    left,
    right,
    leftMesh: leftRuntime.mesh,
    rightMesh: rightRuntime.mesh,
    update,
    clear,
    setVisible,
    dispose,
    disposed: false
  }

  return api
}
```

- [ ] **Step 5: Remove avoidable temporary allocations**

Replace the four `tmpP0.clone()` calls inside `writeRibbonQuad()` with direct reusable temporary vectors:

```js
const tmpV0 = new THREE.Vector3()
const tmpV1 = new THREE.Vector3()
const tmpV2 = new THREE.Vector3()
const tmpV3 = new THREE.Vector3()
```

Then write:

```js
writeVec3(runtime.positions, positionOffset, tmpV0.copy(tmpP0).addScaledVector(tmpSide, hw0))
runtime.positions[positionOffset + 1] += config.verticalOffset
writeVec3(runtime.positions, positionOffset + 3, tmpV1.copy(tmpP0).addScaledVector(tmpSide, -hw0))
runtime.positions[positionOffset + 4] += config.verticalOffset
writeVec3(runtime.positions, positionOffset + 6, tmpV2.copy(tmpP1).addScaledVector(tmpSide, hw1))
runtime.positions[positionOffset + 7] += config.verticalOffset
writeVec3(runtime.positions, positionOffset + 9, tmpV3.copy(tmpP1).addScaledVector(tmpSide, -hw1))
runtime.positions[positionOffset + 10] += config.verticalOffset
```

Expected: normal runtime updates do not allocate vectors per ribbon segment.

- [ ] **Step 6: Run runtime VFX tests**

Run:

```bash
npm test -- test/wingAirflowVFX.test.js
```

Expected: all tests PASS.

- [ ] **Step 7: Commit runtime VFX**

```bash
git add src/world/player/wingAirflowVFX.js test/wingAirflowVFX.test.js
git commit -m "feat: render wing airflow ribbons"
```

## Task 4: PlayerAircraft Integration and Defaults

**Files:**
- Modify: `src/world/player/PlayerAircraft.js`
- Modify: `src/world/WorldConfig.js`
- Modify: `test/playerAircraftConfig.test.js`
- Modify: `test/playerAircraftSystem.test.js`

- [ ] **Step 1: Add failing config test**

Append to `test/playerAircraftConfig.test.js`:

```js
test('player aircraft wing airflow config has expected defaults', () => {
  const airflow = worldConfig.player.aircraft.wingAirflow

  assert.equal(airflow.enabled, true)
  assert.equal(airflow.anchors.wingHalfWidth > 0, true)
  assert.equal(airflow.anchors.outwardOffset >= 0, true)
  assert.equal(airflow.sampleLife > 0, true)
  assert.equal(airflow.emitInterval > 0, true)
  assert.equal(airflow.minEmitDistance >= 0, true)
  assert.equal(airflow.capacity >= airflow.maxSamples, true)
  assert.equal(airflow.maxSamples > 1, true)
  assert.equal(airflow.minSpeedRatio >= 0, true)
  assert.equal(airflow.breakAngleDeg > 0, true)
  assert.equal(airflow.width > 0, true)
  assert.equal(airflow.opacity > 0, true)
  assert.equal(airflow.color, '#f7fbff')
})
```

- [ ] **Step 2: Add failing PlayerAircraft ownership test**

Append to `test/playerAircraftSystem.test.js`:

```js
test('creates and disposes wing airflow when configured', () => {
  const player = new PlayerAircraft(createExperience({
    config: {
      wingAirflow: {
        enabled: true,
        capacity: 4,
        maxSamples: 4
      }
    }
  }), { inputTarget: null })

  assert.equal(player.wingAirflow?.root?.name, 'WingAirflowVFX')
  assert.equal(player.group.children.includes(player.wingAirflow.root), true)

  player.dispose()

  assert.equal(player.wingAirflow, null)
})
```

- [ ] **Step 3: Run ownership/config tests and verify failure**

Run:

```bash
npm test -- test/playerAircraftConfig.test.js test/playerAircraftSystem.test.js
```

Expected: FAIL because `wingAirflow` defaults and `PlayerAircraft.wingAirflow` do not exist.

- [ ] **Step 4: Add world config defaults**

In `src/world/WorldConfig.js`, inside `player.aircraft` after `engineFlame`, add:

```js
      wingAirflow: {
        enabled: true,
        anchors: {
          wingHalfWidth: 0.78,
          outwardOffset: 0.12,
          backOffset: -0.10,
          upOffset: 0.03
        },
        sampleLife: 0.56,
        emitInterval: 0.034,
        minEmitDistance: 0.045,
        capacity: 32,
        maxSamples: 18,
        minSpeedRatio: 0.04,
        breakAngleDeg: 68,
        width: 0.09,
        tipWidthRatio: 0,
        bellPower: 1.35,
        verticalOffset: 0.045,
        opacity: 0.54,
        speedOpacity: 0.48,
        accelerationBoost: 0.35,
        pulseStrength: 0.01,
        color: '#f7fbff',
        additive: false,
        showAnchors: false
      }
```

- [ ] **Step 5: Import and initialize airflow in PlayerAircraft**

In `src/world/player/PlayerAircraft.js`, add to the engine flame import area:

```js
import {
  createWingAirflowVFX,
  normalizeWingAirflowConfig
} from './wingAirflowVFX.js'
```

In the constructor after `this.flameConfig = normalizeEngineFlameConfig(playerConfig.engineFlame)`, add:

```js
    this.wingAirflowConfig = normalizeWingAirflowConfig(playerConfig.wingAirflow)
    this.wingAirflow = null
```

In `_buildModel()`, after `this._attachEngineFlames()`, add:

```js
    this._attachWingAirflow()
```

Add this method near `_attachEngineFlames()`:

```js
  _attachWingAirflow() {
    if (!this.wingAirflowConfig.enabled) {
      return
    }

    this.wingAirflow = createWingAirflowVFX(this.group, this.wingAirflowConfig)
  }
```

- [ ] **Step 6: Update airflow each frame**

In `PlayerAircraft.update()`, keep the resolved input in scope and call airflow after `_applyTransform()`:

```js
    this._applyTransform()
    this._updateWingAirflow(input, delta)
    this._updateEngineFlames(this.experience.time.getElapsed())
```

Add:

```js
  _updateWingAirflow(input, delta) {
    if (!this.wingAirflow) {
      return
    }

    this.wingAirflow.update({
      delta,
      elapsed: this.experience.time.getElapsed(),
      camera: this.experience.worldCamera?.instance,
      state: this.state,
      maxSpeed: this.motionConfig.maxSpeed,
      input
    })
  }
```

- [ ] **Step 7: Dispose airflow**

In `dispose()`, after engine flame disposal, add:

```js
    this.wingAirflow?.dispose()
    this.wingAirflow = null
```

- [ ] **Step 8: Run integration tests**

Run:

```bash
npm test -- test/wingAirflowVFX.test.js test/playerAircraftConfig.test.js test/playerAircraftSystem.test.js
```

Expected: all targeted tests PASS.

- [ ] **Step 9: Commit aircraft integration**

```bash
git add src/world/player/PlayerAircraft.js src/world/WorldConfig.js test/playerAircraftConfig.test.js test/playerAircraftSystem.test.js
git commit -m "feat: attach wing airflow to player aircraft"
```

## Task 5: Debug Controls and Final Verification

**Files:**
- Modify: `src/world/player/PlayerAircraft.js`
- Verify: `src/world/player/wingAirflowVFX.js`
- Verify: `src/world/WorldConfig.js`
- Verify: `test/wingAirflowVFX.test.js`
- Verify: `test/playerAircraftConfig.test.js`
- Verify: `test/playerAircraftSystem.test.js`

- [ ] **Step 1: Add debug folder bindings**

In `PlayerAircraft.debuggerInit(debug)`, after the `Engine Flame` folder block, add:

```js
    const airflowFolder = folder.addFolder({ title: 'Wing Airflow', expanded: false })
    airflowFolder.addBinding(this.wingAirflowConfig, 'enabled', { label: 'Enabled' })
      .on('change', ({ value }) => {
        this.wingAirflow?.setVisible(value)
      })
    airflowFolder.addBinding(this.wingAirflowConfig.anchors, 'outwardOffset', { min: 0, max: 0.8, step: 0.01, label: 'Outward' })
    airflowFolder.addBinding(this.wingAirflowConfig.anchors, 'backOffset', { min: -0.4, max: 0.2, step: 0.01, label: 'Back' })
    airflowFolder.addBinding(this.wingAirflowConfig.anchors, 'upOffset', { min: -0.1, max: 0.4, step: 0.01, label: 'Up' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'sampleLife', { min: 0.16, max: 1.4, step: 0.02, label: 'Life' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'emitInterval', { min: 0.012, max: 0.12, step: 0.002, label: 'Interval' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'minEmitDistance', { min: 0, max: 0.18, step: 0.005, label: 'Min Dist' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'maxSamples', { min: 4, max: this.wingAirflowConfig.capacity, step: 1, label: 'Samples' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'breakAngleDeg', { min: 20, max: 180, step: 1, label: 'Break Angle' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'width', { min: 0.03, max: 0.28, step: 0.005, label: 'Width' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'opacity', { min: 0.02, max: 1, step: 0.01, label: 'Opacity' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'speedOpacity', { min: 0, max: 1, step: 0.01, label: 'Speed Opacity' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'accelerationBoost', { min: 0, max: 1, step: 0.01, label: 'Accel Boost' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'color', { label: 'Color' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'additive', { label: 'Additive' })
```

- [ ] **Step 2: Run targeted tests**

Run:

```bash
npm test -- test/wingAirflowVFX.test.js test/playerAircraftConfig.test.js test/playerAircraftSystem.test.js
```

Expected: all targeted tests PASS.

- [ ] **Step 3: Run full test suite**

Run:

```bash
npm test
```

Expected: all tests PASS. If the known Windows `EPERM: operation not permitted, lstat 'C:\Users\f1686533'` environment issue appears, rerun once and report it separately from code failures.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: Vite build completes successfully, with only the known large-chunk warning if present.

- [ ] **Step 5: Inspect final scope**

Run:

```bash
git status --short
git diff --check
git diff -- src/world/player/wingAirflowVFX.js src/world/player/PlayerAircraft.js src/world/WorldConfig.js test/wingAirflowVFX.test.js test/playerAircraftConfig.test.js test/playerAircraftSystem.test.js
```

Expected:

- no whitespace errors
- no unrelated edits
- `public/img/box_image.png` and `public/img/wait_mode.png`, if still present, remain untracked and unstaged

- [ ] **Step 6: Commit debug and verification corrections**

If Task 5 introduced only debug bindings and verification fixes, stage only intended files:

```bash
git add src/world/player/PlayerAircraft.js src/world/player/wingAirflowVFX.js src/world/WorldConfig.js test/wingAirflowVFX.test.js test/playerAircraftConfig.test.js test/playerAircraftSystem.test.js
git commit -m "feat: expose wing airflow tuning"
```

If no files changed after Task 4, skip this commit and report that final verification passed without additional changes.

## Manual Validation Checklist

After implementation, start the dev server:

```bash
npm run dev
```

Expected: Vite prints a local URL, usually `http://localhost:5173/` or the next open port.

Manual checks:

- Fly forward with `W`; airflow appears from both wings and strengthens during acceleration.
- Release `W` while still moving; airflow remains visible briefly because speed remains non-zero.
- Stop or slow down; old samples fade out instead of hard-cutting.
- Turn sharply with `A` or `D`; the trail does not form giant stretched triangles.
- Open the debug panel and adjust Wing Airflow `Width`, `Opacity`, `Outward`, and `Back`; changes apply live without world regeneration.
- Existing engine flames and speed lines still work.
- Chunk streaming and prefab rendering still work while flying.

## Final Report Requirements

When implementation is complete, report:

- Commands run and exact pass/fail status.
- Whether `npm test` passed fully or had unrelated existing noise.
- Whether `npm run build` passed.
- Any manual validation that was not performed.
- Any untracked files left untouched.
