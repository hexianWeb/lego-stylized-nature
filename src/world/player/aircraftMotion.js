import { MathUtils, Vector3 } from 'three/webgpu'

export const DEFAULT_AIRCRAFT_CONFIG = Object.freeze({
  height: 5.5, scale: 1, cruiseSpeed: 4.4, maxSpeed: 7.92,
  turnRate: 1.25, pitchMax: 1.4, diveMax: 0.62, bankMax: 52 * Math.PI / 180,
  pitchInputScale: 0.8,
  clearance: 0.85, ceiling: 72, rollSeconds: 0.85, loopSeconds: 3.6,
})

const TAU = Math.PI * 2
const MAX_STEP = 1 / 120
const VERTICAL_DEAD_ZONE = 2 * DEFAULT_AIRCRAFT_CONFIG.cruiseSpeed / 92
const { clamp, damp } = MathUtils

export function normalizeAircraftConfig(config = {}) {
  const result = {}
  for (const [key, fallback] of Object.entries(DEFAULT_AIRCRAFT_CONFIG)) {
    result[key] = Number.isFinite(config[key]) && config[key] > 0 ? config[key] : fallback
  }
  result.maxSpeed = Math.max(result.cruiseSpeed, result.maxSpeed)
  result.ceiling = Math.max(result.clearance, result.height, result.ceiling)
  result.pitchMax = Math.min(result.pitchMax, Math.PI / 2 - 0.05)
  result.diveMax = Math.min(result.diveMax, Math.PI / 2 - 0.05)
  return result
}

export function createAircraftState({ position = [0, DEFAULT_AIRCRAFT_CONFIG.height, 0], yaw = 0, speed = DEFAULT_AIRCRAFT_CONFIG.cruiseSpeed } = {}) {
  return {
    position: new Vector3(...position),
    velocity: new Vector3(Math.cos(yaw) * speed, 0, Math.sin(yaw) * speed),
    yaw, speed, pitch: 0, pathPitch: 0, roll: 0, bank: 0, angularVelocity: 0, boost: 0,
    energy: 1, climbAngle: 0, softFloor: null,
    groundHeight: 0, surfaceKnown: false, blocked: null, noticeTime: 0,
    loop: null, rollSpin: null,
    get stunt() { return this.loop ?? this.rollSpin },
  }
}

function sampleGround(state, sampleSurface) {
  const height = sampleSurface?.(state.position.x, state.position.z)
  state.surfaceKnown = Number.isFinite(height)
  if (state.surfaceKnown) state.groundHeight = height
}

function groundAhead(state, config, sampleSurface) {
  let height = state.groundHeight
  if (!sampleSurface) return height
  const forwardX = Math.cos(state.yaw)
  const forwardZ = Math.sin(state.yaw)
  const span = 0.35 * config.scale
  for (let step = 0; step <= 4; step++) {
    const distance = state.speed * 0.16 * step
    const x = state.position.x + forwardX * distance
    const z = state.position.z + forwardZ * distance
    for (let lane = -1; lane <= 1; lane++) {
      if (step === 0 && lane === 0) continue
      const surface = sampleSurface(x - forwardZ * span * lane, z + forwardX * span * lane)
      if (Number.isFinite(surface)) height = Math.max(height, surface)
    }
  }
  return height
}

function loopAngle(progress) {
  const angle = progress * TAU
  return angle - Math.sin(angle)
}

function startLoop(state, kind, config) {
  if (state.loop) return
  const sign = kind === 'backLoop' ? 1 : -1
  const entry = clamp(state.pathPitch * sign, 0, Math.PI)
  let low = 0
  let high = 0.5
  for (let i = 0; i < 18; i++) {
    const midpoint = (low + high) / 2
    if (loopAngle(midpoint) < entry) low = midpoint
    else high = midpoint
  }
  // Estimate the eased loop's vertical envelope at the current speed. The terrain
  // check still runs as the loop flies, since the surface and speed can change.
  const stride = (1 - low) / 48
  let y = state.position.y
  for (let i = 0; i < 48; i++) {
    y += state.speed * config.loopSeconds * stride * Math.sin(sign * loopAngle(low + (i + 0.5) * stride))
    if (y < state.groundHeight + config.clearance - 1e-6 || y > config.ceiling + 1e-6) {
      state.blocked = y > config.ceiling ? 'ceiling' : 'ground'
      state.noticeTime = 1
      return
    }
  }
  state.blocked = null
  state.loop = { kind, sign, manual: false, elapsed: low * config.loopSeconds }
}

function advancePathPitch(state, climb, hasThrust, config, dt) {
  const loop = state.loop
  if (loop && !loop.manual) {
    loop.elapsed = Math.min(config.loopSeconds, loop.elapsed + dt)
    state.pathPitch = loop.sign * loopAngle(loop.elapsed / config.loopSeconds)
    if (loop.elapsed >= config.loopSeconds - 1e-9) state.loop = null
    return true
  }

  const upwardRate = TAU / config.loopSeconds * (1 + 0.15 * state.boost)
  const downwardRate = upwardRate * 0.85
  const limit = climb >= 0 ? config.pitchMax : config.diveMax
  const fullStick = Math.abs(climb) >= 0.97 ? Math.sign(climb) : 0
  const thrusting = hasThrust && state.boost > 0.3
  if (loop) {
    const held = fullStick === loop.sign
    const continueLoop = held || Math.abs(state.pathPitch) > Math.PI / 2
    const rate = loop.sign > 0 ? upwardRate : downwardRate
    state.pathPitch += loop.sign * (continueLoop ? 1 : -1) * rate * dt
    loop.elapsed += dt
    if (Math.abs(state.pathPitch) >= TAU) {
      state.pathPitch -= loop.sign * TAU
      state.pitch -= loop.sign * TAU
      if (!held || !thrusting) state.loop = null
    }
    else if (!continueLoop && Math.abs(state.pathPitch) <= (loop.sign > 0 ? config.pitchMax : config.diveMax)) {
      state.loop = null
    }
  }
  else if (thrusting && fullStick) {
    state.pathPitch += (fullStick > 0 ? upwardRate : -downwardRate) * dt
    if (state.pathPitch * fullStick >= limit) {
      state.blocked = null
      state.loop = { kind: fullStick > 0 ? 'backLoop' : 'frontLoop', sign: fullStick, manual: true, elapsed: 0 }
    }
  }
  else {
    const demand = climb * limit * config.pitchInputScale
    const change = damp(state.pathPitch, demand, 8, dt) - state.pathPitch
    const pitchStep = config.pitchInputScale * dt
    state.pathPitch += clamp(change, -downwardRate * pitchStep, upwardRate * pitchStep)
  }
  return state.loop !== null
}

function advanceRoll(state, config, dt) {
  state.roll = state.bank
  const spin = state.rollSpin
  if (!spin) return
  spin.elapsed += dt
  const t = spin.elapsed / config.rollSeconds
  if (t >= 1 - 1e-9) {
    state.rollSpin = null
    return
  }
  const eased = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2
  state.roll += spin.sign * TAU * eased
}

/** Flight-space is +X forward, +Y up, +Z right. All times are simulation seconds. */
export function stepAircraftMotion(state, input, config, delta, sampleSurface) {
  const elapsed = Number.isFinite(delta) ? clamp(delta, 0, 0.15) : 0
  if (!elapsed) return state
  const turn = clamp(input.turn ?? 0, -1, 1)
  const climb = clamp(input.climb ?? 0, -1, 1)
  const throttle = input.boost ? 1 : clamp(input.throttle ?? 0, 0, 1)
  sampleGround(state, sampleSurface)
  const floorTarget = groundAhead(state, config, sampleSurface) + config.clearance
  state.softFloor ??= state.groundHeight + config.clearance
  if (input.stunt === 'roll' && !state.rollSpin) {
    state.rollSpin = { kind: 'roll', sign: state.angularVelocity < 0 ? -1 : 1, elapsed: 0 }
  }
  else if (input.stunt === 'backLoop' || input.stunt === 'frontLoop') startLoop(state, input.stunt, config)

  const steps = Math.ceil(elapsed / MAX_STEP)
  const dt = elapsed / steps
  for (let i = 0; i < steps; i++) {
    state.boost = damp(state.boost, throttle, throttle > state.boost ? 5 : 2.4, dt)
    state.noticeTime = Math.max(0, state.noticeTime - dt)

    const slope = Math.sin(state.climbAngle)
    const flipping = state.loop?.manual === true
    const energyTarget = 1 - 0.2 * slope * (slope > 0 ? 1 - state.boost : 1) - (flipping ? 0.42 : 0)
    state.energy = damp(state.energy, energyTarget, flipping ? 2.6 : 1.1, dt)
    state.speed = (config.cruiseSpeed + state.boost * (config.maxSpeed - config.cruiseSpeed)) * state.energy
    state.angularVelocity = damp(state.angularVelocity, turn * config.turnRate, 2.6, dt)
    state.yaw += state.angularVelocity * dt
    const turnFraction = state.angularVelocity / config.turnRate
    state.bank = damp(state.bank, turnFraction * config.bankMax, 5, dt)

    const inLoop = advancePathPitch(state, climb, throttle > 0.3, config, dt)
    state.softFloor = damp(state.softFloor, floorTarget, floorTarget > state.softFloor ? 9 : 3, dt)
    const previousY = state.position.y
    let vertical = state.speed * Math.sin(state.pathPitch)
    if (!inLoop) {
      const room = vertical < 0 ? previousY - state.softFloor : config.ceiling - previousY
      vertical *= clamp(room / 0.7, 0, 1)
    }
    const horizontal = state.speed * (inLoop ? Math.cos(state.pathPitch)
      : Math.sqrt(Math.max(0.03, 1 - (vertical / state.speed) ** 2)))
    state.velocity.set(Math.cos(state.yaw) * horizontal, vertical, Math.sin(state.yaw) * horizontal)
    state.position.addScaledVector(state.velocity, dt)
    if (!inLoop && state.position.y < state.softFloor) {
      const lift = damp(state.position.y, state.softFloor, 4, dt) - state.position.y
      state.position.y += Math.min(state.speed * dt, lift)
    }

    sampleGround(state, sampleSurface)
    const floor = state.groundHeight + config.clearance
    const safeY = clamp(state.position.y, floor, Math.max(floor, config.ceiling))
    const hitLimit = safeY !== state.position.y
    if (hitLimit) {
      if (inLoop) {
        state.blocked = state.position.y < floor ? 'ground' : 'ceiling'
        state.noticeTime = 1
      }
      state.position.y = safeY
      state.loop = null
      state.pathPitch = 0
      state.velocity.set(Math.cos(state.yaw) * state.speed, 0, Math.sin(state.yaw) * state.speed)
    }
    else {
      state.velocity.y = (state.position.y - previousY) / dt
    }

    const rising = Math.sign(state.velocity.y) * Math.max(0, Math.abs(state.velocity.y) - VERTICAL_DEAD_ZONE)
    const looping = inLoop && !hitLimit
    state.climbAngle = looping ? 0 : Math.asin(clamp(rising / state.speed, -0.995, 0.995))
    if (!looping) {
      if (state.pathPitch > Math.PI) state.pathPitch -= TAU
      else if (state.pathPitch < -Math.PI) state.pathPitch += TAU
      if (state.pitch > Math.PI) state.pitch -= TAU
      else if (state.pitch < -Math.PI) state.pitch += TAU
    }
    state.pitch = damp(state.pitch, looping ? state.pathPitch : state.climbAngle + Math.abs(turnFraction) * 0.1, 14, dt)
    if (looping && !state.loop) state.pathPitch = 0
    advanceRoll(state, config, dt)
  }
  return state
}
