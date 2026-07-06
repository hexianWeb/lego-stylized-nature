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
  WingAirflowSide
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
