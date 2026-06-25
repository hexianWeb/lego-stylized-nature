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
