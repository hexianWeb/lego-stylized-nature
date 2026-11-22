import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { attribute } from 'three/tsl'
import { FLIGHT_POSE_ORDER } from '../camera.js'
import { createAircraftMissileRack } from './aircraftMissileRack.js'
import { createEnemyAircraftModels } from './enemyAircraftModels.js'

const TRACER_CAPACITY = 128
const MISSILE_CAPACITY = 16
const BURST_CAPACITY = 32
const SMOKE_CAPACITY = 256
const SMOKE_SPACING = 0.22
const SMOKE_LIFE = 0.95
const MISSILE_LENGTH = 0.72
const MISSILE_NOZZLE = MISSILE_LENGTH * 0.5 - 0.018
const UP = new THREE.Vector3(0, 1, 0)
const X_AXIS = new THREE.Vector3(1, 0, 0)
const HOT = new THREE.Color(0xfff0bf)
const TRACER_COLOR = new THREE.Color(0xffb652)
const TRACER_HEAD = new THREE.Color(0xfffad8)
const SPARK_DIRECTIONS = [
  [1, 0.3, 0.2], [-1, 0.8, 0.15], [0.2, 0.5, 1],
  [-0.34, -0.5, -1], [0.42, -1, 0.25], [0.15, 1, -0.4],
].map(axis => new THREE.Vector3(...axis).normalize())
const BURSTS = {
  cannon: { duration: 0.095, size: 0.112, spread: 0.28, sparks: 3, color: 0xffbf65 },
  enemyCannon: { duration: 0.085, size: 0.09, spread: 0.22, sparks: 2, color: 0xff5a47 },
  enemyMissile: { duration: 0.16, size: 0.18, spread: 0.35, sparks: 3, color: 0xff584c },
  enemyMissileHit: { duration: 0.35, size: 0.38, spread: 0.85, sparks: 6, color: 0xff4b37 },
  enemyMissileExpired: { duration: 0.23, size: 0.22, spread: 0.53, sparks: 4, color: 0xff7646 },
  playerHit: { duration: 0.22, size: 0.17, spread: 0.4, sparks: 4, color: 0xff7954 },
  ignition: { duration: 0.22, size: 0.21, spread: 0.54, sparks: 5, color: 0xffa34d },
  lock: { duration: 0.18, size: 0.17, spread: 0.48, sparks: 4, color: 0xff7260 },
  hit: { duration: 0.24, size: 0.19, spread: 0.48, sparks: 5, color: 0xffbf5d },
  impact: { duration: 0.17, size: 0.12, spread: 0.28, sparks: 3, color: 0xff9452 },
  missileImpact: { duration: 0.33, size: 0.32, spread: 0.75, sparks: 6, color: 0xffa04e },
  destroyed: { duration: 0.44, size: 0.47, spread: 1.05, sparks: 6, color: 0xff862e },
}

function joinParts(parts) {
  const geometry = mergeGeometries(parts)
  for (const part of parts) part.dispose()
  return geometry
}

function missileMeshParts(scene) {
  if (!scene) return []
  scene.updateWorldMatrix(true, true)
  const bounds = new THREE.Box3().setFromObject(scene)
  const length = bounds.max.y - bounds.min.y
  if (!Number.isFinite(length) || length <= 0) return []
  const center = bounds.getCenter(new THREE.Vector3())
  const scale = MISSILE_LENGTH / length
  const byMaterial = new Map()
  scene.traverse((mesh) => {
    if (!mesh.isMesh || Array.isArray(mesh.material)) return
    const shape = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
    shape.translate(-center.x, -center.y, -center.z).scale(scale, scale, scale)
    if (!byMaterial.has(mesh.material)) byMaterial.set(mesh.material, [])
    byMaterial.get(mesh.material).push(shape)
  })
  return Array.from(byMaterial).flatMap(([paint, shapes]) => {
    const combined = shapes.length > 1 ? mergeGeometries(shapes) : null
    if (!combined) return shapes.map(shape => ({ shape, paint }))
    for (const shape of shapes) shape.dispose()
    return [{ shape: combined, paint }]
  })
}

// Nose +X, right wing +Z. Keep the parts inside the unit sphere used for hits.
function enemyAirframe() {
  const hull = [
    new THREE.BoxGeometry(1.3, 0.24, 0.34).translate(-0.08, 0, 0),
    new THREE.BoxGeometry(0.46, 0.175, 0.228).translate(0.64, 0.012, 0),
  ]
  const trim = [new THREE.BoxGeometry(0.10, 0.133, 0.174).translate(0.89, 0.012, 0)]
  const engines = []
  for (const side of [-1, 1]) {
    hull.push(
      new THREE.BoxGeometry(0.42, 0.105, 0.69).rotateY(-side * 0.48).translate(-0.19, -0.035, side * 0.40),
      new THREE.BoxGeometry(0.23, 0.075, 0.34).rotateY(-side * 0.28).translate(-0.65, -0.026, side * 0.24),
      new THREE.BoxGeometry(0.26, 0.25, 0.065).rotateZ(0.27).translate(-0.63, 0.125, side * 0.24),
    )
    trim.push(
      new THREE.BoxGeometry(0.15, 0.038, 0.34).rotateY(-side * 0.48).translate(-0.25, 0.031, side * 0.47),
      new THREE.CylinderGeometry(0.05, 0.05, 0.052, 8).translate(-0.24, 0.145, side * 0.095),
      new THREE.CylinderGeometry(0.05, 0.05, 0.052, 8).translate(-0.41, 0.145, side * 0.095),
    )
    engines.push(new THREE.BoxGeometry(0.045, 0.095, 0.09).translate(-0.735, -0.014, side * 0.088))
  }
  return {
    hull: joinParts(hull),
    trim: joinParts(trim),
    engines: joinParts(engines),
    canopy: new THREE.BoxGeometry(0.35, 0.12, 0.25).translate(0.26, 0.136, 0),
  }
}

export function createAircraftWeaponVisuals(missileScene, mountParent, enemyScene, enemyMissileScene) {
  const group = new THREE.Group()
  group.name = 'AircraftWeaponVisuals'
  const geometry = {
    ...enemyAirframe(),
    brick: new THREE.BoxGeometry(1, 1, 1),
    point: new THREE.OctahedronGeometry(1),
    streak: new THREE.ConeGeometry(1, 1, 6).rotateZ(Math.PI),
    smoke: new THREE.IcosahedronGeometry(0.5),
    fallbackMissile: joinParts([
      new THREE.CylinderGeometry(0.052, 0.065, 0.50, 8).translate(0, -0.11, 0),
      new THREE.ConeGeometry(0.052, 0.22, 8).translate(0, 0.25, 0),
      new THREE.BoxGeometry(0.24, 0.10, 0.022).translate(0, -0.25, 0),
      new THREE.BoxGeometry(0.022, 0.10, 0.24).translate(0, -0.25, 0),
    ]),
  }
  const material = {
    hull: new THREE.MeshStandardMaterial({ color: 0x8e3447, roughness: 0.49 }),
    canopy: new THREE.MeshStandardMaterial({ color: 0x182d45, roughness: 0.34 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xefaa47, roughness: 0.44 }),
    engines: new THREE.MeshBasicMaterial({ color: 0xffd89a, toneMapped: false }),
    damaged: new THREE.MeshBasicMaterial({ color: 0xff7857, toneMapped: false }),
    tracer: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    enemyTracer: new THREE.MeshBasicMaterial({ color: 0xff5a47, toneMapped: false }),
    glow: new THREE.MeshBasicMaterial({
      color: 0xffac46, transparent: true, opacity: 0.40, depthWrite: false, toneMapped: false,
      blending: THREE.AdditiveBlending,
    }),
    fallbackMissile: new THREE.MeshStandardMaterial({ color: 0xf7f6ee, roughness: 0.44 }),
    incomingBody: new THREE.MeshStandardMaterial({ color: 0xc52a3c, emissive: 0x460811, roughness: 0.48 }),
    incomingGlow: new THREE.MeshBasicMaterial({
      color: 0xff2747, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false,
      blending: THREE.AdditiveBlending,
    }),
    plume: new THREE.MeshBasicMaterial({ color: 0xfff3bb, toneMapped: false }),
    exhaust: new THREE.MeshBasicMaterial({
      color: 0xff8b36, transparent: true, opacity: 0.52, depthWrite: false, toneMapped: false,
      blending: THREE.AdditiveBlending,
    }),
    smoke: new THREE.MeshBasicNodeMaterial({ color: 0xe9e1d5, transparent: true, depthWrite: false, toneMapped: false }),
    burst: new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.82, depthWrite: false, toneMapped: false,
    }),
  }
  const smokeOpacity = new THREE.InstancedBufferAttribute(new Float32Array(SMOKE_CAPACITY), 1).setUsage(THREE.DynamicDrawUsage)
  geometry.smoke.setAttribute('puffOpacity', smokeOpacity)
  material.smoke.opacityNode = attribute('puffOpacity', 'float')
  const importedMissile = missileMeshParts(missileScene)
  const importedEnemyMissile = missileMeshParts(enemyMissileScene)
  const enemyModels = createEnemyAircraftModels(enemyScene)
  const models = []
  function batch(shape, paint, capacity, name) {
    const mesh = new THREE.InstancedMesh(shape, paint, capacity)
    mesh.name = name
    mesh.count = 0
    mesh.frustumCulled = false
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    group.add(mesh)
    return mesh
  }

  const tracerStreaks = batch(geometry.streak, material.tracer, TRACER_CAPACITY, 'CannonTracerStreaks')
  const tracerHeads = batch(geometry.point, material.tracer, TRACER_CAPACITY, 'CannonTracerHeads')
  const tracerGlows = batch(geometry.streak, material.glow, TRACER_CAPACITY, 'CannonTracerGlow')
  const enemyTracers = batch(geometry.brick, material.enemyTracer, TRACER_CAPACITY, 'EnemyCannonTracers')
  const missileParts = importedMissile.length ? importedMissile : [{ shape: geometry.fallbackMissile, paint: material.fallbackMissile }]
  const missileRack = mountParent ? createAircraftMissileRack(missileParts, mountParent) : null
  const incoming = new THREE.Group()
  incoming.name = 'IncomingMissile'
  const incomingParts = importedEnemyMissile.length ? importedEnemyMissile
    : missileParts.map(({ shape }) => ({ shape, paint: material.incomingBody }))
  for (const { shape, paint } of incomingParts) incoming.add(new THREE.Mesh(shape, paint))
  const incomingCore = new THREE.Mesh(geometry.streak, material.plume)
  const incomingGlow = new THREE.Mesh(geometry.streak, material.incomingGlow)
  incoming.add(incomingCore, incomingGlow)
  group.add(incoming)
  const darts = missileParts.map(({ shape, paint }, i) => batch(shape, paint, MISSILE_CAPACITY, `MissileBody${i}`))
  const plumes = batch(geometry.streak, material.plume, MISSILE_CAPACITY, 'MissileFlames')
  const exhaust = batch(geometry.streak, material.exhaust, MISSILE_CAPACITY, 'MissileExhaust')
  const smoke = batch(geometry.smoke, material.smoke, SMOKE_CAPACITY, 'MissileSmoke')
  const flashes = batch(geometry.point, material.burst, BURST_CAPACITY, 'WeaponFlashes')
  const muzzleFlares = batch(geometry.streak, material.glow, BURST_CAPACITY, 'CannonMuzzleFlares')
  const sparks = batch(geometry.brick, material.burst, BURST_CAPACITY * SPARK_DIRECTIONS.length, 'WeaponSparks')
  const batches = [tracerStreaks, tracerHeads, tracerGlows, enemyTracers, ...darts, plumes, exhaust, smoke, flashes, muzzleFlares, sparks]
  const bursts = Array.from({ length: BURST_CAPACITY }, () => ({
    position: new THREE.Vector3(), direction: new THREE.Vector3(), style: null, elapsed: 0,
  }))
  const puffs = Array.from({ length: SMOKE_CAPACITY }, () => ({ position: new THREE.Vector3(), age: SMOKE_LIFE }))
  const lastPuffByMissile = new Map()
  const transform = new THREE.Object3D()
  const axis = new THREE.Vector3()
  const tint = new THREE.Color()
  const nozzle = new THREE.Vector3()
  const trailStep = new THREE.Vector3()
  const missileSide = new THREE.Vector3()
  const missileTop = new THREE.Vector3()
  const missileBasis = new THREE.Matrix4()
  let burstIndex = 0
  let puffIndex = 0
  let time = 0
  let disposed = false

  function place(mesh, index, position, width, length, offset = 0) {
    transform.position.copy(position).addScaledVector(axis, offset)
    transform.scale.set(width, length, width)
    transform.updateMatrix()
    mesh.setMatrixAt(index, transform.matrix)
  }

  function writeCount(mesh, count) {
    mesh.count = count
    if (!count) return
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  function prepareTargets(targets) {
    for (const [i, target] of targets.entries()) {
      let model = models[i]
      if (!model || model.modelIndex !== target.modelIndex) {
        model?.aircraft?.dispose()
        model?.root.removeFromParent()
        const root = new THREE.Group()
        root.name = 'EnemyAircraft'
        const aircraft = target.modelIndex == null ? null : enemyModels.create(target.modelIndex)
        let engines
        if (aircraft) root.add(aircraft.group)
        else {
          engines = new THREE.Mesh(geometry.engines, material.engines)
          root.add(
            new THREE.Mesh(geometry.hull, material.hull),
            new THREE.Mesh(geometry.trim, material.trim),
            new THREE.Mesh(geometry.canopy, material.canopy),
            engines,
          )
        }
        group.add(root)
        model = models[i] = { root, aircraft, engines, modelIndex: target.modelIndex }
      }
      target.muzzleMounts = model.aircraft?.muzzleMounts
    }
  }

  function updateTargets(targets, delta) {
    for (const [i, target] of targets.entries()) {
      const model = models[i]
      model.root.visible = target.health > 0
      model.root.position.copy(target.position)
      model.root.scale.setScalar(target.radius)
      model.root.rotation.set(target.roll ?? 0, -(target.yaw ?? 0), target.pitch ?? 0, FLIGHT_POSE_ORDER)
      if (model.engines) model.engines.material = target.health < target.maxHealth * 0.5 ? material.damaged : material.engines
      if (model.root.visible) model.aircraft?.update(delta, target.alerted && !target.extending ? 1 : 0.55)
    }
    for (let i = targets.length; i < models.length; i++) models[i].root.visible = false

  }

  function emitPuff(position) {
    const puff = puffs[puffIndex]
    puffIndex = (puffIndex + 1) % SMOKE_CAPACITY
    puff.position.copy(position)
    puff.age = 0
  }

  function updateSmokeTrail(missile) {
    const last = lastPuffByMissile.get(missile)
    if (!last) {
      emitPuff(nozzle)
      lastPuffByMissile.set(missile, nozzle.clone())
      return
    }
    trailStep.subVectors(nozzle, last)
    const distance = trailStep.length()
    if (distance > 6) {
      // A discontinuity (e.g. a map wrap) starts a fresh trail at the nozzle.
      last.copy(nozzle)
      emitPuff(nozzle)
      return
    }
    if (distance < SMOKE_SPACING) return
    trailStep.multiplyScalar(SMOKE_SPACING / distance)
    for (let i = 0; i < Math.floor(distance / SMOKE_SPACING); i++) {
      last.add(trailStep)
      emitPuff(last)
    }
  }

  function updateSmoke(delta) {
    let count = 0
    axis.set(0, 1, 0)
    for (let i = 0; i < puffs.length; i++) {
      const puff = puffs[i]
      puff.age += delta
      if (puff.age >= SMOKE_LIFE) continue
      const progress = puff.age / SMOKE_LIFE
      const expansion = 0.115 + 0.31 * progress
      transform.quaternion.setFromAxisAngle(UP, i * 2.4 + progress * 0.7)
      place(smoke, count, puff.position, expansion, expansion * 0.84, 0.11 * progress)
      smokeOpacity.setX(count++, 0.51 * (1 - progress) ** 1.5)
    }
    smokeOpacity.needsUpdate = true
    writeCount(smoke, count)
  }

  function updateIncomingMissile(missile) {
    incoming.visible = Boolean(missile)
    if (!missile) return
    axis.copy(missile.direction).normalize()
    incoming.position.copy(missile.position)
    incoming.quaternion.setFromUnitVectors(UP, axis)
    const length = 0.68 + 0.1 * Math.sin(time * 35)
    incomingGlow.position.y = -MISSILE_NOZZLE - length / 2
    incomingGlow.scale.set(0.12, length, 0.12)
    incomingCore.position.y = -MISSILE_NOZZLE - length * 0.3
    incomingCore.scale.set(0.055, length * 0.6, 0.055)
    nozzle.copy(missile.position).addScaledVector(axis, -MISSILE_NOZZLE - length * 0.8)
    updateSmokeTrail(missile)
  }

  function updateProjectiles(shots, missiles, incomingMissile) {
    const shotCount = Math.min(shots.length, TRACER_CAPACITY)
    const missileCount = Math.min(missiles.length, MISSILE_CAPACITY)
    let playerCount = 0
    let enemyCount = 0
    let poweredCount = 0
    for (let i = 0; i < shotCount; i++) {
      const shot = shots[shots.length - shotCount + i]
      axis.copy(shot.direction).normalize()
      transform.quaternion.setFromUnitVectors(UP, axis)
      if (shot.enemy) {
        place(enemyTracers, enemyCount++, shot.position, 0.027, 0.36, -0.11)
        continue
      }
      const trail = Math.max(0.04, Math.min(0.042, shot.age) * shot.velocity.length())
      const hotness = 1 - 0.45 * THREE.MathUtils.smoothstep(shot.age, 0.45, 0.95)
      place(tracerStreaks, playerCount, shot.position, 0.044 * hotness, trail, -trail * 0.5)
      place(tracerGlows, playerCount, shot.position, 0.092 * hotness, trail, -trail * 0.5)
      place(tracerHeads, playerCount, shot.position, 0.044 * hotness, 0.118 * hotness)
      tracerStreaks.setColorAt(playerCount, tint.copy(TRACER_COLOR).multiplyScalar(hotness))
      tracerHeads.setColorAt(playerCount, tint.copy(TRACER_HEAD).multiplyScalar(hotness))
      playerCount++
    }
    for (const missile of lastPuffByMissile.keys())
      if (missile !== incomingMissile && (!missile.powered || !missiles.includes(missile))) lastPuffByMissile.delete(missile)
    for (let i = 0; i < missileCount; i++) {
      const missile = missiles[missiles.length - missileCount + i]
      axis.copy(missile.direction).normalize()
      // Blockbench uses +Y at the nose and +Z on the studded face.
      missileSide.crossVectors(axis, missile.launchUp ?? UP)
      if (missileSide.lengthSq() < 1e-6)
        missileSide.crossVectors(axis, Math.abs(axis.y) > 0.9 ? X_AXIS : UP)
      missileSide.normalize()
      missileTop.crossVectors(missileSide, axis)
      transform.quaternion.setFromRotationMatrix(missileBasis.makeBasis(missileSide, axis, missileTop))
      const scale = missile.scale ?? 1
      for (const dart of darts) place(dart, i, missile.position, scale, scale)
      if (!missile.powered) continue
      const justLit = !lastPuffByMissile.has(missile)
      const coreLength = scale * (justLit ? 0.43 : 0.34) * (0.9 + 0.16 * Math.sin(time * 43 + i))
      const glowLength = coreLength * 2.25
      const tail = MISSILE_NOZZLE * scale
      place(plumes, poweredCount, missile.position, scale * (justLit ? 0.042 : 0.034), coreLength, -tail - coreLength * 0.5)
      place(exhaust, poweredCount, missile.position, scale * (justLit ? 0.125 : 0.09), glowLength, -tail - glowLength * 0.5)
      nozzle.copy(missile.position).addScaledVector(axis, -tail - coreLength * 0.78)
      updateSmokeTrail(missile)
      poweredCount++
    }
    writeCount(tracerStreaks, playerCount)
    writeCount(tracerHeads, playerCount)
    writeCount(tracerGlows, playerCount)
    writeCount(enemyTracers, enemyCount)
    for (const dart of darts) writeCount(dart, missileCount)
    writeCount(plumes, poweredCount)
    writeCount(exhaust, poweredCount)
    updateIncomingMissile(incomingMissile)
  }

  function updateBursts(delta, events) {
    for (const event of events) {
      const missileImpact = event.weapon === 'missile' && (event.type === 'hit' || event.type === 'impact')
      const style = missileImpact ? BURSTS.missileImpact : BURSTS[event.type]
      const position = event.position ?? event.target?.position
      if (!style || !position) continue
      const burst = bursts[burstIndex]
      burstIndex = (burstIndex + 1) % BURST_CAPACITY
      burst.position.copy(position)
      if (event.type === 'ignition' && event.direction)
        burst.position.addScaledVector(event.direction, -MISSILE_NOZZLE * (event.scale ?? 1))
      if ((event.type === 'cannon' || event.type === 'enemyCannon') && event.direction) burst.direction.copy(event.direction)
      else burst.direction.set(0, 0, 0)
      burst.style = style
      burst.elapsed = 0
    }
    let flashCount = 0
    let muzzleCount = 0
    let sparkCount = 0
    for (const burst of bursts) {
      const style = burst.style
      if (!style) continue
      const progress = burst.elapsed / style.duration
      if (progress >= 1) {
        burst.style = null
        continue
      }
      const remaining = 1 - progress
      const radius = style.size * remaining * (1 + progress * 0.7)
      tint.setHex(style.color).lerp(HOT, 0.6 * remaining)
      axis.set(0, 0, 0)
      transform.quaternion.identity()
      place(flashes, flashCount, burst.position, radius, radius)
      flashes.setColorAt(flashCount++, tint)
      if (burst.direction.lengthSq()) {
        axis.copy(burst.direction)
        transform.quaternion.setFromUnitVectors(UP, axis)
        const length = 0.42 * remaining
        place(muzzleFlares, muzzleCount++, burst.position, 0.11 * remaining, length, length * 0.46)
      }
      for (let n = 0; n < style.sparks; n++) {
        axis.copy(SPARK_DIRECTIONS[n]).addScaledVector(burst.direction, 1.55).normalize()
        transform.quaternion.setFromUnitVectors(UP, axis)
        const distance = style.spread * (1 - remaining * remaining)
        place(sparks, sparkCount, burst.position, 0.034 * remaining, 0.19 * remaining, distance)
        sparks.setColorAt(sparkCount++, tint)
      }
      burst.elapsed += delta
    }
    writeCount(flashes, flashCount)
    writeCount(muzzleFlares, muzzleCount)
    writeCount(sparks, sparkCount)
  }

  function update(delta, weapons, targets = [], events = [], incomingMissile = null) {
    if (disposed) return
    const elapsed = Number.isFinite(delta) ? Math.max(0, delta) : 0
    time += elapsed
    if (weapons?.missileRails) missileRack?.update(weapons.missileRails)
    updateTargets(targets, elapsed)
    updateProjectiles(weapons?.shots ?? [], weapons?.missiles ?? [], incomingMissile)
    updateSmoke(elapsed)
    updateBursts(elapsed, events)
  }

  function reset() {
    time = burstIndex = puffIndex = 0
    lastPuffByMissile.clear()
    incoming.visible = false
    for (const model of models) model.root.visible = false
    for (const mesh of batches) mesh.count = 0
    for (const burst of bursts) burst.style = null
    for (const puff of puffs) puff.age = SMOKE_LIFE
  }

  function dispose() {
    if (disposed) return
    disposed = true
    missileRack?.dispose()
    enemyModels.dispose()
    group.removeFromParent()
    group.clear()
    for (const mesh of batches) mesh.dispose()
    for (const { shape } of importedMissile) shape.dispose()
    for (const { shape } of importedEnemyMissile) shape.dispose()
    for (const shape of Object.values(geometry)) shape.dispose()
    for (const paint of Object.values(material)) paint.dispose()
  }

  reset()
  return { group, missileRack, enemyModelIndices: enemyModels.availableIndices, prepareTargets, update, reset, dispose }
}
