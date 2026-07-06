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

function clampNonNegative(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback
}

function clamp01(value) {
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1)
}

function clampedNumber(value, fallback) {
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : fallback, 0, 1)
}

function roundStable(value) {
  return Math.round(value * 1e12) / 1e12
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
      outwardOffset: clampNonNegative(anchors.outwardOffset, defaults.anchors.outwardOffset),
      backOffset: Number.isFinite(anchors.backOffset) ? anchors.backOffset : defaults.anchors.backOffset,
      upOffset: Number.isFinite(anchors.upOffset) ? anchors.upOffset : defaults.anchors.upOffset
    },
    sampleLife: positiveNumber(config.sampleLife, defaults.sampleLife),
    emitInterval: positiveNumber(config.emitInterval, defaults.emitInterval),
    minEmitDistance: nonNegativeNumber(config.minEmitDistance, defaults.minEmitDistance),
    capacity,
    maxSamples: Math.min(maxSamples, capacity),
    minSpeedRatio: clampedNumber(config.minSpeedRatio, defaults.minSpeedRatio),
    breakAngleDeg: positiveNumber(config.breakAngleDeg, defaults.breakAngleDeg),
    width: positiveNumber(config.width, defaults.width),
    tipWidthRatio: clampedNumber(config.tipWidthRatio, defaults.tipWidthRatio),
    bellPower: positiveNumber(config.bellPower, defaults.bellPower),
    verticalOffset: Number.isFinite(config.verticalOffset) ? config.verticalOffset : defaults.verticalOffset,
    opacity: clampedNumber(config.opacity, defaults.opacity),
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
  return roundStable(clamp01((config.opacity + speedBoost + thrustBoost) * pulse))
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

export class WingAirflowSide {
  constructor({ name, config }) {
    this.name = name
    this.config = config
    this.capacity = config.capacity
    this.head = 0
    this.count = 0
    this.timeSinceEmit = 0
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
    this.timeSinceEmit = 0
    this.hasLastEmit = false
    this.lastEmit.set(0, 0, 0)
    this.position.fill(0)
    this.tangent.fill(0)
    this.age.fill(0)
    this.speed.fill(0)
  }

  logicalIndex(offset) {
    return (this.head + offset) % this.capacity
  }

  tailIndex() {
    return this.logicalIndex(this.count - 1)
  }

  clampCount() {
    this.count = Math.min(this.count, this.config.maxSamples)
  }

  advanceAges(delta) {
    const ageDelta = nonNegativeNumber(delta, 0)

    for (let offset = 0; offset < this.count; offset++) {
      this.age[this.logicalIndex(offset)] += ageDelta
    }

    while (this.count > 0 && this.age[this.tailIndex()] >= this.config.sampleLife) {
      this.count--
    }
  }

  emit(position, tangent, speedRatio) {
    const nextHead = (this.head - 1 + this.capacity) % this.capacity
    const base = nextHead * 3
    const normal = tangent.lengthSq() > 0
      ? tangent.clone().normalize()
      : new THREE.Vector3(1, 0, 0)

    this.head = nextHead
    this.position[base] = position.x
    this.position[base + 1] = position.y
    this.position[base + 2] = position.z
    this.tangent[base] = normal.x
    this.tangent[base + 1] = normal.y
    this.tangent[base + 2] = normal.z
    this.age[nextHead] = 0
    this.speed[nextHead] = clamp01(speedRatio)
    this.count = Math.min(this.count + 1, this.capacity)
    this.clampCount()
    this.lastEmit.copy(position)
    this.hasLastEmit = true
  }

  maybeEmit({ position, tangent, speedRatio, delta }) {
    this.advanceAges(delta)
    this.timeSinceEmit += nonNegativeNumber(delta, 0)

    if (speedRatio <= this.config.minSpeedRatio) {
      return
    }

    if (this.timeSinceEmit < this.config.emitInterval) {
      return
    }

    if (this.hasLastEmit && position.distanceTo(this.lastEmit) < this.config.minEmitDistance) {
      return
    }

    this.emit(position, tangent, speedRatio)
    this.timeSinceEmit = 0
  }

  getPosition(index, target) {
    // Accessors accept physical ring-buffer slots; callers resolve logical offsets first.
    const base = index * 3
    return target.set(this.position[base], this.position[base + 1], this.position[base + 2])
  }

  getTangent(index, target) {
    const base = index * 3
    return target.set(this.tangent[base], this.tangent[base + 1], this.tangent[base + 2])
  }
}
