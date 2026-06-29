import * as THREE from 'three/webgpu'

export const DEFAULT_VISUAL_ATTITUDE_CONFIG = {
  enabled: true,
  pitchMax: 0.22,
  rollMax: 0.52,
  pitchSmoothing: 10,
  rollSmoothing: 12,
  rollSpeedBoost: 0.5,
  hover: {
    amplitude: 0.06,
    frequency: 0.7,
    fadeSpeedRatio: 0.25
  },
  turbulence: {
    enabled: true,
    pitchAmplitude: 0.018,
    rollAmplitude: 0.028,
    yawAmplitude: 0.012,
    verticalAmplitude: 0.022,
    frequency: 1.1,
    pitchFrequencyScale: 1,
    rollFrequencyScale: 1.35,
    yawFrequencyScale: 0.75,
    verticalFrequencyScale: 1.6,
    minSpeedRatio: 0.05,
    fullSpeedRatio: 0.45
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

function nonNegativeNumber(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
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
  const turbulence = config.turbulence ?? {}
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
    turbulence: {
      enabled: turbulence.enabled !== false,
      pitchAmplitude: positiveNumber(turbulence.pitchAmplitude, DEFAULT_VISUAL_ATTITUDE_CONFIG.turbulence.pitchAmplitude),
      rollAmplitude: positiveNumber(turbulence.rollAmplitude, DEFAULT_VISUAL_ATTITUDE_CONFIG.turbulence.rollAmplitude),
      yawAmplitude: positiveNumber(turbulence.yawAmplitude, DEFAULT_VISUAL_ATTITUDE_CONFIG.turbulence.yawAmplitude),
      verticalAmplitude: positiveNumber(turbulence.verticalAmplitude, DEFAULT_VISUAL_ATTITUDE_CONFIG.turbulence.verticalAmplitude),
      frequency: positiveNumber(turbulence.frequency, DEFAULT_VISUAL_ATTITUDE_CONFIG.turbulence.frequency),
      pitchFrequencyScale: positiveNumber(turbulence.pitchFrequencyScale, DEFAULT_VISUAL_ATTITUDE_CONFIG.turbulence.pitchFrequencyScale),
      rollFrequencyScale: positiveNumber(turbulence.rollFrequencyScale, DEFAULT_VISUAL_ATTITUDE_CONFIG.turbulence.rollFrequencyScale),
      yawFrequencyScale: positiveNumber(turbulence.yawFrequencyScale, DEFAULT_VISUAL_ATTITUDE_CONFIG.turbulence.yawFrequencyScale),
      verticalFrequencyScale: positiveNumber(turbulence.verticalFrequencyScale, DEFAULT_VISUAL_ATTITUDE_CONFIG.turbulence.verticalFrequencyScale),
      minSpeedRatio: nonNegativeNumber(turbulence.minSpeedRatio, DEFAULT_VISUAL_ATTITUDE_CONFIG.turbulence.minSpeedRatio),
      fullSpeedRatio: positiveNumber(turbulence.fullSpeedRatio, DEFAULT_VISUAL_ATTITUDE_CONFIG.turbulence.fullSpeedRatio)
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
    yawWobble: 0,
    hoverOffset: 0,
    hoverPhase: 0,
    turbulencePhase: 0,
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

export function computeFlightTurbulence(speedRatio, turbulencePhase, config, delta) {
  const nextPhase = turbulencePhase + delta * config.frequency * Math.PI * 2

  if (!config.enabled || delta <= 0) {
    return { pitch: 0, roll: 0, yaw: 0, vertical: 0, nextPhase }
  }

  const speedRange = config.fullSpeedRatio - config.minSpeedRatio
  const speedFactor = speedRange > 0
    ? clamp01((speedRatio - config.minSpeedRatio) / speedRange)
    : clamp01(speedRatio)

  if (speedFactor <= 0) {
    return { pitch: 0, roll: 0, yaw: 0, vertical: 0, nextPhase }
  }

  const pitch = (
    Math.sin(nextPhase * config.pitchFrequencyScale) * config.pitchAmplitude
    + Math.sin(nextPhase * config.pitchFrequencyScale * 2.3 + 1.2) * config.pitchAmplitude * 0.4
  ) * speedFactor
  const roll = (
    Math.sin(nextPhase * config.rollFrequencyScale + 0.7) * config.rollAmplitude
    + Math.cos(nextPhase * config.rollFrequencyScale * 1.7) * config.rollAmplitude * 0.35
  ) * speedFactor
  const yaw = Math.sin(nextPhase * config.yawFrequencyScale + 2.1) * config.yawAmplitude * speedFactor
  const vertical = Math.sin(nextPhase * config.verticalFrequencyScale + 0.3) * config.verticalAmplitude * speedFactor

  return { pitch, roll, yaw, vertical, nextPhase }
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

  const turbulence = computeFlightTurbulence(
    speedRatio,
    attitudeState.turbulencePhase,
    visualConfig.turbulence,
    delta
  )
  attitudeState.turbulencePhase = turbulence.nextPhase
  attitudeState.pitch += turbulence.pitch
  attitudeState.roll += turbulence.roll
  attitudeState.yawWobble = turbulence.yaw
  attitudeState.hoverOffset += turbulence.vertical

  if (visualConfig.thrusters.enabled) {
    const thrusters = computeThrusterIntensity(input, speedRatio, visualConfig)
    attitudeState.leftThruster = thrusters.leftThruster
    attitudeState.rightThruster = thrusters.rightThruster
  }

  return attitudeState
}
