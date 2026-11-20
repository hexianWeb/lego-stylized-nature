import { MathUtils, Vector3 } from 'three/webgpu'

export const DEFAULT_AIRCRAFT_CONFIG = Object.freeze({
  height: 5.5, scale: 1, cruiseSpeed: 4.4, maxSpeed: 8,
  turnRate: 1.8, pitchMax: 0.58, bankMax: 0.9,
  clearance: 0.85, ceiling: 13, rollSeconds: 0.85, loopSeconds: 1.9,
})

const TAU = Math.PI * 2
const MAX_STEP = 1 / 120
const { clamp, damp } = MathUtils

export function normalizeAircraftConfig(config = {}) {
  const result = {}
  for (const [key, fallback] of Object.entries(DEFAULT_AIRCRAFT_CONFIG)) {
    result[key] = Number.isFinite(config[key]) && config[key] > 0 ? config[key] : fallback
  }
  result.maxSpeed = Math.max(result.cruiseSpeed, result.maxSpeed)
  result.ceiling = Math.max(result.clearance, result.height, result.ceiling)
  result.pitchMax = Math.min(result.pitchMax, Math.PI / 2 - 0.05)
  return result
}

export function createAircraftState({ position = [0, DEFAULT_AIRCRAFT_CONFIG.height, 0], yaw = 0, speed = DEFAULT_AIRCRAFT_CONFIG.cruiseSpeed } = {}) {
  return {
    position: new Vector3(...position),
    velocity: new Vector3(Math.cos(yaw) * speed, 0, Math.sin(yaw) * speed),
    yaw, speed, pitch: 0, roll: 0, bank: 0, angularVelocity: 0, boost: 0,
    groundHeight: 0, surfaceKnown: false, stunt: null, blocked: null, noticeTime: 0,
    gesture: 0, gestureTime: 0, gestureUsed: false,
  }
}

function sampleGround(state, sampleSurface) {
  const height = sampleSurface?.(state.position.x, state.position.z)
  state.surfaceKnown = Number.isFinite(height)
  if (state.surfaceKnown) state.groundHeight = height
}

function alignVelocity(state) {
  const horizontal = state.speed * Math.cos(state.pitch)
  state.velocity.set(Math.cos(state.yaw) * horizontal, state.speed * Math.sin(state.pitch), Math.sin(state.yaw) * horizontal)
}

function startStunt(state, kind, turn, config) {
  if (state.stunt || !['roll', 'backLoop', 'frontLoop'].includes(kind)) return
  const roll = kind === 'roll'
  const sign = roll ? (turn < 0 ? -1 : 1) : kind === 'backLoop' ? 1 : -1
  const duration = roll ? config.rollSeconds : config.loopSeconds
  const radius = state.speed * duration / TAU
  if (!roll) {
    // Extrema of the circle in the entry-pitch plane. A diving entry is not level.
    const centerY = state.position.y + sign * radius * Math.cos(state.pitch)
    const blocked = centerY - radius < state.groundHeight + config.clearance ? 'ground'
      : centerY + radius > config.ceiling ? 'ceiling' : null
    if (blocked) {
      state.blocked = blocked
      state.noticeTime = 1
      return
    }
  }
  state.blocked = null
  state.stunt = { kind, sign, elapsed: 0, duration, radius, entryPitch: state.pitch }
  state.angularVelocity = 0
}

function stepCruise(state, turn, climb, config, dt) {
  state.speed = damp(state.speed, config.cruiseSpeed + state.boost * (config.maxSpeed - config.cruiseSpeed), 3, dt)
  const rate = config.turnRate * (1 - 0.28 * state.boost)
  state.angularVelocity = damp(state.angularVelocity, turn * rate, 5, dt)
  state.yaw += state.angularVelocity * dt
  state.bank = damp(state.bank, state.angularVelocity / rate * config.bankMax, 7, dt)
  const room = climb < 0 ? state.position.y - state.groundHeight - config.clearance : config.ceiling - state.position.y
  state.pitch = damp(state.pitch, climb * config.pitchMax * clamp(room / 0.7, 0, 1), 4.5, dt)
  state.roll = state.bank
  alignVelocity(state)
  state.position.addScaledVector(state.velocity, dt)
}

function stepStunt(state, dt) {
  const stunt = state.stunt
  const next = Math.min(1, (stunt.elapsed + dt) / stunt.duration)
  const angle = next * TAU * stunt.sign
  state.bank = damp(state.bank, 0, 6, dt)
  if (stunt.kind === 'roll') {
    // Ease the axial rotation in and out; maintain the actual line of flight.
    state.roll = state.bank + (next - Math.sin(TAU * next) / TAU) * TAU * stunt.sign
    alignVelocity(state)
    state.position.addScaledVector(state.velocity, dt)
  }
  else {
    const before = state.pitch
    state.pitch = stunt.entryPitch + angle
    state.roll = state.bank
    const r = stunt.radius * stunt.sign
    const advance = r * (Math.sin(state.pitch) - Math.sin(before))
    state.position.x += Math.cos(state.yaw) * advance
    state.position.z += Math.sin(state.yaw) * advance
    state.position.y += r * (Math.cos(before) - Math.cos(state.pitch))
    alignVelocity(state)
  }
  stunt.elapsed += dt
  if (next >= 1 - 1e-9) {
    state.pitch = stunt.entryPitch
    state.roll = state.bank
    state.stunt = null
  }
}

/** Flight-space is +X forward, +Y up, +Z right. All times are simulation seconds. */
export function stepAircraftMotion(state, input, config, delta, sampleSurface) {
  const elapsed = Number.isFinite(delta) ? clamp(delta, 0, 0.15) : 0
  if (!elapsed) return state
  const turn = clamp(input.turn ?? 0, -1, 1)
  const climb = clamp(input.climb ?? 0, -1, 1)
  const gesture = input.boost && Math.abs(climb) >= 0.94 ? Math.sign(climb) : 0
  if (gesture !== state.gesture) {
    state.gesture = gesture
    state.gestureTime = 0
    state.gestureUsed = false
  }
  sampleGround(state, sampleSurface)
  if (input.stunt) {
    startStunt(state, input.stunt, turn, config)
    if (gesture) state.gestureUsed = true
  }
  const steps = Math.ceil(elapsed / MAX_STEP)
  const dt = elapsed / steps
  for (let i = 0; i < steps; i++) {
    state.boost = damp(state.boost, input.boost ? 1 : 0, 5, dt)
    state.noticeTime = Math.max(0, state.noticeTime - dt)
    if (gesture && !state.gestureUsed) {
      state.gestureTime += dt
      if (state.gestureTime >= 0.4) {
        state.gestureUsed = true
        startStunt(state, gesture > 0 ? 'backLoop' : 'frontLoop', turn, config)
      }
    }
    let remaining = dt
    if (state.stunt) {
      const used = Math.min(dt, state.stunt.duration - state.stunt.elapsed)
      stepStunt(state, used)
      remaining -= used
    }
    if (remaining > 1e-9) stepCruise(state, turn, climb, config, remaining)
    sampleGround(state, sampleSurface)
    const floor = state.groundHeight + config.clearance
    const safeY = clamp(state.position.y, floor, Math.max(floor, config.ceiling))
    if (safeY !== state.position.y) {
      state.position.y = safeY
      state.stunt = null
      state.pitch = 0
      state.roll = state.bank
      alignVelocity(state)
    }
  }
  return state
}
