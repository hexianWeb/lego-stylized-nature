import { Euler, MathUtils, Vector3 } from 'three/webgpu'
import { FLIGHT_POSE_ORDER } from '../camera.js'

const ALERT_RANGE = 17.5
const KEEP_ALERT_RANGE = 20.5
const ATTACK_RANGE = 12
const ATTACK_ALIGNMENT = Math.cos(0.16)
const AIM_LEAD = 0.35
const PURSUIT_TURN_RATE = 0.88
const INTERCEPT_TURN_RATE = 1.8
const TURN_RESPONSE = 2.2
const EVASION_TURN_RATE = 0.75
const EVASIVE_COURSE_TURN_LIMIT = 1.1
const PASS_RANGE = 9
export const CONTACT_RANGE = 40
const BREAK_TURN_RATE = 0.35
const PASS_AIM_TIME = 0.85
const BURST_INTERVAL = 1.35
const BURST_DURATION = 0.42
const TERRAIN_MARGIN = 0.5
const { clamp, damp } = MathUtils

const aim = new Vector3()
const nose = new Vector3()
const pose = new Euler(0, 0, 0, FLIGHT_POSE_ORDER)

function clearanceAt(sampleSurface, x, z, radius) {
  const surface = sampleSurface?.(x, z)
  return Number.isFinite(surface) ? surface + radius + TERRAIN_MARGIN : -Infinity
}

function pursuitSpeed(distance, playerSpeed, cruiseSpeed) {
  // Ease between the three throttle settings so crossing a range boundary doesn't jerk the jet.
  const near = playerSpeed * 0.92
  const middle = Math.max(cruiseSpeed, playerSpeed * 1.12)
  const far = Math.max(cruiseSpeed * 1.5, playerSpeed * 1.9)
  const approach = MathUtils.lerp(near, middle, MathUtils.smoothstep(distance, 4, 6))
  return MathUtils.lerp(approach, far, MathUtils.smoothstep(distance, ATTACK_RANGE, 16))
}

function hasRoomToReengage(enemy, playerState) {
  const dx = playerState.position.x - enemy.position.x
  const dz = playerState.position.z - enemy.position.z
  const separation = Math.hypot(dx, dz)
  if (separation < PASS_RANGE) return false
  const facing = (dx * Math.cos(enemy.yaw) + dz * Math.sin(enemy.yaw)) / separation
  // A player behind the tail requires room for a wide turn back.
  const turnRadius = Math.hypot(enemy.velocity.x, enemy.velocity.z) / PURSUIT_TURN_RATE
  return separation >= PASS_RANGE + (1 - facing) * 1.4 * turnRadius
}

export function advanceEnemyAircraft(enemy, playerState, playerCruiseSpeed, dt, sampleSurface, attackAuthorized = true) {
  if (!Number.isFinite(dt) || dt <= 0) return
  const { position, previousPosition, velocity, radius } = enemy
  previousPosition.copy(position)
  enemy.age += dt

  const distanceSquared = playerState ? position.distanceToSquared(playerState.position) : Infinity
  const alertRange = enemy.pass || enemy.attacking ? CONTACT_RANGE : enemy.alerted ? KEEP_ALERT_RANGE : ALERT_RANGE
  enemy.alerted = distanceSquared <= alertRange ** 2
  enemy.firing = false
  enemy.extending = false
  const wave = enemy.phase + 0.6 * enemy.age
  let heading = enemy.course + 0.24 * Math.sin(wave)
  let altitude = enemy.cruiseAltitude + 0.12 * Math.sin(wave)
  let speedTarget = enemy.speed
  let turnRate = INTERCEPT_TURN_RATE
  let exitYawRate
  const pursuing = attackAuthorized && enemy.alerted
  if (pursuing) {
    aim.copy(playerState.position).addScaledVector(playerState.velocity, AIM_LEAD)
    heading = Math.atan2(aim.z - position.z, aim.x - position.x)
    altitude = aim.y
    const behindPlayer = (position.x - playerState.position.x) * Math.cos(playerState.yaw)
      + (position.z - playerState.position.z) * Math.sin(playerState.yaw) < 0
    if (behindPlayer) turnRate = PURSUIT_TURN_RATE
    // Keep moving when the player's horizontal velocity nearly vanishes at the top of a loop.
    const playerSpeed = Math.max(playerCruiseSpeed * 0.55, Math.hypot(playerState.velocity.x, playerState.velocity.z))
    const horizontalDistance = Math.hypot(position.x - playerState.position.x, position.z - playerState.position.z)
    speedTarget = pursuitSpeed(horizontalDistance, playerSpeed, playerCruiseSpeed)
    const playerBreaking = Math.abs(playerState.angularVelocity) > BREAK_TURN_RATE
    if (!enemy.pass && behindPlayer && distanceSquared < PASS_RANGE ** 2 && Math.cos(heading - enemy.yaw) > 0.95
      && (playerBreaking || distanceSquared < 1.8 ** 2)) {
      const turnSide = playerBreaking ? -Math.sign(playerState.angularVelocity) : Math.cos(enemy.phase) >= 0 ? 1 : -1
      enemy.pass = { start: enemy.age, heading, altitude, turnSide, returning: false }
    }
    if (enemy.pass) {
      const pass = enemy.pass
      const clearing = enemy.age - pass.start >= PASS_AIM_TIME
      if (clearing && !pass.returning) pass.returning = hasRoomToReengage(enemy, playerState)
      if (!pass.returning) {
        turnRate = PURSUIT_TURN_RATE
        heading = pass.heading
        altitude = pass.altitude
        enemy.extending = clearing
        if (clearing) {
          const room = MathUtils.smoothstep(Math.sqrt(distanceSquared), PASS_RANGE, 2 * PASS_RANGE)
          exitYawRate = pass.turnSide * MathUtils.lerp(0.14, 0.45, room)
          speedTarget = playerSpeed * 0.94
        }
      }
      // Keep the contact through the turn, until it is back within attack range.
      else if (distanceSquared <= ATTACK_RANGE ** 2) enemy.pass = null
    }
  }
  else {
    enemy.pass = null
    if (playerState && !attackAuthorized) {
      // Roam on the current course nearby. Further out, return to a flank of the
      // encounter so a waiting aircraft can take the next turn without tailing the player.
      const dx = playerState.position.x - position.x
      const dz = playerState.position.z - position.z
      const regroup = MathUtils.smoothstep(Math.hypot(dx, dz), 14, 28)
      const flank = Math.sin(enemy.phase) < 0 ? -14 : 14
      const returnHeading = Math.atan2(dz + flank * Math.cos(playerState.yaw), dx - flank * Math.sin(playerState.yaw))
      heading += Math.atan2(Math.sin(returnHeading - heading), Math.cos(returnHeading - heading)) * regroup
      const playerSpeed = Math.hypot(playerState.velocity.x, playerState.velocity.z)
      speedTarget = MathUtils.lerp(enemy.speed, Math.max(enemy.speed, playerSpeed * 1.5), regroup)
      altitude = MathUtils.lerp(altitude, playerState.position.y + Math.cos(enemy.phase) * 1.6, regroup)
    }
  }

  const yawError = Math.atan2(Math.sin(heading - enemy.yaw), Math.cos(heading - enemy.yaw))
  let desiredYawRate = exitYawRate ?? clamp(yawError * 2.4, -turnRate, turnRate)
  if (enemy.evading) {
    const side = Math.sign(Math.sin(enemy.age * 1.9 + enemy.phase))
    // Leave steering authority for the weave even during a hard intercept turn.
    const courseRate = clamp(desiredYawRate, -EVASIVE_COURSE_TURN_LIMIT, EVASIVE_COURSE_TURN_LIMIT)
    desiredYawRate = clamp(courseRate + side * EVASION_TURN_RATE, -INTERCEPT_TURN_RATE, INTERCEPT_TURN_RATE)
  }
  const previousYawRate = enemy.yawRate
  enemy.yawRate = damp(previousYawRate, desiredYawRate, TURN_RESPONSE, dt)
  enemy.yaw += (previousYawRate + enemy.yawRate) * 0.5 * dt
  enemy.roll = damp(enemy.roll, clamp(enemy.yawRate, -0.85, 0.85), 4, dt)

  const speed = damp(Math.hypot(velocity.x, velocity.z), speedTarget, 2, dt)
  const vx = speed * Math.cos(enemy.yaw)
  const vz = speed * Math.sin(enemy.yaw)
  position.x += vx * dt
  position.z += vz * dt
  const floor = clearanceAt(sampleSurface, position.x, position.z, radius)
  const ahead = clearanceAt(sampleSurface, position.x + vx * 0.65, position.z + vz * 0.65, radius)
  position.y = Math.max(floor, damp(position.y, Math.max(altitude, floor, ahead), 3, dt))
  velocity.subVectors(position, previousPosition).multiplyScalar(1 / dt)
  const pitch = clamp(Math.atan2(velocity.y, speed), -0.4, 0.4)
  enemy.pitch = damp(enemy.pitch, pitch, 6, dt)

  if (!pursuing || enemy.extending) return
  const attackDistance = position.distanceToSquared(playerState.position)
  if (attackDistance < 1.8 ** 2 || attackDistance > ATTACK_RANGE ** 2) return

  aim.sub(position).normalize()
  nose.set(1, 0, 0).applyEuler(pose.set(enemy.roll, -enemy.yaw, enemy.pitch))
  if (nose.dot(aim) < ATTACK_ALIGNMENT) return
  if (enemy.age - (enemy.burstStartedAt ?? -Infinity) >= BURST_INTERVAL) enemy.burstStartedAt = enemy.age
  enemy.firing = enemy.age - enemy.burstStartedAt < BURST_DURATION
}
