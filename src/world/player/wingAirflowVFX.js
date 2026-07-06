import * as THREE from 'three/webgpu'

const tmpV0 = new THREE.Vector3()
const tmpV1 = new THREE.Vector3()
const tmpV2 = new THREE.Vector3()
const tmpV3 = new THREE.Vector3()
const tmpV4 = new THREE.Vector3()
const tmpV5 = new THREE.Vector3()
const tmpV6 = new THREE.Vector3()
const tmpV7 = new THREE.Vector3()
const tmpQuat0 = new THREE.Quaternion()
const tmpMatrix0 = new THREE.Matrix4()

export const DEFAULT_WING_AIRFLOW_CONFIG = {
  enabled: true,
  anchors: {
    wingHalfWidth: 0.78,
    outwardOffset: 0.12,
    backOffset: -0.10,
    upOffset: 0.03
  },
  sampleLife: 0.56,
  emitInterval: 0.034,
  minEmitDistance: 0.045,
  capacity: 32,
  maxSamples: 18,
  minSpeedRatio: 0.04,
  breakAngleDeg: 68,
  width: 0.09,
  tipWidthRatio: 0,
  bellPower: 1.35,
  verticalOffset: 0.045,
  opacity: 0.54,
  speedOpacity: 0.48,
  accelerationBoost: 0.35,
  pulseStrength: 0.01,
  color: '#f7fbff',
  additive: false,
  showAnchors: false
}

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function nonNegativeNumber(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function clampNonNegative(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback
}

function clamp01(value) {
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1)
}

function clampedNumber(value, fallback) {
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : fallback, 0, 1)
}

function roundStable(value) {
  return Math.round(value * 1e12) / 1e12
}

function normalizeColor(value, fallback) {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value.trim())
    ? value.trim()
    : fallback
}

export function normalizeWingAirflowConfig(config = {}) {
  const defaults = DEFAULT_WING_AIRFLOW_CONFIG
  const anchors = config.anchors ?? {}
  const capacity = Math.max(2, Math.floor(positiveNumber(config.capacity, defaults.capacity)))
  const maxSamples = Math.max(2, Math.floor(positiveNumber(config.maxSamples, defaults.maxSamples)))

  return {
    enabled: config.enabled !== false,
    anchors: {
      wingHalfWidth: positiveNumber(anchors.wingHalfWidth, defaults.anchors.wingHalfWidth),
      outwardOffset: clampNonNegative(anchors.outwardOffset, defaults.anchors.outwardOffset),
      backOffset: Number.isFinite(anchors.backOffset) ? anchors.backOffset : defaults.anchors.backOffset,
      upOffset: Number.isFinite(anchors.upOffset) ? anchors.upOffset : defaults.anchors.upOffset
    },
    sampleLife: positiveNumber(config.sampleLife, defaults.sampleLife),
    emitInterval: positiveNumber(config.emitInterval, defaults.emitInterval),
    minEmitDistance: nonNegativeNumber(config.minEmitDistance, defaults.minEmitDistance),
    capacity,
    maxSamples: Math.min(maxSamples, capacity),
    minSpeedRatio: clampedNumber(config.minSpeedRatio, defaults.minSpeedRatio),
    breakAngleDeg: positiveNumber(config.breakAngleDeg, defaults.breakAngleDeg),
    width: positiveNumber(config.width, defaults.width),
    tipWidthRatio: clampedNumber(config.tipWidthRatio, defaults.tipWidthRatio),
    bellPower: positiveNumber(config.bellPower, defaults.bellPower),
    verticalOffset: Number.isFinite(config.verticalOffset) ? config.verticalOffset : defaults.verticalOffset,
    opacity: clampedNumber(config.opacity, defaults.opacity),
    speedOpacity: nonNegativeNumber(config.speedOpacity, defaults.speedOpacity),
    accelerationBoost: nonNegativeNumber(config.accelerationBoost, defaults.accelerationBoost),
    pulseStrength: nonNegativeNumber(config.pulseStrength, defaults.pulseStrength),
    color: normalizeColor(config.color, defaults.color),
    additive: config.additive === true,
    showAnchors: config.showAnchors === true
  }
}

export function computeAirflowSpeedRatio(state, maxSpeed) {
  if (!Number.isFinite(maxSpeed) || maxSpeed <= 0 || !state?.velocity) {
    return 0
  }
  return clamp01(state.velocity.length() / maxSpeed)
}

export function resolveAirflowOpacity(config, { speedRatio = 0, thrustInput = 0, elapsed = 0 } = {}) {
  const pulse = 1 + Math.sin(elapsed * 10) * config.pulseStrength
  const speedBoost = clamp01(speedRatio) * config.speedOpacity
  const thrustBoost = Math.max(0, thrustInput) * config.accelerationBoost * clamp01(speedRatio)
  return roundStable(clamp01((config.opacity + speedBoost + thrustBoost) * pulse))
}

export function canConnectAirflowSamples(tangentA, tangentB, breakAngleDeg) {
  const dot = THREE.MathUtils.clamp(tangentA.dot(tangentB), -1, 1)
  return Math.acos(dot) <= THREE.MathUtils.degToRad(breakAngleDeg)
}

export function computeAirflowHalfWidth(config, { age = 0, speedRatio = 0 } = {}) {
  const life = clamp01(age / config.sampleLife)
  const bell = Math.pow(Math.max(0, Math.sin(Math.PI * life)), config.bellPower)
  const widthScale = THREE.MathUtils.lerp(config.tipWidthRatio, 1, bell)
  return config.width * widthScale * (0.72 + clamp01(speedRatio) * 0.28) * 0.5
}

export class WingAirflowSide {
  constructor({ name, config }) {
    this.name = name
    this.config = config
    this.capacity = config.capacity
    this.head = 0
    this.count = 0
    this.timeSinceEmit = 0
    this.hasLastEmit = false
    this.lastEmit = new THREE.Vector3()
    this.position = new Float32Array(this.capacity * 3)
    this.tangent = new Float32Array(this.capacity * 3)
    this.age = new Float32Array(this.capacity)
    this.speed = new Float32Array(this.capacity)
  }

  clear() {
    this.head = 0
    this.count = 0
    this.timeSinceEmit = 0
    this.hasLastEmit = false
    this.lastEmit.set(0, 0, 0)
    this.position.fill(0)
    this.tangent.fill(0)
    this.age.fill(0)
    this.speed.fill(0)
  }

  logicalIndex(offset) {
    return (this.head + offset) % this.capacity
  }

  tailIndex() {
    return this.logicalIndex(this.count - 1)
  }

  clampCount() {
    this.count = Math.min(this.count, this.config.maxSamples)
  }

  advanceAges(delta) {
    const ageDelta = nonNegativeNumber(delta, 0)

    for (let offset = 0; offset < this.count; offset++) {
      this.age[this.logicalIndex(offset)] += ageDelta
    }

    while (this.count > 0 && this.age[this.tailIndex()] >= this.config.sampleLife) {
      this.count--
    }
  }

  emit(position, tangent, speedRatio) {
    const nextHead = (this.head - 1 + this.capacity) % this.capacity
    const base = nextHead * 3
    const tangentLengthSq = tangent.lengthSq()
    const tangentScale = tangentLengthSq > 0 ? 1 / Math.sqrt(tangentLengthSq) : 0

    this.head = nextHead
    this.position[base] = position.x
    this.position[base + 1] = position.y
    this.position[base + 2] = position.z
    this.tangent[base] = tangentLengthSq > 0 ? tangent.x * tangentScale : 1
    this.tangent[base + 1] = tangentLengthSq > 0 ? tangent.y * tangentScale : 0
    this.tangent[base + 2] = tangentLengthSq > 0 ? tangent.z * tangentScale : 0
    this.age[nextHead] = 0
    this.speed[nextHead] = clamp01(speedRatio)
    this.count = Math.min(this.count + 1, this.capacity)
    this.clampCount()
    this.lastEmit.copy(position)
    this.hasLastEmit = true
  }

  maybeEmit({ position, tangent, speedRatio, delta }) {
    this.advanceAges(delta)
    this.timeSinceEmit += nonNegativeNumber(delta, 0)

    if (speedRatio <= this.config.minSpeedRatio) {
      return
    }

    if (this.timeSinceEmit < this.config.emitInterval) {
      return
    }

    if (this.hasLastEmit && position.distanceTo(this.lastEmit) < this.config.minEmitDistance) {
      return
    }

    this.emit(position, tangent, speedRatio)
    this.timeSinceEmit = 0
  }

  getPosition(index, target) {
    // Accessors accept physical ring-buffer slots; callers resolve logical offsets first.
    const base = index * 3
    return target.set(this.position[base], this.position[base + 1], this.position[base + 2])
  }

  getTangent(index, target) {
    const base = index * 3
    return target.set(this.tangent[base], this.tangent[base + 1], this.tangent[base + 2])
  }
}

export function createAirflowTexture() {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null
  }

  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 8
  const context = canvas.getContext('2d')

  if (!context) {
    return null
  }

  const gradient = context.createLinearGradient(0, 0, canvas.width, 0)
  gradient.addColorStop(0, 'rgba(255,255,255,0)')
  gradient.addColorStop(0.42, 'rgba(255,255,255,0.88)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, canvas.width, canvas.height)

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}

function createRibbonMesh(name, config, texture) {
  const quadCapacity = Math.max(1, config.capacity - 1)
  const positions = new Float32Array(quadCapacity * 4 * 3)
  const uvs = new Float32Array(quadCapacity * 4 * 2)
  const indices = new Uint16Array(quadCapacity * 6)

  for (let i = 0; i < quadCapacity; i++) {
    const vertex = i * 4
    const index = i * 6

    indices[index] = vertex
    indices[index + 1] = vertex + 1
    indices[index + 2] = vertex + 2
    indices[index + 3] = vertex + 2
    indices[index + 4] = vertex + 1
    indices[index + 5] = vertex + 3
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2).setUsage(THREE.DynamicDrawUsage))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.setDrawRange(0, 0)

  const material = new THREE.MeshBasicMaterial({
    color: config.color,
    map: texture,
    transparent: true,
    opacity: config.opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: config.additive ? THREE.AdditiveBlending : THREE.NormalBlending
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  mesh.renderOrder = 10
  mesh.frustumCulled = false
  mesh.visible = false

  return mesh
}

function createAnchorMarker(name, config) {
  const geometry = new THREE.SphereGeometry(0.045, 8, 4)
  const material = new THREE.MeshBasicMaterial({
    color: config.color,
    transparent: true,
    opacity: 0.75,
    depthWrite: false
  })
  const marker = new THREE.Mesh(geometry, material)
  marker.name = name
  marker.renderOrder = 11
  marker.frustumCulled = false
  marker.visible = false
  return marker
}

function writePosition(array, vertexIndex, position, tangent, camera, halfWidth) {
  tmpV5.copy(camera.position).sub(position)

  if (tmpV5.lengthSq() <= 1e-8) {
    tmpV5.set(0, 1, 0)
  } else {
    tmpV5.normalize()
  }

  tmpV6.copy(tangent).cross(tmpV5)

  if (tmpV6.lengthSq() <= 1e-8) {
    tmpV6.set(0, 1, 0).cross(tangent)
  }

  if (tmpV6.lengthSq() <= 1e-8) {
    tmpV6.set(1, 0, 0)
  } else {
    tmpV6.normalize()
  }

  tmpV7.copy(tmpV6).multiplyScalar(halfWidth)
  const base = vertexIndex * 3
  array[base] = position.x + tmpV7.x
  array[base + 1] = position.y + tmpV7.y
  array[base + 2] = position.z + tmpV7.z
  array[base + 3] = position.x - tmpV7.x
  array[base + 4] = position.y - tmpV7.y
  array[base + 5] = position.z - tmpV7.z
}

function writeRibbonQuad(side, runtime, quadIndex, idx0, idx1, camera, config) {
  side.getPosition(idx0, tmpV0)
  side.getTangent(idx0, tmpV2)
  side.getPosition(idx1, tmpV1)
  side.getTangent(idx1, tmpV3)

  if (!canConnectAirflowSamples(tmpV2, tmpV3, config.breakAngleDeg)) {
    return false
  }

  tmpV0.y += config.verticalOffset
  tmpV1.y += config.verticalOffset

  const vertex = quadIndex * 4
  const positions = runtime.positionArray
  const uvs = runtime.uvArray
  const halfWidth0 = computeAirflowHalfWidth(config, { age: side.age[idx0], speedRatio: side.speed[idx0] })
  const halfWidth1 = computeAirflowHalfWidth(config, { age: side.age[idx1], speedRatio: side.speed[idx1] })

  writePosition(positions, vertex, tmpV0, tmpV2, camera, halfWidth0)
  writePosition(positions, vertex + 2, tmpV1, tmpV3, camera, halfWidth1)

  const uvBase = vertex * 2
  uvs[uvBase] = 0
  uvs[uvBase + 1] = 0
  uvs[uvBase + 2] = 0
  uvs[uvBase + 3] = 1
  uvs[uvBase + 4] = 1
  uvs[uvBase + 5] = 0
  uvs[uvBase + 6] = 1
  uvs[uvBase + 7] = 1

  return true
}

function getRibbonRuntime(mesh) {
  return {
    positionArray: mesh.geometry.getAttribute('position').array,
    uvArray: mesh.geometry.getAttribute('uv').array
  }
}

function rebuildRibbon(side, runtime, camera, config) {
  if (!camera || side.count < 2) {
    runtime.mesh.geometry.setDrawRange(0, 0)
    runtime.mesh.visible = false
    return
  }

  let quadCount = 0
  const maxSegments = Math.min(side.count - 1, config.maxSamples - 1, config.capacity - 1)

  for (let i = 0; i < maxSegments; i++) {
    const idx0 = side.logicalIndex(i)
    const idx1 = side.logicalIndex(i + 1)

    if (writeRibbonQuad(side, runtime, quadCount, idx0, idx1, camera, config)) {
      quadCount++
    }
  }

  const positionAttribute = runtime.mesh.geometry.getAttribute('position')
  const uvAttribute = runtime.mesh.geometry.getAttribute('uv')
  positionAttribute.needsUpdate = true
  uvAttribute.needsUpdate = true
  runtime.mesh.geometry.setDrawRange(0, quadCount * 6)
  runtime.mesh.visible = quadCount > 0
}

function updateRootWorldIsolation(root, parent) {
  parent.updateWorldMatrix(true, false)
  root.matrix.copy(tmpMatrix0.copy(parent.matrixWorld).invert())
  root.matrixWorldNeedsUpdate = true
}

function resolveAirflowTangent(parent, state, target) {
  if (state?.velocity && state.velocity.lengthSq() > 1e-8) {
    return target.copy(state.velocity).normalize()
  }

  parent.getWorldQuaternion(tmpQuat0)
  return target.set(0, 0, -1).applyQuaternion(tmpQuat0).normalize()
}

function resolveAnchor(parent, config, sideSign, target) {
  const anchors = config.anchors
  target.set(
    sideSign * (anchors.wingHalfWidth + anchors.outwardOffset),
    anchors.upOffset,
    anchors.backOffset
  )
  return parent.localToWorld(target)
}

function updateRibbonMaterial(mesh, config, opacity) {
  const nextBlending = config.additive ? THREE.AdditiveBlending : THREE.NormalBlending

  mesh.material.color.set(config.color)
  mesh.material.opacity = opacity

  if (mesh.material.blending !== nextBlending) {
    mesh.material.blending = nextBlending
    mesh.material.needsUpdate = true
  }
}

function updateAnchorMarker(marker, position, config) {
  marker.position.copy(position)
  marker.material.color.set(config.color)
  marker.visible = config.showAnchors === true
}

export function createWingAirflowVFX(parent, rawConfig = {}) {
  const config = normalizeWingAirflowConfig(rawConfig)
  const root = new THREE.Group()
  root.name = 'WingAirflowVFX'
  root.matrixAutoUpdate = false

  const texture = createAirflowTexture()
  const left = new WingAirflowSide({ name: 'left', config })
  const right = new WingAirflowSide({ name: 'right', config })
  const leftMesh = createRibbonMesh('WingAirflowVFXLeft', config, texture)
  const rightMesh = createRibbonMesh('WingAirflowVFXRight', config, texture)
  const leftAnchorMarker = createAnchorMarker('WingAirflowVFXLeftAnchor', config)
  const rightAnchorMarker = createAnchorMarker('WingAirflowVFXRightAnchor', config)
  const leftRuntime = { mesh: leftMesh, ...getRibbonRuntime(leftMesh) }
  const rightRuntime = { mesh: rightMesh, ...getRibbonRuntime(rightMesh) }

  root.add(leftMesh, rightMesh, leftAnchorMarker, rightAnchorMarker)
  parent.add(root)
  updateRootWorldIsolation(root, parent)
  root.visible = config.enabled

  const api = {
    root,
    config,
    left,
    right,
    leftMesh,
    rightMesh,
    leftAnchorMarker,
    rightAnchorMarker,
    disposed: false,
    clampSamples() {
      left.clampCount()
      right.clampCount()
    },
    update({ delta = 0, elapsed = 0, camera, state, maxSpeed = 1, input = {} } = {}) {
      if (api.disposed) {
        return
      }

      updateRootWorldIsolation(root, parent)

      if (!config.enabled || !root.visible) {
        left.clear()
        right.clear()
        leftMesh.visible = false
        rightMesh.visible = false
        leftAnchorMarker.visible = false
        rightAnchorMarker.visible = false
        return
      }

      const speedRatio = computeAirflowSpeedRatio(state, maxSpeed)
      resolveAirflowTangent(parent, state, tmpV4)
      const leftAnchor = resolveAnchor(parent, config, -1, tmpV0)
      const rightAnchor = resolveAnchor(parent, config, 1, tmpV1)
      updateAnchorMarker(leftAnchorMarker, leftAnchor, config)
      updateAnchorMarker(rightAnchorMarker, rightAnchor, config)

      left.maybeEmit({
        position: leftAnchor,
        tangent: tmpV4,
        speedRatio,
        delta
      })
      right.maybeEmit({
        position: rightAnchor,
        tangent: tmpV4,
        speedRatio,
        delta
      })
      api.clampSamples()

      const opacity = resolveAirflowOpacity(config, {
        speedRatio,
        thrustInput: input.thrustInput ?? 0,
        elapsed
      })
      updateRibbonMaterial(leftMesh, config, opacity)
      updateRibbonMaterial(rightMesh, config, opacity)
      rebuildRibbon(left, leftRuntime, camera, config)
      rebuildRibbon(right, rightRuntime, camera, config)
    },
    clear() {
      left.clear()
      right.clear()
      leftMesh.geometry.setDrawRange(0, 0)
      rightMesh.geometry.setDrawRange(0, 0)
      leftMesh.visible = false
      rightMesh.visible = false
      leftAnchorMarker.visible = false
      rightAnchorMarker.visible = false
    },
    setVisible(visible) {
      root.visible = visible === true
      if (!root.visible) {
        api.clear()
      }
    },
    dispose() {
      if (api.disposed) {
        return
      }

      api.clear()
      parent.remove(root)
      leftMesh.geometry.dispose()
      rightMesh.geometry.dispose()
      leftAnchorMarker.geometry.dispose()
      rightAnchorMarker.geometry.dispose()
      leftMesh.material.dispose()
      rightMesh.material.dispose()
      leftAnchorMarker.material.dispose()
      rightAnchorMarker.material.dispose()
      texture?.dispose()
      root.clear()
      api.disposed = true
    }
  }

  return api
}
