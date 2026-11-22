import { MathUtils, Vector3 } from 'three/webgpu'

export const MISSILE_ROLL_WINDOW = 0.6
const FIRST_LAUNCH_DELAY = 6
const LAUNCH_MIN = 12
const LAUNCH_MAX = 30
const LAUNCH_ALIGNMENT = Math.cos(0.3)
const FLYBY_TIME = 0.65

export function createAircraftIncomingMissile() {
  let cooldown = FIRST_LAUNCH_DELAY
  let nextId = 0
  let missile = null
  let warning = null
  const toPlayer = new Vector3()
  const targetDrift = new Vector3()
  const next = new Vector3()
  const travel = new Vector3()

  function findAttacker(player, targets) {
    for (const jet of targets) {
      if (jet.health <= 0 || !jet.attacking || !jet.alerted || jet.extending) continue
      toPlayer.subVectors(player.position, jet.position)
      const distance = toPlayer.length()
      if (distance < LAUNCH_MIN || distance > LAUNCH_MAX) continue
      const pitch = jet.pitch ?? 0
      const alongNose = (toPlayer.x * Math.cos(jet.yaw) + toPlayer.z * Math.sin(jet.yaw)) * Math.cos(pitch)
        + toPlayer.y * Math.sin(pitch)
      if (alongNose >= distance * LAUNCH_ALIGNMENT) return jet
    }
    return null
  }

  function event(type) {
    return { type, attacker: missile.attacker, position: missile.position.clone() }
  }

  function updateWarning(player) {
    const from = Math.atan2(missile.position.z - player.position.z, missile.position.x - player.position.x) - player.yaw
    warning.bearing = Math.atan2(Math.sin(from), Math.cos(from))
    warning.timeToImpact = Math.max(0, missile.duration - missile.age)
  }

  function launch(attacker, player, cruiseSpeed) {
    const direction = toPlayer.normalize().clone()
    const position = attacker.position.clone().addScaledVector(direction, attacker.radius ?? 0.8)
    position.y -= 0.12
    targetDrift.copy(player.velocity)
    const duration = MathUtils.clamp(position.distanceTo(player.position) / Math.max(1, cruiseSpeed * 1.75), 1.7, 3.6)
    missile = { id: ++nextId, attacker, position, direction, duration, age: 0, lost: false, flybySpeed: 0 }
    warning = { bearing: 0, timeToImpact: duration }
    updateWarning(player)
    cooldown = 11 + Math.random() * 8
    return [event('enemyMissile')]
  }

  function end(type) {
    const result = event(type)
    missile = null
    warning = null
    return [result]
  }

  function moveTo(destination, sampleSurface) {
    travel.subVectors(destination, missile.position)
    const length = travel.length()
    if (!length) return true
    const steps = Math.max(1, Math.ceil(length / 0.25))
    travel.divideScalar(steps)
    for (let i = 0; i < steps; i++) {
      missile.position.add(travel)
      const floor = sampleSurface?.(missile.position.x, missile.position.z)
      if (Number.isFinite(floor) && missile.position.y <= floor) return false
    }
    missile.direction.copy(travel).normalize()
    return true
  }

  function update(dt, player, targets, cruiseSpeed, sampleSurface) {
    if (!player || !(dt > 0) || !Number.isFinite(dt)) return []
    cooldown = Math.max(0, cooldown - dt)
    if (!missile) {
      const attacker = cooldown === 0 && findAttacker(player, targets)
      return attacker ? launch(attacker, player, cruiseSpeed) : []
    }
    if (missile.lost) {
      missile.age += dt
      next.copy(missile.position).addScaledVector(missile.direction, missile.flybySpeed * dt)
      if (!moveTo(next, sampleSurface) || missile.age >= missile.duration + FLYBY_TIME)
        return end('enemyMissileExpired')
      return []
    }

    // The closing animation shares a clock with the HUD so the roll cue stays
    // fair through player turns and at different frame rates.
    const flightTime = Math.min(dt, missile.duration - missile.age)
    missile.age += flightTime
    const remaining = Math.max(0, missile.duration - missile.age)
    const rollAge = player.rollSpin ? player.rollSpin.elapsed - (dt - flightTime) : Infinity
    const rolling = rollAge >= -1e-8 && rollAge <= MISSILE_ROLL_WINDOW + 1e-8
    next.copy(player.position).addScaledVector(player.velocity, flightTime - dt)
    // Ease toward the moving endpoint from the missile's last world position.
    // Its path bends into a player's turn instead of copying the jet's sideways displacement.
    targetDrift.lerp(player.velocity, 1 - Math.exp(-2.8 * flightTime))
    next.addScaledVector(targetDrift, remaining * 0.75)
    if (rolling && remaining < 0.35) {
      const side = (player.rollSpin.sign ?? 1) * (1 - remaining / 0.35) * 0.85
      next.x -= Math.sin(player.yaw) * side
      next.z += Math.cos(player.yaw) * side
    }
    next.lerp(missile.position, remaining / (remaining + flightTime))
    if (!moveTo(next, sampleSurface)) return end('enemyMissileExpired')
    if (remaining > 1e-8) {
      updateWarning(player)
      return []
    }
    if (!rolling) return end('enemyMissileHit')
    missile.lost = true
    missile.flybySpeed = cruiseSpeed * 3
    warning = null
    return [event('missileEvaded')]
  }

  function reset() {
    cooldown = FIRST_LAUNCH_DELAY
    missile = null
    warning = null
  }

  return { reset, update, get missile() { return missile }, get warning() { return warning } }
}
