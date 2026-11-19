import * as THREE from 'three/webgpu'

export const DEFAULT_AIRCRAFT_CONFIG = {
  height: 2.5,
  scale: 1,
  thrust: 14,
  reverseThrust: 7,
  turnTorque: 5,
  turnThrustBoost: 2,
  turnIdleBoost: 1.5,
  linearDrag: 2.2,
  angularDrag: 4,
  maxSpeed: 8,
  maxAngularSpeed: 2.8,
  maxDelta: 0.05,
}

const FORWARD = new THREE.Vector3()
const JOYSTICK_SPEED_RESPONSE = 5.5
const JOYSTICK_HEADING_GAIN = 3
const JOYSTICK_TRACK_RESPONSE = 5
const JOYSTICK_MAX_LATERAL_ACCELERATION = 10 // world units/s² at full bank
const JOYSTICK_STOP_SPEED = 0.01

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
    turnThrustBoost: positiveNumber(config.turnThrustBoost, DEFAULT_AIRCRAFT_CONFIG.turnThrustBoost),
    turnIdleBoost: positiveNumber(config.turnIdleBoost, DEFAULT_AIRCRAFT_CONFIG.turnIdleBoost),
    linearDrag: nonNegativeNumber(config.linearDrag, DEFAULT_AIRCRAFT_CONFIG.linearDrag),
    angularDrag: nonNegativeNumber(config.angularDrag, DEFAULT_AIRCRAFT_CONFIG.angularDrag),
    maxSpeed: positiveNumber(config.maxSpeed, DEFAULT_AIRCRAFT_CONFIG.maxSpeed),
    maxAngularSpeed: positiveNumber(config.maxAngularSpeed, DEFAULT_AIRCRAFT_CONFIG.maxAngularSpeed),
    maxDelta: positiveNumber(config.maxDelta, DEFAULT_AIRCRAFT_CONFIG.maxDelta),
  }
}

export function createAircraftState(options = {}) {
  const position = options.position ?? [0, DEFAULT_AIRCRAFT_CONFIG.height, 0]
  const velocity = options.velocity ?? [0, 0, 0]

  return {
    position: new THREE.Vector3(position[0], position[1], position[2]),
    velocity: new THREE.Vector3(velocity[0], velocity[1], velocity[2]),
    yaw: Number.isFinite(options.yaw) ? options.yaw : 0,
    angularVelocity: Number.isFinite(options.angularVelocity) ? options.angularVelocity : 0,
  }
}

export function resolveAircraftInput(keys = {}) {
  const forward = keys.KeyW === true || keys.ArrowUp === true ? 1 : 0
  const reverse = keys.KeyS === true || keys.ArrowDown === true ? 1 : 0
  const left = keys.KeyA === true || keys.ArrowLeft === true ? 1 : 0
  const right = keys.KeyD === true || keys.ArrowRight === true ? 1 : 0

  // Positive yaw turns from +X toward +Z (the aircraft's right).
  return {
    thrustInput: forward - reverse,
    turnInput: right - left,
  }
}

function getYawError(yaw, targetYaw) {
  return THREE.MathUtils.euclideanModulo(targetYaw - yaw + Math.PI, 2 * Math.PI) - Math.PI
}

export function resolveAircraftFeedback(state, input) {
  if (!Number.isFinite(input.targetYaw)) return input
  // Bank reflects the turn actually being flown, including the roll-out.
  const lateralAcceleration = state.velocity.length() * state.angularVelocity
  return {
    thrustInput: input.thrustInput,
    turnInput: THREE.MathUtils.clamp(lateralAcceleration / JOYSTICK_MAX_LATERAL_ACCELERATION, -1, 1),
  }
}

function applyExponentialDrag(value, drag, delta) {
  if (drag <= 0 || delta <= 0) {
    return value
  }
  return value * Math.max(0, 1 - drag * delta)
}

function resolveTurnMultiplier(input, config) {
  if (input.turnInput === 0) {
    return 1
  }
  const fullThrustBoost = input.thrustInput > 0 ? config.turnThrustBoost : 1
  return THREE.MathUtils.lerp(config.turnIdleBoost, fullThrustBoost, Math.abs(input.thrustInput))
}

function stepDirectionalMotion(state, { targetYaw, thrustInput }, config, dt) {
  const currentSpeed = state.velocity.length()
  const headingError = getYawError(state.yaw, targetYaw)
  const targetSpeed = config.maxSpeed * thrustInput
  // On takeoff, ease in thrust as the nose lines up. A turn at cruise
  // preserves airspeed, even when the new heading is directly behind us.
  const alignment = targetSpeed > currentSpeed ? (1 + Math.cos(headingError)) * 0.5 : 1
  const speed = THREE.MathUtils.damp(currentSpeed, targetSpeed, JOYSTICK_SPEED_RESPONSE * alignment, dt)
  if (thrustInput === 0 && speed < JOYSTICK_STOP_SPEED) {
    state.velocity.set(0, 0, 0)
    state.angularVelocity = 0
    return
  }

  // A given bank can only supply so much sideways acceleration (a = vω).
  const rateLimit = Math.min(config.maxAngularSpeed, JOYSTICK_MAX_LATERAL_ACCELERATION / Math.max(speed, JOYSTICK_STOP_SPEED))
  const targetRate = thrustInput > 0 ? THREE.MathUtils.clamp(headingError * JOYSTICK_HEADING_GAIN, -rateLimit, rateLimit) : 0
  const previousRate = state.angularVelocity
  const rateStep = config.turnTorque * dt
  state.angularVelocity += THREE.MathUtils.clamp(targetRate - previousRate, -rateStep, rateStep)
  state.yaw += (previousRate + state.angularVelocity) * 0.5 * dt

  // The nose leads the flight path. Rotate the existing velocity rather
  // than blending opposing vectors through zero during a U-turn.
  const course = currentSpeed > 0 ? Math.atan2(state.velocity.z, state.velocity.x) : state.yaw
  const correction = THREE.MathUtils.damp(0, getYawError(course, state.yaw), JOYSTICK_TRACK_RESPONSE, dt)
  const nextCourse = course + THREE.MathUtils.clamp(correction, -rateLimit * dt, rateLimit * dt)
  state.velocity.set(Math.cos(nextCourse) * speed, 0, Math.sin(nextCourse) * speed)
}

function stepManualMotion(state, input, config, dt) {
  const thrustPower = input.thrustInput >= 0 ? config.thrust : config.reverseThrust
  const acceleration = input.thrustInput * thrustPower
  FORWARD.set(Math.cos(state.yaw), 0, Math.sin(state.yaw))
  state.velocity.addScaledVector(FORWARD, acceleration * dt)

  const turnMultiplier = resolveTurnMultiplier(input, config)
  state.angularVelocity += input.turnInput * config.turnTorque * turnMultiplier * dt

  state.velocity.multiplyScalar(applyExponentialDrag(1, config.linearDrag, dt))
  state.angularVelocity = applyExponentialDrag(state.angularVelocity, config.angularDrag, dt)

  const maxAngularSpeed = config.maxAngularSpeed * turnMultiplier
  state.angularVelocity = THREE.MathUtils.clamp(
    state.angularVelocity,
    -maxAngularSpeed,
    maxAngularSpeed,
  )

  state.yaw += state.angularVelocity * dt
}

export function stepAircraftMotion(state, input, config, delta) {
  const dt = Math.min(Math.max(delta, 0), config.maxDelta)
  if (dt === 0) {
    return state
  }

  if (Number.isFinite(input.targetYaw)) {
    stepDirectionalMotion(state, input, config, dt)
  }
  else {
    stepManualMotion(state, input, config, dt)
  }

  if (state.velocity.lengthSq() > config.maxSpeed * config.maxSpeed) {
    state.velocity.setLength(config.maxSpeed)
  }
  state.position.addScaledVector(state.velocity, dt)
  state.position.y = config.height

  return state
}
