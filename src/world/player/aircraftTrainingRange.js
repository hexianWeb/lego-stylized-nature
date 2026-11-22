import { Vector3 } from 'three/webgpu'
import { createAircraftCounterattack } from './aircraftCounterattack.js'
import { advanceEnemyAircraft, CONTACT_RANGE } from './aircraftEnemyMotion.js'
import { createAircraftIncomingMissile } from './aircraftIncomingMissile.js'
import { MISSILE_MOUNT_SCALE } from './aircraftMissileRack.js'
import { createAircraftWeapons } from './aircraftWeapons.js'
import { createAircraftWeaponVisuals } from './aircraftWeaponVisuals.js'

const FORMATION = [
  { forward: 14, right: 0, height: 0, radius: 0.78, speed: 2.4, heading: 0.04, phase: 0 },
  { forward: 20, right: -4, height: 1.4, radius: 0.82, speed: 2.65, heading: -0.34, phase: 2.1 },
  { forward: 25, right: 5, height: 0.8, radius: 0.9, speed: 2.85, heading: 0.32, phase: 4.2 },
]
const TARGET_HEALTH = 5
const PLAYER_HULL = 6
const ENEMY_MISSILE_DAMAGE = 4
const PLAYER_HIT_COOLDOWN = 0.56
const PLAYER_HIT_FLASH_TIME = 0.56
const RANGE_REPLACE_DELAY = 1.2
const MAX_ATTACKERS = 2
const JOIN_RANGE = 32
const FEEDBACK = {
  lock: '导弹已锁定',
  hit: '命中敌机',
  destroyed: '敌机击毁',
  missileEvaded: '已甩脱来弹',
  enemyMissileHit: '导弹击中机体',
}

export function createAircraftTrainingRange({ sampleSurface, playAudio, missileScene, enemyMissileScene, enemyScene, mountParent }) {
  const weapons = createAircraftWeapons({ sampleSurface })
  const incoming = createAircraftIncomingMissile()
  const visuals = createAircraftWeaponVisuals(missileScene, mountParent, enemyScene, enemyMissileScene)
  const targets = []
  const counter = createAircraftCounterattack(targets)
  const feedback = { text: '', time: 0 }
  const combatStatus = {
    hull: PLAYER_HULL, hullMax: PLAYER_HULL, hitFlash: 0, defeated: false, pursuers: 0, incomingMissile: null,
    get slowMotion() { return counter.slowMotion },
    get counterReady() { return Boolean(counter.readyTarget) },
    get counterTarget() { return counter.readyTarget },
  }
  const previousPlayerPosition = new Vector3()
  let playerHitCooldown = 0
  let nextTarget = 0
  let timeWithoutTargets = 0
  let encounterTime = 0

  function clearanceAt(x, z, radius) {
    const surface = sampleSurface(x, z)
    return Number.isFinite(surface) ? surface + radius + 0.5 : -Infinity
  }

  function placeTargets(state) {
    encounterTime = 0
    const x = Math.cos(state.yaw)
    const z = Math.sin(state.yaw)
    const models = [...visuals.enemyModelIndices]
    targets.length = 0
    for (const { forward, right, height, radius, speed, heading, phase } of FORMATION) {
      const modelIndex = models.length ? models.splice(Math.floor(Math.random() * models.length), 1)[0] : null
      const cruiseAltitude = state.position.y + height
      const position = new Vector3(
        state.position.x + x * forward - z * right,
        cruiseAltitude,
        state.position.z + z * forward + x * right,
      )
      position.y = Math.max(position.y, clearanceAt(position.x, position.z, radius))
      const yaw = state.yaw + heading
      targets.push({
        id: ++nextTarget,
        modelIndex,
        position,
        previousPosition: position.clone(),
        velocity: new Vector3(Math.cos(yaw) * speed, 0, Math.sin(yaw) * speed),
        radius,
        health: TARGET_HEALTH,
        maxHealth: TARGET_HEALTH,
        cruiseAltitude,
        course: yaw,
        speed,
        phase,
        age: 0,
        yaw,
        yawRate: 0,
        pitch: 0,
        roll: 0,
        alerted: false,
        attacking: false,
        nextRoleAt: targets.length * 4,
        pass: null,
        extending: false,
        evading: false,
        firing: false,
      })
    }
    visuals.prepareTargets(targets)
    timeWithoutTargets = 0
  }

  function setAttackRole(target, attacking) {
    target.attacking = attacking
    const variation = 5 * Math.abs(Math.sin(target.phase + encounterTime * 0.35))
    target.nextRoleAt = encounterTime + (attacking ? 11 : 4) + variation
    if (!attacking) {
      target.course = target.yaw
      target.cruiseAltitude = target.position.y
      target.firing = false
      target.pass = null
      target.extending = false
    }
  }

  function rotateAttackers(state) {
    let active = 0
    for (const target of targets) {
      if (!target.attacking) continue
      if (!state || target.health <= 0 || encounterTime >= target.nextRoleAt
        || target.position.distanceToSquared(state.position) > CONTACT_RANGE ** 2)
        setAttackRole(target, false)
      else active++
    }
    if (!state) return
    // Oldest ready patrol gets the next vacancy, including one left by a kill.
    while (active < MAX_ATTACKERS) {
      let next
      for (const target of targets) {
        if (target.attacking || target.health <= 0 || target.nextRoleAt > encounterTime
          || target.position.distanceToSquared(state.position) > JOIN_RANGE ** 2) continue
        if (!next || target.nextRoleAt < next.nextRoleAt) next = target
      }
      if (!next) break
      setAttackRole(next, true)
      active++
    }
  }

  function reset(state) {
    weapons.reset()
    incoming.reset()
    counter.reset()
    visuals.reset()
    feedback.text = ''
    feedback.time = 0
    Object.assign(combatStatus, { hull: PLAYER_HULL, hitFlash: 0, defeated: false, pursuers: 0, incomingMissile: null })
    previousPlayerPosition.copy(state.position)
    playerHitCooldown = 0
    placeTargets(state)
    visuals.update(0, weapons, targets, [])
  }

  function handleCombatEvent(event) {
    const { type, weapon } = event
    const missileHit = type === 'enemyMissileHit'
    if (!combatStatus.defeated && (missileHit || (type === 'playerHit' && playerHitCooldown === 0))) {
      combatStatus.hull = Math.max(0, combatStatus.hull - (missileHit ? ENEMY_MISSILE_DAMAGE : 1))
      combatStatus.hitFlash = 1
      combatStatus.defeated = combatStatus.hull === 0
      playerHitCooldown = PLAYER_HIT_COOLDOWN
      playAudio('playerHit')
      if (combatStatus.defeated) {
        incoming.reset()
        counter.reset()
      }
    }
    else if (type === 'missileEvaded') counter.onEvade(event.attacker)
    else if (type === 'enemyMissile') playAudio('incomingMissile')
    else if (type === 'enemyCannon') playAudio('enemyCannon')
    else if (type === 'cannon' || type === 'reload' || type === 'destroyed'
      || (type === 'hit' && event.target.health > 0))
      playAudio(type)
    else if (type === 'ignition') playAudio('missile')
    else if (type === 'impact' && weapon === 'missile') playAudio('blast')
    if (FEEDBACK[type]) {
      feedback.text = type === 'hit' ? (weapon === 'missile' ? '导弹命中敌机' : '机炮命中敌机') : FEEDBACK[type]
      feedback.time = type === 'hit' || type === 'lock' ? 0.85 : 1.5
    }
  }

  function update(delta, player, input, realDelta) {
    // World advances the shared clock before moving the player. A standalone
    // range update also accepts an unscaled delta for callers without a world.
    const dt = realDelta === undefined ? counter.beginFrame(delta) : delta
    if (!dt) return
    const { state } = player
    feedback.time = Math.max(0, feedback.time - (realDelta ?? delta))
    playerHitCooldown = Math.max(0, playerHitCooldown - dt)
    combatStatus.hitFlash = Math.max(0, combatStatus.hitFlash - dt / PLAYER_HIT_FLASH_TIME)
    const x = Math.cos(state.yaw)
    const z = Math.sin(state.yaw)
    const hasNearbyEnemy = targets.some((target) => {
      if (target.health <= 0 || target.position.distanceToSquared(state.position) >= 45 ** 2) return false
      const dx = target.position.x - state.position.x
      const dz = target.position.z - state.position.z
      return target.alerted || dx * x + dz * z > 2
    })
    // Keep the original formation while a missile or a counterattack is pending.
    const encounterActive = hasNearbyEnemy || weapons.missiles.length || incoming.missile || counter.readyTarget || counter.firing
    timeWithoutTargets = combatStatus.defeated || encounterActive ? 0 : timeWithoutTargets + dt
    if (timeWithoutTargets >= RANGE_REPLACE_DELAY) placeTargets(state)

    const canFight = !combatStatus.defeated
    encounterTime += dt
    rotateAttackers(canFight ? state : null)
    for (const target of targets) {
      if (target.health > 0)
        advanceEnemyAircraft(target, canFight ? state : null, player.motionConfig.cruiseSpeed, dt, sampleSurface, target.attacking)
    }
    // Map wrapping can move the player across the world in one frame.
    if (previousPlayerPosition.distanceToSquared(state.position) > 4 ** 2) {
      previousPlayerPosition.copy(state.position)
      incoming.reset()
      counter.reset()
    }
    if (canFight && input.missile && counter.startVolley()) {
      feedback.text = '三连反击'
      feedback.time = 0.85
    }
    const firingVolley = counter.firing
    const events = weapons.step(dt, {
      position: state.position,
      previousPosition: previousPlayerPosition,
      quaternion: player.group.quaternion,
      velocity: state.velocity,
      scale: player.motionConfig.scale,
      radius: 0.46 * player.motionConfig.scale,
      targetable: canFight,
      cannon: canFight && input.cannon,
      missile: canFight && input.missile && !firingVolley,
      counterShots: counter.takeDueShots(),
      getMissileMount: visuals.missileRack?.getWorldMount,
      missileScale: MISSILE_MOUNT_SCALE * player.motionConfig.scale,
    }, targets)
    previousPlayerPosition.copy(state.position)
    for (const event of events) handleCombatEvent(event)
    if (!combatStatus.defeated) {
      for (const event of incoming.update(dt, state, targets, player.motionConfig.cruiseSpeed, sampleSurface)) {
        handleCombatEvent(event)
        events.push(event)
      }
    }
    combatStatus.incomingMissile = incoming.warning
    combatStatus.pursuers = combatStatus.defeated ? 0
      : targets.filter(target => target.health > 0 && target.attacking && target.alerted && !target.extending).length
    // Read the finished weapon step so each jet reacts to its own live threats.
    const lockedTarget = !combatStatus.defeated && weapons.locked ? weapons.lockTarget : null
    for (const target of targets) {
      target.evading = target.health > 0 && (target === lockedTarget || weapons.missiles.some(missile => missile.target === target))
    }
    visuals.update(dt, weapons, targets, events, incoming.missile)
  }

  function dispose() {
    visuals.dispose()
    weapons.reset()
    incoming.reset()
    counter.reset()
    combatStatus.incomingMissile = null
    targets.length = 0
  }

  return { group: visuals.group, weapons, targets, feedback, combatStatus, beginFrame: counter.beginFrame, reset, update, dispose }
}
