import { Euler, MathUtils, Vector3 } from 'three/webgpu'
import { FLIGHT_POSE_ORDER } from '../camera.js'

const WORLD_UNIT = 4.4 / 92
const ART_UNIT = 0.6 * WORLD_UNIT
const MAX_STEP = 1 / 120
const EPSILON = 1e-9
const SHOT_INTERVAL = 1 / 18
const SHOT_SPEED = 620 * WORLD_UNIT
const SHOT_LIFE = 0.95
const SHOT_CROSSING = 520 * WORLD_UNIT
const ENEMY_SHOT_INTERVAL = 1 / 8
const ENEMY_SHOT_SPEED = 320 * WORLD_UNIT
const ENEMY_SHOT_RANGE = 15
const MISSILE_INTERVAL = 0.38
const MISSILE_RAIL_REARM_TIME = 0.68
const NORMAL_MISSILE = {
  drop: 0.34, ramp: 0.5, burn: 1.9, guidedLife: 5,
  thrust: 430 * WORLD_UNIT, topSpeed: (92 + 400) * WORLD_UNIT,
}
const COUNTER_MISSILE = {
  drop: 0.04, ramp: 0.2, burn: 8, guidedLife: 8,
  thrust: NORMAL_MISSILE.thrust * 1.7, topSpeed: NORMAL_MISSILE.topSpeed + 140 * WORLD_UNIT,
}
const COUNTER_SIDES = [-1, 1, 0]
const MISSILE_MIN_LEAD_SPEED = 60 * WORLD_UNIT
const MISSILE_MAX_LEAD_TIME = 1.2
const LOCK_RANGE = 950 * WORLD_UNIT
const LOCK_TIME = 0.8
const LOCK_CONE = Math.cos(0.4)
const KEEP_CONE = Math.cos(0.9)
const RELOAD_TIME = 5
const TERRAIN_TRACE_STEP = 0.1
const UP = new Vector3(0, 1, 0)
const RIGHT = new Vector3(0, 0, 1)
const { clamp } = MathUtils

function targetPositionAt(target, fraction, result) {
  return target.previousPosition
    ? result.lerpVectors(target.previousPosition, target.position, fraction)
    : result.copy(target.position)
}

function sweptSphere(start, relativeOffset, center, radius) {
  const x = center.x - start.x
  const y = center.y - start.y
  const z = center.z - start.z
  const outside = x * x + y * y + z * z - radius ** 2
  if (outside <= 0) return 0
  const distanceSquared = relativeOffset.lengthSq()
  const along = x * relativeOffset.x + y * relativeOffset.y + z * relativeOffset.z
  const discriminant = along * along - distanceSquared * outside
  if (along <= 0 || discriminant < 0 || distanceSquared === 0) return Infinity
  return (along - Math.sqrt(discriminant)) / distanceSquared
}

function terrainContact(sampleSurface, start, offset, fraction, length) {
  if (!sampleSurface) return Infinity
  const belowSurface = (time) => {
    const height = sampleSurface(start.x + time * offset.x, start.z + time * offset.z)
    return Number.isFinite(height) && start.y + time * offset.y <= height
  }
  if (belowSurface(0)) return 0
  const samples = Math.max(1, Math.ceil(length * fraction / TERRAIN_TRACE_STEP))
  for (let i = 1; i <= samples; i++) {
    let hi = fraction * i / samples
    if (!belowSurface(hi)) continue
    let lo = fraction * (i - 1) / samples
    for (let refine = 0; refine < 5; refine++) {
      const middle = (lo + hi) / 2
      if (belowSurface(middle)) hi = middle
      else lo = middle
    }
    return hi
  }
  return Infinity
}

function spend(magazine) {
  magazine.left--
  if (magazine.left === 0) magazine.remaining = RELOAD_TIME
}

function tickReload(magazine, dt, weapon, events) {
  if (!magazine.remaining) return
  magazine.remaining = Math.max(0, magazine.remaining - dt)
  if (magazine.remaining <= EPSILON) {
    magazine.remaining = 0
    magazine.left = magazine.capacity
    events.push({ type: 'reload', weapon })
  }
}

const reloadProgress = magazine => magazine.remaining ? Math.max(0.001, 1 - magazine.remaining / RELOAD_TIME) : 0

export function createAircraftWeapons({ sampleSurface } = {}) {
  const shots = []
  const missiles = []
  const cannonAmmo = { capacity: 300, left: 300, remaining: 0 }
  const missileAmmo = { capacity: 6, left: 6, remaining: 0 }
  const forward = new Vector3()
  const up = new Vector3()
  const right = new Vector3()
  const motion = new Vector3()
  const offset = new Vector3()
  const relativeOffset = new Vector3()
  const sight = new Vector3()
  const towardTarget = new Vector3()
  const turnAxis = new Vector3()
  const enemyPose = new Euler(0, 0, 0, FLIGHT_POSE_ORDER)
  let nextId = 0
  let cannonSide = -1
  let missileSide = -1
  let gunDue = 0
  let missileWait = 0
  let lockTarget = null
  let lockTime = 0
  let clock = 0
  let enemyFire = new WeakMap()
  const railReadyAt = { [-1]: 0, [1]: 0 }
  const missileRails = {
    get [-1]() { return railLoaded(-1) },
    get [1]() { return railLoaded(1) },
  }

  function railLoaded(side) {
    const needed = side === missileSide ? 1 : 2
    return missileAmmo.left >= needed && clock + EPSILON >= railReadyAt[side]
  }

  function reset() {
    shots.length = missiles.length = 0
    for (const magazine of [cannonAmmo, missileAmmo]) {
      magazine.left = magazine.capacity
      magazine.remaining = 0
    }
    cannonSide = missileSide = -1
    railReadyAt[-1] = railReadyAt[1] = 0
    gunDue = missileWait = lockTime = 0
    lockTarget = null
    clock = 0
    enemyFire = new WeakMap()
  }

  function mount(position, scale, x, y, z) {
    const unit = scale * ART_UNIT
    return position.clone().addScaledVector(forward, x * unit).addScaledVector(up, y * unit).addScaledVector(right, z * unit)
  }

  function updateLock(dt, position, targets, frame, events) {
    const aimAt = (target, range) => {
      if (target.health <= 0) return -2
      const delta = targetPositionAt(target, frame.progress, towardTarget).sub(position)
      delta.y *= 0.6
      const distance = delta.length()
      return distance > range || distance < WORLD_UNIT ? -2 : delta.dot(sight) / distance
    }
    if (lockTime >= LOCK_TIME && targets.includes(lockTarget) && aimAt(lockTarget, LOCK_RANGE * 1.25) >= KEEP_CONE) return

    let candidate = null
    let score = LOCK_CONE
    for (const target of targets) {
      const alignment = aimAt(target, LOCK_RANGE)
      if (alignment <= score) continue
      score = alignment
      candidate = target
    }
    if (candidate !== lockTarget) lockTime = 0
    lockTarget = candidate
    if (candidate && lockTime < LOCK_TIME) {
      lockTime += dt
      if (lockTime >= LOCK_TIME - EPSILON) {
        lockTime = LOCK_TIME
        const lockPosition = targetPositionAt(candidate, frame.progress, new Vector3())
        events.push({ type: 'lock', target: candidate, position: lockPosition })
      }
    }
  }

  function fireCannon(aircraft, scale, events, frameAge) {
    const position = mount(aircraft.position, scale, 2, -1.8, cannonSide * 9)
    const toe = -cannonSide * 9 * ART_UNIT * scale * SHOT_SPEED / SHOT_CROSSING
    const velocity = forward.clone().multiplyScalar(SHOT_SPEED).addScaledVector(right, toe).add(aircraft.velocity)
    shots.push({ id: nextId++, position, direction: velocity.clone().normalize(), velocity, age: 0 })
    events.push({
      type: 'cannon', weapon: 'cannon', position: position.clone(), direction: forward.clone(),
      side: cannonSide, orientation: aircraft.quaternion.clone(), carrierVelocity: aircraft.velocity.clone(), scale, frameAge,
    })
    cannonSide = -cannonSide
    spend(cannonAmmo)
  }

  function fireEnemyCannon(enemy, frame, events, muzzleIndex) {
    enemyPose.set(enemy.roll ?? 0, -(enemy.yaw ?? 0), enemy.pitch ?? 0)
    const mounts = enemy.muzzleMounts
    const mount = mounts?.[muzzleIndex]
    const direction = (mount?.direction.clone() ?? new Vector3(1, 0, 0)).applyEuler(enemyPose)
    const position = targetPositionAt(enemy, frame.progress, new Vector3())
    if (mount) position.add(mount.position.clone().applyEuler(enemyPose).multiplyScalar(enemy.radius))
    else position.addScaledVector(direction, enemy.radius * 0.8)
    const velocity = direction.clone().multiplyScalar(ENEMY_SHOT_SPEED)
    if (enemy.velocity && Number.isFinite(enemy.velocity.lengthSq())) velocity.add(enemy.velocity)
    const lifetime = Math.min(1.1, ENEMY_SHOT_RANGE / velocity.length())
    shots.push({
      id: nextId++, position, direction: velocity.clone().normalize(), velocity, age: 0, lifetime, enemy: true, attacker: enemy,
    })
    events.push({ type: 'enemyCannon', weapon: 'cannon', position: position.clone(), direction, attacker: enemy })
    enemyFire.set(enemy, { due: clock + ENEMY_SHOT_INTERVAL, nextMuzzle: mount ? (muzzleIndex + 1) % mounts.length : 0 })
  }

  function fireMissile(aircraft, scale, events, counterShot) {
    const side = counterShot ? COUNTER_SIDES[counterShot.index] : missileSide
    const position = new Vector3()
    const direction = forward.clone()
    const launchUp = up.clone()
    if (aircraft.getMissileMount) {
      aircraft.getMissileMount(side || -1, position, direction, launchUp)
      if (side === 0) {
        aircraft.getMissileMount(1, offset)
        position.lerp(offset, 0.5)
      }
    } else position.copy(mount(aircraft.position, scale, -3, -2, side * 13.5))
    if (counterShot) {
      const wingAxis = turnAxis.crossVectors(direction, launchUp).normalize()
      direction.addScaledVector(wingAxis, side * 0.6).addScaledVector(launchUp, side ? 0.4 : 0.75).normalize()
    }
    const target = counterShot?.target ?? (lockTime >= LOCK_TIME ? lockTarget : null)
    missiles.push({
      id: nextId++, position, direction, launchUp, target, scale: aircraft.missileScale ?? scale,
      counter: Boolean(counterShot), damage: counterShot ? 2 : Infinity, speed: aircraft.velocity.length(),
      dropVelocity: launchUp.clone().multiplyScalar(counterShot ? 0 : -8 * WORLD_UNIT),
      age: 0, powered: false,
    })
    const event = { type: 'missile', weapon: 'missile', position: position.clone(), side, target }
    if (counterShot) event.counterIndex = counterShot.index
    events.push(event)
    if (counterShot) return
    railReadyAt[side] = clock + MISSILE_RAIL_REARM_TIME
    missileSide = -side
    missileWait = MISSILE_INTERVAL
    spend(missileAmmo)
  }

  function trace(projectile, velocity, dt, weapon, targets, frame, events, ignitionTime = Infinity) {
    const { position } = projectile
    offset.copy(velocity).multiplyScalar(dt)
    const motionFraction = dt / frame.duration
    let fraction = 1
    let struck = null
    for (const target of targets) {
      if (target.health <= 0 || (projectile.counter && target !== projectile.target)) continue
      const center = targetPositionAt(target, frame.progress, towardTarget)
      // Hold the sphere still for the sweep by subtracting its simultaneous motion.
      const travel = target.previousPosition
        ? relativeOffset.subVectors(target.previousPosition, target.position).multiplyScalar(motionFraction).add(offset)
        : offset
      const hit = sweptSphere(position, travel, center, target.radius)
      if (hit <= fraction && (hit < fraction || !struck)) {
        fraction = hit
        struck = target
      }
    }

    const surface = terrainContact(sampleSurface, position, offset, fraction, offset.length())
    const travelFraction = Math.min(fraction, surface)
    if (ignitionTime <= dt * travelFraction + EPSILON) {
      const ignitionPosition = position.clone().addScaledVector(velocity, ignitionTime)
      events.push({ type: 'ignition', weapon, position: ignitionPosition, direction: projectile.direction.clone(), scale: projectile.scale })
    }
    position.addScaledVector(offset, travelFraction)
    if (surface <= fraction) {
      events.push({ type: 'impact', weapon, position: position.clone() })
      return true
    }
    if (!struck) return false

    if (projectile.enemy) {
      events.push({ type: 'playerHit', weapon, position: position.clone(), attacker: projectile.attacker })
      return true
    }

    struck.health = Math.max(0, struck.health - (projectile.damage ?? 1))
    events.push({ type: 'hit', weapon, target: struck, position: position.clone() })
    if (!struck.health) {
      if (struck === lockTarget) {
        lockTarget = null
        lockTime = 0
      }
      events.push({ type: 'destroyed', weapon, target: struck, position: position.clone() })
    }
    return true
  }

  function flyMissile(missile, dt, targets, frame, events) {
    if (missile.target && (missile.target.health <= 0 || !targets.includes(missile.target))) missile.target = null
    const profile = missile.counter ? COUNTER_MISSILE : NORMAL_MISSILE
    const lifetime = missile.target ? profile.guidedLife : 3.4
    const previousAge = missile.age
    const wasPowered = missile.powered
    const moveTime = clamp(lifetime - missile.age, 0, dt)
    missile.age += moveTime
    const burn = missile.age - profile.drop
    missile.powered = burn >= 0 && burn < profile.burn
    if (burn < 0) missile.dropVelocity.addScaledVector(missile.launchUp, -110 * WORLD_UNIT * moveTime)
    else {
      const ramp = MathUtils.smoothstep(burn, 0, profile.ramp)
      missile.speed = missile.powered
        ? Math.min(profile.topSpeed, missile.speed + profile.thrust * ramp * moveTime)
        : missile.speed * Math.exp(-moveTime * 0.25)
      missile.dropVelocity.multiplyScalar(Math.exp(-moveTime * 4))
      if (missile.target && moveTime > 0) {
        targetPositionAt(missile.target, frame.progress, towardTarget).sub(missile.position)
        if (missile.target.velocity) {
          const travelTime = towardTarget.length() / Math.max(MISSILE_MIN_LEAD_SPEED, missile.speed)
          towardTarget.addScaledVector(missile.target.velocity, Math.min(MISSILE_MAX_LEAD_TIME, travelTime))
        }
        towardTarget.normalize()
        const angle = missile.direction.angleTo(towardTarget)
        // Let the three trails fan apart before they sweep back toward the launcher.
        const turnRate = missile.counter
          ? 1.2 + 11 * clamp((burn - 0.16) / 0.45, 0, 1)
          : 3.4 * Math.min(1, burn / profile.ramp)
        const maxAngle = turnRate * moveTime
        if (angle <= maxAngle) missile.direction.copy(towardTarget)
        else if (maxAngle > 0) {
          turnAxis.crossVectors(missile.direction, towardTarget)
          if (turnAxis.lengthSq() < EPSILON) turnAxis.crossVectors(missile.direction, Math.abs(missile.direction.y) < 0.9 ? UP : RIGHT)
          missile.direction.applyAxisAngle(turnAxis.normalize(), maxAngle).normalize()
        }
      }
    }
    motion.copy(missile.direction).multiplyScalar(missile.speed).add(missile.dropVelocity)
    const ignitionTime = !wasPowered && missile.powered ? Math.max(0, profile.drop - previousAge) : Infinity
    if (trace(missile, motion, moveTime, 'missile', targets, frame, events, ignitionTime)) return true
    if (missile.age < lifetime - EPSILON) return false
    events.push({ type: 'impact', weapon: 'missile', position: missile.position.clone() })
    return true
  }

  function step(dt, aircraft, targets = []) {
    const events = []
    if (!Number.isFinite(dt) || dt <= 0) return events
    forward.set(1, 0, 0).applyQuaternion(aircraft.quaternion)
    up.set(0, 1, 0).applyQuaternion(aircraft.quaternion)
    right.set(0, 0, 1).applyQuaternion(aircraft.quaternion)
    sight.copy(forward)
    sight.y *= 0.6
    sight.normalize()
    const scale = aircraft.scale ?? 1
    const steps = Math.ceil(dt / MAX_STEP)
    const stepTime = dt / steps
    const frame = { duration: dt, progress: 0 }
    const playerTargets = aircraft.targetable === true && Number.isFinite(aircraft.radius) && aircraft.radius > 0
      && !aircraft.defeated && !(aircraft.health <= 0) ? [aircraft] : []
    for (let i = 0; i < steps; i++) {
      frame.progress = i / steps
      updateLock(stepTime, aircraft.position, targets, frame, events)
      if (!i && aircraft.missile && missileWait <= EPSILON && railLoaded(missileSide)) fireMissile(aircraft, scale, events)
      if (!i && aircraft.counterShots) {
        for (const shot of aircraft.counterShots) {
          if (shot.target?.health > 0 && targets.includes(shot.target) && COUNTER_SIDES[shot.index] !== undefined)
            fireMissile(aircraft, scale, events, shot)
        }
      }
      if (aircraft.cannon && cannonAmmo.left) {
        if (gunDue <= EPSILON) {
          fireCannon(aircraft, scale, events, (steps - i) * stepTime)
          gunDue += SHOT_INTERVAL
        }
        gunDue -= stepTime
      } else gunDue = 0

      if (playerTargets.length) {
        for (const enemy of targets) {
          const fire = enemyFire.get(enemy)
          if (enemy.firing && enemy.health > 0 && clock + EPSILON >= (fire?.due ?? 0)) {
            fireEnemyCannon(enemy, frame, events, fire?.nextMuzzle ?? 0)
          }
        }
      }

      let active = 0
      for (const shot of shots) {
        const lifetime = shot.lifetime ?? SHOT_LIFE
        const moveTime = Math.min(stepTime, lifetime - shot.age)
        shot.age += moveTime
        const collidables = shot.enemy ? playerTargets : targets
        if (!trace(shot, shot.velocity, moveTime, 'cannon', collidables, frame, events) && shot.age < lifetime - EPSILON) shots[active++] = shot
      }
      shots.length = active
      active = 0
      for (const missile of missiles) {
        if (!flyMissile(missile, stepTime, targets, frame, events)) missiles[active++] = missile
      }
      missiles.length = active
      missileWait = Math.max(0, missileWait - stepTime)
      tickReload(cannonAmmo, stepTime, 'cannon', events)
      tickReload(missileAmmo, stepTime, 'missile', events)
      clock += stepTime
    }
    return events
  }

  return {
    shots,
    missiles,
    missileRails,
    get lockTarget() { return lockTarget },
    get lockProgress() { return lockTime / LOCK_TIME },
    get locked() { return lockTime >= LOCK_TIME },
    get rounds() { return cannonAmmo.left },
    get missilesLeft() { return missileAmmo.left },
    get roundsMax() { return cannonAmmo.capacity },
    get missilesMax() { return missileAmmo.capacity },
    get gunReload() { return reloadProgress(cannonAmmo) },
    get missileReload() { return reloadProgress(missileAmmo) },
    reset,
    step,
  }
}
