import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import {
  DEFAULT_WING_AIRFLOW_CONFIG,
  normalizeWingAirflowConfig,
  computeAirflowSpeedRatio,
  resolveAirflowOpacity,
  canConnectAirflowSamples,
  computeAirflowHalfWidth,
  WingAirflowSide,
  createWingAirflowVFX
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

test('normalizes invalid wing airflow ratios to defaults', () => {
  const config = normalizeWingAirflowConfig({
    minSpeedRatio: 'bad',
    tipWidthRatio: Number.NaN,
    opacity: 'bad'
  })

  assert.equal(config.minSpeedRatio, DEFAULT_WING_AIRFLOW_CONFIG.minSpeedRatio)
  assert.equal(config.tipWidthRatio, DEFAULT_WING_AIRFLOW_CONFIG.tipWidthRatio)
  assert.equal(config.opacity, DEFAULT_WING_AIRFLOW_CONFIG.opacity)
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
  assert.equal(side.count, 1)

  side.maybeEmit({
    position: new THREE.Vector3(0.2, 0, 0),
    tangent: new THREE.Vector3(1, 0, 0),
    speedRatio: 0.5,
    delta: 0.01
  })
  assert.equal(side.count, 1)

  side.maybeEmit({
    position: new THREE.Vector3(0.2, 0, 0),
    tangent: new THREE.Vector3(1, 0, 0),
    speedRatio: 0.5,
    delta: 0.04
  })
  assert.equal(side.count, 2)

  side.maybeEmit({
    position: new THREE.Vector3(0.22, 0, 0),
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

test('wing airflow side reads clamped visible samples from physical slots newest first', () => {
  const config = normalizeWingAirflowConfig({
    capacity: 5,
    maxSamples: 3,
    emitInterval: 0,
    minEmitDistance: 0,
    minSpeedRatio: 0.01
  })
  const side = new WingAirflowSide({ name: 'left', config })
  const target = new THREE.Vector3()

  for (let i = 0; i < 5; i++) {
    side.emit(new THREE.Vector3(i, i + 10, i + 20), new THREE.Vector3(i + 1, 0, 0), 0.5)
  }

  const visibleX = []
  for (let i = 0; i < side.count; i++) {
    visibleX.push(side.getPosition(side.logicalIndex(i), target).x)
  }

  assert.deepEqual(visibleX, [4, 3, 2])
  assert.deepEqual(side.getTangent(side.logicalIndex(0), target).toArray(), [1, 0, 0])
})

test('wing airflow side accessors do not remap physical sample slots', () => {
  const config = normalizeWingAirflowConfig({
    capacity: 5,
    maxSamples: 3,
    emitInterval: 0,
    minEmitDistance: 0,
    minSpeedRatio: 0.01
  })
  const side = new WingAirflowSide({ name: 'left', config })
  const position = new THREE.Vector3()
  const tangent = new THREE.Vector3()

  for (let i = 0; i < 4; i++) {
    side.emit(new THREE.Vector3(i, i + 10, i + 20), new THREE.Vector3(i + 1, 0, i), 0.5)
  }

  const visibleX = []
  for (let i = 0; i < side.count; i++) {
    visibleX.push(side.getPosition(side.logicalIndex(i), position).x)
  }

  assert.deepEqual(visibleX, [3, 2, 1])
  assert.deepEqual(
    side.getTangent(side.logicalIndex(0), tangent).toArray().map((value) => Number(value.toFixed(6))),
    [0.8, 0, 0.6]
  )
})

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

test('createWingAirflowVFX clamps live samples after maxSamples is lowered', () => {
  const parent = new THREE.Group()
  const camera = new THREE.PerspectiveCamera()
  const vfx = createWingAirflowVFX(parent, {
    enabled: true,
    capacity: 8,
    maxSamples: 6,
    minSpeedRatio: 0.01,
    emitInterval: 0,
    minEmitDistance: 0
  })

  for (let i = 0; i < 6; i++) {
    parent.position.x = i
    vfx.update({
      delta: 0.1,
      elapsed: i,
      camera,
      state: { velocity: new THREE.Vector3(4, 0, 0) },
      maxSpeed: 8,
      input: { thrustInput: 1 }
    })
  }

  assert.equal(vfx.left.count, 6)

  vfx.config.maxSamples = 2
  vfx.update({
    delta: 0.1,
    elapsed: 7,
    camera,
    state: { velocity: new THREE.Vector3(0, 0, 0) },
    maxSpeed: 8,
    input: { thrustInput: 0 }
  })

  assert.equal(vfx.left.count, 2)
  assert.equal(vfx.right.count, 2)
})

test('createWingAirflowVFX shows anchor markers when enabled', () => {
  const parent = new THREE.Group()
  const camera = new THREE.PerspectiveCamera()
  const vfx = createWingAirflowVFX(parent, {
    enabled: true,
    showAnchors: true,
    minSpeedRatio: 0.01,
    emitInterval: 0,
    minEmitDistance: 0
  })

  vfx.update({
    delta: 0.1,
    elapsed: 0,
    camera,
    state: { velocity: new THREE.Vector3(4, 0, 0) },
    maxSpeed: 8,
    input: { thrustInput: 1 }
  })

  assert.equal(vfx.leftAnchorMarker.visible, true)
  assert.equal(vfx.rightAnchorMarker.visible, true)

  vfx.config.showAnchors = false
  vfx.update({
    delta: 0.1,
    elapsed: 0.1,
    camera,
    state: { velocity: new THREE.Vector3(4, 0, 0) },
    maxSpeed: 8,
    input: { thrustInput: 1 }
  })

  assert.equal(vfx.leftAnchorMarker.visible, false)
  assert.equal(vfx.rightAnchorMarker.visible, false)
})

test('createWingAirflowVFX does not recompile materials when blending is unchanged', () => {
  const parent = new THREE.Group()
  const camera = new THREE.PerspectiveCamera()
  const vfx = createWingAirflowVFX(parent, {
    enabled: true,
    additive: false,
    minSpeedRatio: 0.01,
    emitInterval: 0,
    minEmitDistance: 0
  })

  const updateOptions = {
    delta: 0.1,
    elapsed: 0,
    camera,
    state: {
      velocity: new THREE.Vector3(4, 0, 0)
    },
    maxSpeed: 8,
    input: { thrustInput: 1 }
  }

  vfx.update(updateOptions)
  const leftVersion = vfx.leftMesh.material.version
  const rightVersion = vfx.rightMesh.material.version

  vfx.update(updateOptions)

  assert.equal(vfx.leftMesh.material.version, leftVersion)
  assert.equal(vfx.rightMesh.material.version, rightVersion)
})
