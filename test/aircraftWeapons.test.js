import assert from 'node:assert/strict'
import test from 'node:test'
import { BoxGeometry, Euler, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three/webgpu'
import { FLIGHT_POSE_ORDER } from '../src/world/camera.js'
import { MISSILE_MOUNT_SCALE } from '../src/world/player/aircraftMissileRack.js'
import { createAircraftState, normalizeAircraftConfig, stepAircraftMotion } from '../src/world/player/aircraftMotion.js'
import { createAircraftTrainingRange } from '../src/world/player/aircraftTrainingRange.js'
import { createAircraftWeaponVisuals } from '../src/world/player/aircraftWeaponVisuals.js'
import { createAircraftWeapons } from '../src/world/player/aircraftWeapons.js'

function aircraft() {
  return {
    position: new Vector3(0, 8, 0),
    quaternion: new Quaternion(),
    velocity: new Vector3(4.4, 0, 0),
    scale: 1,
    cannon: false,
    missile: false,
  }
}

function target(id, position, radius = 0.4) {
  return { id, position, radius, health: 5, maxHealth: 5 }
}

test('counter salvo fans out and hits its launcher behind the jet even with another target locked', () => {
  const weapons = createAircraftWeapons({ sampleSurface: () => 0 })
  const jet = aircraft()
  const launcher = target('launcher', new Vector3(-18, 8, 0))
  const decoy = target('decoy', new Vector3(10, 8, 0))
  const targets = [launcher, decoy]
  weapons.step(0.85, jet, targets)
  assert.equal(weapons.lockTarget, decoy)
  assert.equal(weapons.locked, true)
  const events = []
  for (let index = 0; index < 3; index++) {
    events.push(...weapons.step(0.06, { ...jet, counterShots: [{ target: launcher, index }] }, targets))
  }
  const launches = events.filter(event => event.type === 'missile')
  assert.deepEqual(launches.map(event => event.side), [-1, 1, 0])
  assert.deepEqual(launches.map(event => event.counterIndex), [0, 1, 2])
  assert.ok(launches.every(event => event.target === launcher))
  const [left, right, center] = weapons.missiles
  assert.ok(left.direction.z < -0.3 && right.direction.z > 0.3)
  assert.ok(center.direction.y > right.direction.y && Math.abs(center.direction.z) < 1e-6)
  assert.ok(weapons.missiles.every(missile => missile.powered))
  assert.equal(weapons.missilesLeft, 6)
  const healthAfterHit = []
  for (let i = 0; i < 240 && weapons.missiles.length; i++) {
    const tick = weapons.step(1 / 120, jet, targets)
    if (tick.some(event => event.type === 'hit')) healthAfterHit.push(launcher.health)
    events.push(...tick)
  }
  assert.deepEqual(healthAfterHit, [3, 1, 0])
  assert.equal(events.filter(event => event.type === 'ignition').length, 3)
  assert.deepEqual(events.filter(event => event.type === 'destroyed').map(event => event.target), [launcher])
  assert.equal(decoy.health, 5)
  const normal = weapons.step(1 / 60, { ...jet, missile: true }, targets).find(event => event.type === 'missile')
  assert.equal(normal.side, -1)
  assert.equal(normal.target, decoy)
})

test('bonus missiles launch with an empty magazine, render beside all six normal missiles and ignore a replacement launcher', (t) => {
  const weapons = createAircraftWeapons()
  const visuals = createAircraftWeaponVisuals()
  t.after(() => visuals.dispose())
  const jet = aircraft()
  jet.getMissileMount = (side, position) => {
    assert.ok(side === -1 || side === 1)
    return position.copy(jet.position).add(new Vector3(0, -0.1, side * 0.4))
  }
  const launcher = target('launcher', new Vector3(-20, 8, 0))
  for (let i = 0; i < 6; i++) weapons.step(0.38, { ...jet, missile: true }, [launcher])
  assert.equal(weapons.missilesLeft, 0)
  const counterShots = [0, 1, 2].map(index => ({ target: launcher, index }))
  const events = weapons.step(0.05, { ...jet, counterShots }, [launcher])
  const launches = events.filter(event => event.type === 'missile')
  assert.deepEqual(launches.map(event => event.position.z), [-0.4, 0.4, 0])
  assert.ok(launches.every(event => event.position.y === jet.position.y - 0.1))
  assert.deepEqual([weapons.missileRails[-1], weapons.missileRails[1]], [false, false])
  visuals.update(0.05, weapons, [], events)
  assert.equal(visuals.group.getObjectByName('MissileBody0').count, 9)
  assert.ok(visuals.group.getObjectByName('MissileFlames').count >= 3)
  const replacement = target('launcher', weapons.missiles.at(-1).position.clone(), 0.3)
  const next = weapons.step(0.01, { ...jet, counterShots }, [replacement])
  assert.equal(next.filter(event => event.type === 'missile' || event.type === 'hit').length, 0)
  assert.equal(replacement.health, 5)
  assert.ok(weapons.missiles.filter(missile => missile.counter).every(missile => missile.target === null))
  assert.equal(weapons.missilesLeft, 0)
})

test('terrain can interrupt a counter missile without damaging its launcher', () => {
  const weapons = createAircraftWeapons({ sampleSurface: x => x >= 1 ? 18 : 0 })
  const jet = aircraft()
  const launcher = target('launcher', new Vector3(12, 8, 0))
  const events = weapons.step(1, { ...jet, counterShots: [{ target: launcher, index: 0 }] }, [launcher])
  assert.equal(events.filter(event => event.type === 'impact').length, 1)
  assert.equal(launcher.health, 5)
  assert.equal(weapons.missiles.length, 0)
})

test('weapon visuals separate both tracer colors and keep smoke after the missile leaves', () => {
  const model = new Group()
  const geometry = new BoxGeometry(1, 2, 1)
  const material = new MeshStandardMaterial()
  model.add(new Mesh(geometry, material))
  const visuals = createAircraftWeaponVisuals(model)
  const batch = name => visuals.group.getObjectByName(name)
  const position = new Vector3(0, 8, 0)
  const direction = new Vector3(1, 0, 0)
  const shot = { position, direction, age: 0.05, velocity: new Vector3(30, 0, 0) }
  const missile = { position: position.clone(), direction, launchUp: new Vector3(0, 0.8, 0.6), powered: false }
  const visualState = { shots: [shot, { ...shot, enemy: true }], missiles: [missile] }
  visuals.update(0.02, visualState, [], [{ type: 'cannon', position, direction }])
  assert.equal(batch('CannonTracerStreaks').count, 1)
  assert.equal(batch('CannonTracerStreaks').geometry, batch('EnemyCannonTracers').geometry)
  assert.equal(batch('CannonMuzzleFlares').count, 1)
  assert.equal(batch('EnemyCannonTracers').count, 1)
  assert.equal(batch('MissileBody0').count, 1)
  assert.equal(batch('MissileBody0').material, material)
  const matrix = new Matrix4()
  batch('MissileBody0').getMatrixAt(0, matrix)
  assert.ok(new Vector3(0, 1, 0).transformDirection(matrix).distanceTo(missile.direction) < 1e-6)
  assert.ok(new Vector3(0, 0, 1).transformDirection(matrix).distanceTo(missile.launchUp) < 1e-6)
  assert.equal(batch('MissileFlames').count, 0)
  assert.equal(batch('MissileSmoke').count, 0)

  missile.powered = true
  visuals.update(0.02, visualState)
  missile.position.x += 0.8
  visuals.update(0.02, visualState)
  assert.equal(batch('MissileFlames').count, 1)
  assert.ok(batch('MissileSmoke').count >= 3)
  visuals.update(0.02, { missiles: [] })
  assert.equal(batch('MissileBody0').count, 0)
  assert.equal(batch('MissileFlames').count, 0)
  assert.ok(batch('MissileSmoke').count >= 3)
  visuals.update(1, { missiles: [] })
  assert.equal(batch('MissileSmoke').count, 0)

  let resourceDisposals = 0
  geometry.addEventListener('dispose', () => resourceDisposals++)
  material.addEventListener('dispose', () => resourceDisposals++)
  visuals.dispose()
  assert.equal(resourceDisposals, 0)
  geometry.dispose()
  material.dispose()
})

test('each player shot ejects one casing on the firing side, then the casing moves independently', (t) => {
  const weapons = createAircraftWeapons()
  const visuals = createAircraftWeaponVisuals()
  t.after(() => visuals.dispose())
  const casings = visuals.group.getObjectByName('CannonCasings')
  const jet = aircraft()
  jet.cannon = true
  jet.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 3)
  const outboard = new Vector3(0, 0, 1).applyQuaternion(jet.quaternion)
  const events = weapons.step(0.12, jet)
  assert.deepEqual(events.map(event => event.side), [-1, 1, -1])
  visuals.update(0.12, weapons, [], events)
  assert.equal(casings.count, events.length)
  const matrix = new Matrix4()
  const location = i => {
    casings.getMatrixAt(i, matrix)
    return new Vector3().setFromMatrixPosition(matrix)
  }
  for (const [i, event] of events.entries()) {
    const outwardDistance = location(i).sub(event.position).dot(outboard) * event.side
    assert.ok(outwardDistance > 0.025)
  }
  const previous = location(1)
  jet.position.x += 80
  jet.quaternion.identity()
  jet.cannon = false
  visuals.update(0.04, weapons, [], weapons.step(0.04, jet))
  assert.equal(casings.count, 3)
  assert.ok(location(1).x > previous.x)
  assert.ok(location(1).distanceTo(previous) < 1)
  visuals.update(0.5, weapons)
  assert.equal(casings.count, 0)
  visuals.update(0, weapons, [], events)
  visuals.reset()
  visuals.update(0, weapons)
  assert.equal(casings.count, 0)
})

test('incoming missiles keep their own body and leave a local trail through a flyby', (t) => {
  const visuals = createAircraftWeaponVisuals()
  t.after(() => visuals.dispose())
  const body = visuals.group.getObjectByName('IncomingMissile')
  const playerBody = visuals.group.getObjectByName('MissileBody0')
  const smoke = visuals.group.getObjectByName('MissileSmoke')
  const flashes = visuals.group.getObjectByName('WeaponFlashes')
  const incoming = { position: new Vector3(3, 8, 0), direction: new Vector3(0, 0, -1) }
  const update = (missile, events = []) => visuals.update(1 / 60, {}, [], events, missile)
  assert.equal(body.visible, false)
  update(incoming)
  assert.equal(body.visible, true)
  assert.equal(playerBody.count, 0)
  assert.equal(body.children[0].geometry, playerBody.geometry)
  assert.notEqual(body.children[0].material, playerBody.material)
  assert.ok(body.position.equals(incoming.position))
  assert.ok(new Vector3(0, 1, 0).applyQuaternion(body.quaternion).distanceTo(incoming.direction) < 1e-6)
  incoming.position.z -= 0.8
  update(incoming, [{ type: 'missileEvaded', position: incoming.position }])
  assert.equal(body.visible, true)
  assert.equal(flashes.count, 0)
  assert.ok(smoke.count >= 3)
  const beforeJump = smoke.count
  incoming.position.x += 100
  update(incoming)
  assert.equal(smoke.count, beforeJump + 1)
  update(null, [{ type: 'enemyMissileExpired', position: incoming.position }])
  assert.equal(body.visible, false)
  assert.equal(flashes.count, 1)
  visuals.reset()
  assert.equal(smoke.count, 0)
  assert.equal(flashes.count, 0)
})

test('the range uses the enemy model and its authored paint only for incoming missiles', () => {
  const model = new Group()
  const sourceGeometry = new BoxGeometry(2, 8, 2)
  const paint = new MeshStandardMaterial({ color: 0xb7243a })
  const mesh = new Mesh(sourceGeometry, paint)
  mesh.position.y = 6
  model.add(mesh)
  const range = createAircraftTrainingRange({ enemyMissileScene: model })
  const body = range.group.getObjectByName('IncomingMissile').children.find(part => part.material === paint)
  const playerBody = range.group.getObjectByName('MissileBody0')
  assert.ok(body)
  assert.notEqual(playerBody.material, paint)
  assert.notEqual(body.geometry, sourceGeometry)
  body.geometry.computeBoundingBox()
  const { min, max } = body.geometry.boundingBox
  assert.ok(Math.abs(min.y + 0.36) < 1e-5 && Math.abs(max.y - 0.36) < 1e-5)
  assert.ok(Math.abs(max.x - 0.09) < 1e-5)
  let bodyDisposals = 0
  let sourceDisposals = 0
  body.geometry.addEventListener('dispose', () => bodyDisposals++)
  sourceGeometry.addEventListener('dispose', () => sourceDisposals++)
  paint.addEventListener('dispose', () => sourceDisposals++)
  range.dispose()
  assert.equal(bodyDisposals, 1)
  assert.equal(sourceDisposals, 0)
  sourceGeometry.dispose()
  paint.dispose()
})

test('alternating underwing missiles leave from the displayed mount before lighting', () => {
  const state = createAircraftState()
  const group = new Group()
  const visualRoot = new Group()
  const scale = 1.4
  group.position.copy(state.position)
  group.rotation.x = Math.PI / 2
  visualRoot.scale.setScalar(scale)
  group.add(visualRoot)
  const player = { state, group, motionConfig: normalizeAircraftConfig({ scale }) }
  const range = createAircraftTrainingRange({
    sampleSurface: () => 0, playAudio: () => {}, mountParent: visualRoot,
  })
  range.reset(state)
  const mount = name => visualRoot.getObjectByName(name).getObjectByName('MountedMissile')
  const left = mount('MissileRailLeft')
  const right = mount('MissileRailRight')
  const update = (delta, missile = false) => range.update(delta, player, { missile })
  assert.deepEqual([left.visible, right.visible], [true, true])

  const origin = left.getWorldPosition(new Vector3())
  const up = new Vector3(0, 0, 1).applyQuaternion(left.getWorldQuaternion(new Quaternion()))
  update(0.01, true)
  const first = range.weapons.missiles[0]
  assert.deepEqual([left.visible, right.visible], [false, true])
  assert.equal(first.scale, scale * MISSILE_MOUNT_SCALE)
  assert.ok(first.position.distanceTo(origin) < 0.05)
  assert.ok(first.launchUp.distanceTo(up) < 1e-6)
  assert.ok(first.position.clone().sub(origin).dot(up) < 0)
  assert.equal(first.powered, false)
  assert.equal(range.group.getObjectByName('MissileFlames').count, 0)
  assert.equal(range.group.getObjectByName('WeaponFlashes').count, 0)
  update(0.15)
  update(0.15)
  assert.equal(first.powered, false)
  update(0.09)
  assert.equal(first.powered, true)
  assert.equal(left.visible, false)
  assert.equal(range.group.getObjectByName('MissileFlames').count, 1)

  const rightOrigin = right.getWorldPosition(new Vector3())
  update(0.01, true)
  assert.ok(range.weapons.missiles[1].position.distanceTo(rightOrigin) < 0.05)
  assert.deepEqual([left.visible, right.visible], [false, false])
  update(0.15)
  update(0.15)
  assert.deepEqual([left.visible, right.visible], [true, false])
  range.reset(state)
  assert.deepEqual([left.visible, right.visible], [true, true])
  range.dispose()
  assert.equal(visualRoot.children.length, 0)
})

test('enemy waves draw three distinct models and replace each slot with its new mounts', (t) => {
  const names = ['宽翼青灯机', '短舱青灯机', '蓝舱双推进机', '碟形侦察机', '橙芯双叉机', '红白楔形机']
  const fleet = new Group()
  const geometry = new BoxGeometry(1, 0.3, 1.4)
  const material = new MeshStandardMaterial()
  for (const [index, name] of names.entries()) {
    const model = new Group()
    model.name = name
    const muzzle = new Group()
    muzzle.name = 'Muzzle'
    muzzle.position.set(index * 0.05, 0, 0.7)
    muzzle.userData.marker_type = 'muzzle'
    const engine = new Group()
    engine.name = 'Engine'
    engine.position.set(index * 0.05, 0, -0.7)
    engine.rotation.y = Math.PI
    engine.userData.marker_type = 'engine'
    model.add(new Mesh(geometry, material), muzzle, engine)
    fleet.add(model)
  }

  const range = createAircraftTrainingRange({ sampleSurface: () => 0, playAudio() {}, enemyScene: fleet })
  t.after(() => {
    range.dispose()
    geometry.dispose()
    material.dispose()
  })
  const player = { state: createAircraftState(), group: new Group(), motionConfig: normalizeAircraftConfig() }
  const rng = Math.random
  const draws = [0, 0, 0]
  t.mock.method(Math, 'random', () => draws.shift() ?? rng())

  function checkWave(indices) {
    const roots = range.group.children.filter(node => node.name === 'EnemyAircraft')
    assert.equal(roots.length, 3)
    assert.deepEqual(range.targets.map(target => target.modelIndex), indices)
    for (const target of range.targets) {
      const root = roots.find(node => node.position.equals(target.position))
      const model = root.getObjectByName(`EnemyAirframe:${names[target.modelIndex]}`)
      const [muzzle] = target.muzzleMounts
      const position = root.localToWorld(muzzle.position.clone())
      assert.ok(position.distanceTo(model.getObjectByName('Muzzle').getWorldPosition(new Vector3())) < 1e-6)
      assert.ok(model.getObjectByName('Engine').getObjectByName('EnemyExhaust'))
    }
  }

  range.reset(player.state)
  checkWave([0, 1, 2])
  for (const target of range.targets) target.health = 0
  draws.push(0.99, 0.99, 0.99)
  for (let i = 0; i < 9; i++) range.update(0.15, player, {})
  checkWave([5, 4, 3])
})

test('enemy cannon alternates authored muzzle poses with the aircraft rotation and scale', () => {
  const weapons = createAircraftWeapons()
  const jet = { ...aircraft(), targetable: true, radius: 0.46 }
  const enemy = {
    ...target('enemy', new Vector3(20, 8, 3), 0.86),
    firing: true,
    yaw: 0.8,
    pitch: -0.1,
    roll: 0.25,
    muzzleMounts: [
      { position: new Vector3(0.7, 0.15, -0.3), direction: new Vector3(1, 0.05, 0).normalize() },
      { position: new Vector3(0.65, 0.05, 0.4), direction: new Vector3(1, 0, -0.1).normalize() },
    ],
  }
  const pose = new Euler(enemy.roll, -enemy.yaw, enemy.pitch, FLIGHT_POSE_ORDER)
  const events = []
  for (let i = 0; i < 30; i++) {
    events.push(...weapons.step(0.01, jet, [enemy]).filter(event => event.type === 'enemyCannon'))
  }
  assert.equal(events.length, 3)
  events.forEach((event, i) => {
    const mount = enemy.muzzleMounts[i % 2]
    const position = mount.position.clone().applyEuler(pose).multiplyScalar(enemy.radius).add(enemy.position)
    assert.ok(event.position.distanceTo(position) < 1e-6)
    assert.ok(event.direction.distanceTo(mount.direction.clone().applyEuler(pose)) < 1e-6)
  })
})

test('pursuing aircraft can damage an unresponsive player, and resetting restores combat', () => {
  const cues = []
  const sampleSurface = () => 0
  const range = createAircraftTrainingRange({ sampleSurface, playAudio: cue => cues.push(cue) })
  const player = { state: createAircraftState(), group: new Group(), motionConfig: normalizeAircraftConfig() }
  const dt = 1 / 60
  range.reset(player.state)
  const { combatStatus, weapons } = range
  const initialTarget = range.targets[0]
  function fly(input = {}) {
    stepAircraftMotion(player.state, input, player.motionConfig, dt, sampleSurface)
    range.update(dt, player, input)
  }

  fly()
  assert.equal(initialTarget.alerted, true)
  assert.equal(combatStatus.pursuers, 1)
  for (let i = 0; i < 60 * 8 && combatStatus.hull === combatStatus.hullMax; i++) fly()
  assert.equal(combatStatus.hull, combatStatus.hullMax - 1)
  assert.equal(combatStatus.hitFlash, 1)
  assert.ok(cues.includes('enemyCannon'))
  assert.equal(cues.at(-1), 'playerHit')

  for (let i = 0; i < 60 * 18 && !combatStatus.defeated; i++) fly()
  assert.equal(combatStatus.defeated, true)
  assert.equal(combatStatus.hull, 0)
  const ammo = [weapons.rounds, weapons.missilesLeft]
  fly({ cannon: true, missile: true })
  assert.deepEqual([weapons.rounds, weapons.missilesLeft], ammo)
  assert.equal(range.targets.some(enemy => enemy.alerted || enemy.firing), false)

  range.reset(player.state)
  assert.equal(combatStatus.hull, combatStatus.hullMax)
  assert.equal(combatStatus.defeated, false)
  assert.equal(combatStatus.hitFlash, 0)
  assert.equal(weapons.shots.length, 0)
  assert.ok(range.targets.every(enemy => !enemy.alerted))
  range.dispose()
})

for (const [direction, turn] of [['left', -1], ['right', 1]]) {
  test(`a hard ${direction} turn lets the player get behind and shoot down the original pursuer`, (t) => {
    const sampleSurface = () => 0
    const range = createAircraftTrainingRange({ sampleSurface, playAudio() {} })
    t.after(() => range.dispose())
    const state = createAircraftState({ position: [0, 8, 0] })
    const player = { state, group: new Group(), motionConfig: normalizeAircraftConfig() }
    range.reset(state)
    const [enemy, ...others] = range.targets
    for (const other of others) other.health = 0
    enemy.position.copy(state.position)
    enemy.position.x -= 3.6
    enemy.previousPosition.copy(enemy.position)
    enemy.velocity.set(player.motionConfig.cruiseSpeed, 0, 0)
    enemy.yaw = state.yaw
    enemy.alerted = true

    const toEnemy = new Vector3()
    const enemyForward = new Vector3()
    let turning = true
    let firedFromBehind = false
    const dt = 1 / 60
    for (let i = 0; i < 12 / dt && enemy.health > 0 && !range.combatStatus.defeated; i++) {
      // Hold the key until the HUD starts acquiring this enemy, then level out.
      if (range.weapons.lockTarget === enemy) turning = false
      toEnemy.subVectors(enemy.position, state.position).normalize()
      enemyForward.set(Math.cos(enemy.yaw), 0, Math.sin(enemy.yaw))
      const behind = toEnemy.dot(enemyForward) > 0.5 && Math.cos(state.yaw - enemy.yaw) > 0.5
      const missile = !firedFromBehind && behind && range.weapons.locked && range.weapons.lockTarget === enemy
      const input = { turn: turning ? turn : 0, missile }
      stepAircraftMotion(state, input, player.motionConfig, dt, sampleSurface)
      player.group.position.copy(state.position)
      player.group.rotation.set(state.roll, -state.yaw, state.pitch, FLIGHT_POSE_ORDER)
      range.update(dt, player, input)
      if (missile) {
        assert.equal(range.weapons.missiles[0]?.target, enemy)
        firedFromBehind = true
      }
    }
    assert.equal(firedFromBehind, true, 'the original pursuer should be lockable from its rear quarter')
    assert.equal(enemy.health, 0)
    assert.equal(range.combatStatus.defeated, false)
  })
}

test('lock requires holding the same target and stays locked in the larger cone', () => {
  const weapons = createAircraftWeapons()
  const jet = aircraft()
  const first = target('first', new Vector3(12, 8, 0))
  weapons.step(0.79, jet, [first])
  assert.equal(weapons.lockTarget, first)
  assert.ok(weapons.lockProgress > 0.95 && weapons.lockProgress < 1)
  assert.equal(weapons.locked, false)
  const events = weapons.step(0.01, jet, [first])
  assert.equal(weapons.lockProgress, 1)
  assert.deepEqual(events.map(event => [event.type, event.target]), [['lock', first]])

  first.position.set(12 * Math.cos(0.5), 8, 12 * Math.sin(0.5))
  const center = target('center', new Vector3(12, 8, 0))
  assert.deepEqual(weapons.step(0.1, jet, [first, center]), [])
  assert.equal(weapons.lockTarget, first)
  assert.equal(weapons.locked, true)

  first.position.set(12 * Math.cos(1), 8, 12 * Math.sin(1))
  weapons.step(0.1, jet, [first, center])
  assert.equal(weapons.lockTarget, center)
  assert.equal(weapons.locked, false)
  assert.ok(weapons.lockProgress < 0.2)
})

test('cannon fires eighteen alternating rounds per second', () => {
  for (const fps of [30, 60, 120]) {
    const weapons = createAircraftWeapons()
    const jet = { ...aircraft(), cannon: true }
    const events = []
    for (let frame = 0; frame < fps; frame++) events.push(...weapons.step(1 / fps, jet))
    assert.equal(events.length, 18)
    assert.equal(weapons.rounds, 282)
    for (const [index, event] of events.entries()) {
      assert.equal(event.type, 'cannon')
      assert.equal(Math.sign(event.position.z), index % 2 ? 1 : -1)
      assert.ok(event.position.x < 0.1)
    }
  }
})

test('swept cannon contact hits the first target even between two simulation samples', () => {
  const weapons = createAircraftWeapons()
  const jet = aircraft()
  weapons.step(1 / 120, { ...jet, cannon: true })
  const shot = weapons.shots[0]
  const nearer = target('nearer', shot.position.clone().addScaledVector(shot.direction, 0.11), 0.008)
  const farther = target('farther', shot.position.clone().addScaledVector(shot.direction, 0.22), 0.008)
  nearer.health = 1
  const events = weapons.step(1 / 120, jet, [farther, nearer])
  assert.deepEqual(events.map(event => [event.type, event.target]), [['hit', nearer], ['destroyed', nearer]])
  assert.equal(nearer.health, 0)
  assert.equal(farther.health, 5)
  assert.equal(weapons.shots.length, 0)
})

test('terrain between the projectile and a target stops the shot', () => {
  let ridgeStart = Infinity
  const weapons = createAircraftWeapons({ sampleSurface: x => x >= ridgeStart && x <= ridgeStart + 0.13 ? 12 : 0 })
  const jet = aircraft()
  weapons.step(1 / 120, { ...jet, cannon: true })
  const shot = weapons.shots[0]
  ridgeStart = shot.position.x + 0.07
  const behind = target('behind-ridge', shot.position.clone().addScaledVector(shot.direction, 0.24), 0.008)
  const events = weapons.step(1 / 120, jet, [behind])
  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'impact')
  assert.ok(Math.abs(events[0].position.x - ridgeStart) < 0.004)
  assert.equal(behind.health, 5)
})

test('a crossing target is hit only when it shares the projectile position at the same time', () => {
  const duration = 4 / 120
  const jet = aircraft()
  const crossing = (when) => {
    const weapons = createAircraftWeapons()
    weapons.step(1 / 120, { ...jet, cannon: true })
    const shot = weapons.shots[0]
    const intersection = shot.position.clone().addScaledVector(shot.velocity, duration * 0.5)
    const moving = target('moving', intersection.clone().add(new Vector3(0, 0, when - 1)), 0.02)
    moving.previousPosition = intersection.clone().add(new Vector3(0, 0, when))
    moving.velocity = new Vector3(0, 0, -1 / duration)
    const events = weapons.step(duration, jet, [moving])
    return { events, moving, intersection }
  }

  const aligned = crossing(0.5)
  assert.equal(aligned.events.length, 1)
  assert.equal(aligned.events[0].type, 'hit')
  assert.ok(aligned.events[0].position.distanceTo(aligned.intersection) < 0.02)
  assert.ok(aligned.events[0].position.distanceTo(aligned.moving.position) > 0.4)
  assert.equal(aligned.moving.health, 4)

  const late = crossing(0.8)
  assert.deepEqual(late.events, [])
  assert.equal(late.moving.health, 5)
})

test('enemies fire independently without spending player ammo and need a targetable player', () => {
  const weapons = createAircraftWeapons()
  const jet = { ...aircraft(), radius: 0.4 }
  const enemies = [-2, 2].map(z => ({ ...target(`enemy-${z}`, new Vector3(4, 8, z)), firing: true }))
  assert.deepEqual(weapons.step(1, jet, enemies), [])
  assert.deepEqual(weapons.step(1, { ...jet, targetable: true, radius: 0 }, enemies), [])
  assert.deepEqual(weapons.step(1, { ...jet, targetable: true, defeated: true }, enemies), [])
  const events = weapons.step(1, { ...jet, targetable: true }, enemies).filter(event => event.type === 'enemyCannon')
  assert.equal(events.length, 16)
  for (const enemy of enemies) assert.equal(events.filter(event => event.attacker === enemy).length, 8)
  assert.ok(weapons.shots.every(shot => shot.enemy))
  assert.equal(weapons.rounds, weapons.roundsMax)
})

test('enemy shots follow nose and velocity, pass allies and hit the player without mutating health', () => {
  const weapons = createAircraftWeapons()
  const enemy = {
    ...target('attacker', new Vector3(0, 8, 0)), firing: true, yaw: Math.PI / 2, pitch: 0.2, roll: 0.25,
    velocity: new Vector3(2, 0, 0),
  }
  const nose = new Vector3(1, 0, 0).applyEuler(new Euler(enemy.roll, -enemy.yaw, enemy.pitch, 'YXZ'))
  const shotDirection = nose.clone().multiplyScalar(320 * 4.4 / 92).add(enemy.velocity).normalize()
  const muzzle = enemy.position.clone().addScaledVector(nose, enemy.radius * 0.8)
  const ally = target('ally', muzzle.clone().addScaledVector(shotDirection, 2))
  const jet = { ...aircraft(), position: muzzle.clone().addScaledVector(shotDirection, 4), radius: 0.4, targetable: true, health: 5 }

  const launch = weapons.step(1 / 120, jet, [enemy, ally])
  assert.ok(launch.some(event => event.type === 'enemyCannon' && event.attacker === enemy))
  const shot = weapons.shots[0]
  assert.ok(shot.direction.distanceTo(shotDirection) < 1e-12)
  assert.ok(launch.find(event => event.type === 'enemyCannon').position.distanceTo(muzzle) < 1e-12)
  enemy.firing = false

  const events = weapons.step(0.5, jet, [enemy, ally])
  assert.ok(events.some(event => event.type === 'playerHit' && event.attacker === enemy && event.weapon === 'cannon'))
  assert.equal(ally.health, 5)
  assert.equal(jet.health, 5)
  assert.equal(weapons.shots.length, 0)
})

test('a crossing player can be hit by an existing enemy shot before its next terrain sample', () => {
  let wall = Infinity
  const weapons = createAircraftWeapons({ sampleSurface: x => x >= wall ? 20 : 0 })
  const jet = { ...aircraft(), radius: 0.025, targetable: true }
  const enemy = { ...target('attacker', new Vector3(5, 8, 0)), firing: true }
  weapons.step(1 / 120, jet, [enemy])
  enemy.firing = false
  const shot = weapons.shots[0]
  const duration = 4 / 120
  const crossing = shot.position.clone().addScaledVector(shot.velocity, duration * 0.5)
  jet.previousPosition = crossing.clone().add(new Vector3(0, 0, 0.55))
  jet.position.copy(crossing).add(new Vector3(0, 0, -0.55))
  wall = crossing.x + 0.1

  const events = weapons.step(duration, jet, [enemy])
  assert.deepEqual(events.map(event => event.type), ['playerHit'])
  assert.ok(events[0].position.distanceTo(crossing) < jet.radius)
})

test('only missiles launched with a full lock home after dropping from the rail', () => {
  const jet = aircraft()
  const offCenter = target('offset', new Vector3(14, 8, 3))
  const unguided = createAircraftWeapons()
  unguided.step(0.1, jet, [offCenter])
  unguided.step(0.01, { ...jet, missile: true }, [offCenter])
  const dumbfire = unguided.missiles[0]
  assert.equal(dumbfire.target, null)
  unguided.step(1.5, jet, [offCenter])
  assert.equal(dumbfire.target, null)
  assert.deepEqual(dumbfire.direction.toArray(), [1, 0, 0])
  assert.equal(offCenter.health, 5)

  const guided = createAircraftWeapons()
  guided.step(0.8, jet, [offCenter])
  const release = guided.step(0.01, { ...jet, missile: true }, [offCenter])
  const missile = guided.missiles[0]
  assert.equal(release[0].target, offCenter)
  assert.equal(missile.powered, false)
  assert.equal(missile.speed, jet.velocity.length())
  const initialY = missile.position.y
  guided.step(0.3, jet, [offCenter])
  assert.equal(missile.powered, false)
  assert.ok(missile.position.y < initialY)
  guided.step(0.3, jet, [offCenter])
  assert.equal(missile.powered, true)
  assert.ok(missile.speed > jet.velocity.length())
  assert.ok(missile.direction.z > 0)
  const impact = guided.step(1.5, jet, [offCenter])
  assert.deepEqual(impact.map(event => event.type), ['hit', 'destroyed'])
  assert.equal(offCenter.health, 0)
  assert.equal(guided.lockTarget, null)
  assert.equal(guided.missiles.length, 0)
})

test('a guided missile leads and hits its moving target', () => {
  const weapons = createAircraftWeapons()
  const jet = aircraft()
  const moving = target('cruising', new Vector3(14, 8, 1))
  moving.previousPosition = moving.position.clone()
  moving.velocity = new Vector3(1.8, 0, 3)
  const tick = (missile = false) => {
    moving.previousPosition.copy(moving.position)
    moving.position.addScaledVector(moving.velocity, 1 / 60)
    return weapons.step(1 / 60, { ...jet, missile }, [moving])
  }
  for (let i = 0; i < 48; i++) tick()
  assert.equal(weapons.locked, true)
  assert.equal(tick(true)[0].target, moving)
  let led = false
  const events = []
  for (let i = 0; i < 180 && moving.health > 0; i++) {
    events.push(...tick())
    const missile = weapons.missiles[0]
    if (missile?.powered) {
      const direct = moving.position.clone().sub(missile.position).normalize()
      if (missile.direction.z > direct.z + 0.025) led = true
    }
  }
  assert.equal(led, true)
  assert.ok(events.some(event => event.type === 'hit' && event.weapon === 'missile' && event.target === moving))
  assert.equal(moving.health, 0)
})

test('a missile emits one ignition after release and before a later impact', () => {
  const weapons = createAircraftWeapons()
  const jet = aircraft()
  const launch = weapons.step(0.01, { ...jet, missile: true })
  assert.deepEqual(launch.map(event => event.type), ['missile'])
  assert.deepEqual(weapons.step(0.32, jet), [])
  const ignition = weapons.step(0.02, jet)
  assert.deepEqual(ignition.map(event => [event.type, event.weapon]), [['ignition', 'missile']])
  assert.ok(ignition[0].position.x > launch[0].position.x)
  assert.ok(ignition[0].position.x < weapons.missiles[0].position.x)
  assert.deepEqual(weapons.step(4, jet).map(event => event.type), ['impact'])
})

test('a missile impact suppresses ignition only if it happens first within the same step', () => {
  for (const delay of [0.002, 0.006]) {
    let wall = Infinity
    const weapons = createAircraftWeapons({ sampleSurface: x => x >= wall ? 20 : 0 })
    const jet = aircraft()
    weapons.step(0.336, { ...jet, missile: true })
    const missile = weapons.missiles[0]
    wall = missile.position.x + missile.speed * delay
    const events = weapons.step(0.008, jet)
    assert.deepEqual(events.map(event => event.type), delay < 0.004 ? ['impact'] : ['ignition', 'impact'])
    assert.equal(weapons.missiles.length, 0)
  }
})

test('depleted cannon and missile magazines refill on their own five-second timers', () => {
  const weapons = createAircraftWeapons()
  const jet = aircraft()
  weapons.step(300 / 18, { ...jet, cannon: true })
  assert.equal(weapons.rounds, 0)
  assert.ok(weapons.gunReload > 0)
  assert.deepEqual(weapons.step(4.8, jet), [])
  assert.ok(weapons.gunReload > 0.9)
  assert.deepEqual(weapons.step(0.2, jet), [{ type: 'reload', weapon: 'cannon' }])
  assert.equal(weapons.rounds, 300)
  assert.equal(weapons.gunReload, 0)

  const sides = []
  for (let i = 0; i < 6; i++) {
    const launch = weapons.step(0.38, { ...jet, missile: true }).find(event => event.type === 'missile')
    sides.push(launch?.side)
  }
  assert.deepEqual(sides, [-1, 1, -1, 1, -1, 1])
  assert.deepEqual([weapons.missileRails[-1], weapons.missileRails[1]], [false, false])
  assert.equal(weapons.missilesLeft, 0)
  assert.ok(weapons.missileReload > 0)
  assert.equal(weapons.step(0.2, { ...jet, missile: true }).some(event => event.type === 'missile'), false)
  assert.ok(weapons.step(4.8, jet).some(event => event.type === 'reload' && event.weapon === 'missile'))
  assert.equal(weapons.missilesLeft, 6)
  assert.deepEqual([weapons.missileRails[-1], weapons.missileRails[1]], [true, true])

  weapons.step(0.01, { ...jet, cannon: true, missile: true })
  const { shots, missiles } = weapons
  assert.equal(shots.length, 1)
  assert.equal(missiles.length, 1)
  weapons.reset()
  assert.equal(weapons.shots, shots)
  assert.equal(weapons.missiles, missiles)
  assert.equal(shots.length + missiles.length, 0)
  assert.equal(weapons.rounds, 300)
  assert.equal(weapons.missilesLeft, 6)
})
