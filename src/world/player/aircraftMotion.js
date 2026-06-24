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
