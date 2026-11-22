import * as THREE from 'three/webgpu'

const FLEET_NAMES = [
  '宽翼青灯机',
  '短舱青灯机',
  '蓝舱双推进机',
  '碟形侦察机',
  '橙芯双叉机',
  '红白楔形机',
]
const MUZZLE_ORDER = { L: 0, C: 1, R: 2 }

function normalizeAirframe(source) {
  const model = source.clone(true)
  const bounds = new THREE.Box3().setFromObject(model)
  if (bounds.isEmpty()) return null

  const center = bounds.getCenter(new THREE.Vector3())
  const point = new THREE.Vector3()
  let radiusSquared = 0
  // Fit the actual mesh to the hit sphere, including diagonal wing and tail tips.
  model.traverse((mesh) => {
    if (!mesh.isMesh) return
    const positions = mesh.geometry.getAttribute('position')
    if (!positions) return
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld)
      radiusSquared = Math.max(radiusSquared, point.distanceToSquared(center))
    }
  })
  if (!Number.isFinite(radiusSquared) || radiusSquared <= 0) return null

  model.position.sub(center)
  const airframe = new THREE.Group()
  airframe.name = `EnemyAirframe:${source.name}`
  // The exported noses face +Z and the flight pose expects +X forward.
  airframe.rotation.y = Math.PI / 2
  airframe.scale.setScalar(1 / Math.sqrt(radiusSquared))
  airframe.add(model)
  return airframe
}

/** Authored socket quaternions point their glTF local +Z along the emission direction. */
export function getEnemySocketWorldPose(socket, position, direction) {
  socket.updateWorldMatrix(true, false)
  position.setFromMatrixPosition(socket.matrixWorld)
  direction.set(0, 0, 1).transformDirection(socket.matrixWorld)
}

function createExhaustResources() {
  const profile = [
    [0, 0], [0.78, 0], [1, 0.12], [0.67, 0.45], [0.29, 0.77], [0, 1],
  ].map(([radius, height]) => new THREE.Vector2(radius, height))
  return {
    shape: new THREE.LatheGeometry(profile, 8).rotateX(Math.PI / 2),
    corePaint: new THREE.MeshBasicMaterial({ color: 0xffedaf, toneMapped: false }),
    haloPaint: new THREE.MeshBasicMaterial({
      color: 0xff6b26,
      transparent: true,
      opacity: 0.56,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  }
}

function mountExhaust(socket, resources, phase) {
  const group = new THREE.Group()
  group.name = 'EnemyExhaust'
  group.scale.setScalar(1 / socket.getWorldScale(new THREE.Vector3()).x)
  const core = new THREE.Mesh(resources.shape, resources.corePaint)
  const halo = new THREE.Mesh(resources.shape, resources.haloPaint)
  group.add(core, halo)
  socket.add(group)

  return {
    group,
    update(time, throttle) {
      const ripple = 1 + 0.09 * Math.sin(time * 36 + phase) + 0.04 * Math.sin(time * 83 + phase)
      const length = (0.19 + throttle * 0.24) * ripple
      const radius = (0.061 + throttle * 0.029) / ripple
      core.scale.set(radius * 0.62, radius * 0.62, length * 0.65)
      halo.scale.set(radius, radius, length)
    },
  }
}

/** The resource loader owns the mesh geometries and materials shared by the cloned airframes. */
export function createEnemyAircraftModels(scene) {
  const airframes = FLEET_NAMES.map((name) => {
    const source = scene?.getObjectByName(name)
    return source ? normalizeAirframe(source) : null
  })
  const availableIndices = airframes.flatMap((airframe, index) => airframe ? [index] : [])
  const active = new Set()
  let exhaustResources
  let disposed = false

  function create(index = 0) {
    if (disposed) return null
    const frameIndex = THREE.MathUtils.euclideanModulo(index, airframes.length)
    const airframe = airframes[frameIndex]
    if (!airframe) return null
    const group = airframe.clone(true)
    const muzzles = []
    const engines = []
    group.traverse((socket) => {
      if (socket.userData.marker_type === 'muzzle') muzzles.push(socket)
      if (socket.userData.marker_type === 'engine') engines.push(socket)
    })
    muzzles.sort((a, b) => (MUZZLE_ORDER[a.userData.side] ?? 3) - (MUZZLE_ORDER[b.userData.side] ?? 3))
    const muzzleMounts = muzzles.map((socket) => {
      const position = new THREE.Vector3()
      const direction = new THREE.Vector3()
      getEnemySocketWorldPose(socket, position, direction)
      return { position, direction }
    })

    if (engines.length) exhaustResources ??= createExhaustResources()
    const exhausts = engines.map((socket, i) => mountExhaust(socket, exhaustResources, index * 1.7 + i * 2.1))
    let elapsed = 0
    const aircraft = {
      group,
      muzzles,
      muzzleMounts,
      exhausts: exhausts.map(effect => effect.group),
      update(dt, throttle = 1) {
        elapsed += dt
        const load = THREE.MathUtils.clamp(throttle, 0, 1)
        for (const effect of exhausts) effect.update(elapsed, load)
      },
      dispose() {
        if (active.delete(aircraft)) group.removeFromParent()
      },
    }
    aircraft.update(0)
    active.add(aircraft)
    return aircraft
  }

  function dispose() {
    if (disposed) return
    disposed = true
    for (const aircraft of active) aircraft.dispose()
    exhaustResources?.shape.dispose()
    exhaustResources?.corePaint.dispose()
    exhaustResources?.haloPaint.dispose()
  }

  return { count: availableIndices.length, availableIndices, create, dispose }
}
