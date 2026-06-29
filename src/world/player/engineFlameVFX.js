import * as THREE from 'three/webgpu'
import {
  clamp,
  color,
  float,
  mix,
  positionLocal,
  sin,
  smoothstep,
  time,
  uniform,
  uv
} from 'three/tsl'

export const DEFAULT_ENGINE_FLAME_CONFIG = {
  enabled: true,
  intensity: 1.15,
  length: 0.28,
  radius: 0.03,
  speed: 1.05,
  respondToThrusters: true,
  respondToSpeed: true,
  minIntensity: 0.12
}

let sharedConeGeometry = null
let sharedRingGeometry = null

function getConeGeometry() {
  if (!sharedConeGeometry) {
    sharedConeGeometry = new THREE.ConeGeometry(1, 1, 96, 36, true)
  }
  return sharedConeGeometry
}

function getRingGeometry() {
  if (!sharedRingGeometry) {
    sharedRingGeometry = new THREE.TorusGeometry(1, 0.018, 8, 64)
  }
  return sharedRingGeometry
}

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function normalizeEngineFlameConfig(config = {}) {
  return {
    enabled: config.enabled !== false,
    intensity: positiveNumber(config.intensity, DEFAULT_ENGINE_FLAME_CONFIG.intensity),
    length: positiveNumber(config.length, DEFAULT_ENGINE_FLAME_CONFIG.length),
    radius: positiveNumber(config.radius, DEFAULT_ENGINE_FLAME_CONFIG.radius),
    speed: positiveNumber(config.speed, DEFAULT_ENGINE_FLAME_CONFIG.speed),
    respondToThrusters: config.respondToThrusters !== false,
    respondToSpeed: config.respondToSpeed !== false,
    minIntensity: Number.isFinite(config.minIntensity)
      ? Math.max(0, config.minIntensity)
      : DEFAULT_ENGINE_FLAME_CONFIG.minIntensity
  }
}

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1)
}

function blendResponse(min, ratio) {
  return min + (1 - min) * clamp01(ratio)
}

export function resolveFlameResponseScale(config, speedRatio, thrusterIntensity = 1) {
  const min = config.minIntensity
  const speedScale = config.respondToSpeed ? blendResponse(min, speedRatio) : 1
  const thrusterScale = config.respondToThrusters ? blendResponse(min, thrusterIntensity) : 1
  const combined = speedScale * thrusterScale

  return {
    intensity: combined,
    length: combined,
    radius: combined,
    speed: combined
  }
}

export function applyFlameResponseScale(config, scale) {
  return {
    ...config,
    intensity: config.intensity * scale.intensity,
    length: config.length * scale.length,
    radius: config.radius * scale.radius,
    speed: config.speed * scale.speed
  }
}

function createFlameMaterial(sharedState, { base, mid, tip, opacity, noiseOffset }) {
  const uOpacity = uniform(opacity)
  const uNoiseOffset = uniform(noiseOffset)

  const progress = clamp(positionLocal.y.add(0.5), 0.0, 1.0)
  const bandA = sin(
    uv().x.mul(42.0)
      .add(progress.mul(14.0))
      .sub(time.mul(sharedState.speed).mul(9.0))
      .add(uNoiseOffset)
  ).mul(0.5).add(0.5)

  const bandB = sin(
    uv().x.mul(17.0)
      .sub(progress.mul(23.0))
      .add(time.mul(sharedState.speed).mul(14.5))
      .add(uNoiseOffset.mul(2.1))
  ).mul(0.5).add(0.5)

  const flameNoise = bandA.mul(0.58).add(bandB.mul(0.42))
  const streaks = smoothstep(0.16, 0.92, flameNoise)

  const baseFade = smoothstep(0.0, 0.045, progress)
  const tipFade = float(1.0).sub(smoothstep(0.50, 1.0, progress))
  const breakup = mix(float(1.0), streaks, progress.mul(0.88))
  const flicker = sin(time.mul(sharedState.speed).mul(31.0).add(uNoiseOffset)).mul(0.075).add(0.925)

  const alpha = uOpacity
    .mul(sharedState.intensity)
    .mul(baseFade)
    .mul(tipFade)
    .mul(breakup)
    .mul(flicker)

  const hotColor = mix(color(base), color(mid), smoothstep(0.0, 0.42, progress))
  const finalColor = mix(hotColor, color(tip), smoothstep(0.38, 1.0, progress))

  const material = new THREE.MeshBasicNodeMaterial()
  material.colorNode = finalColor.mul(sharedState.intensity.mul(0.35).add(0.85))
  material.opacityNode = alpha
  material.transparent = true
  material.depthWrite = false
  material.side = THREE.DoubleSide
  material.blending = THREE.AdditiveBlending
  material.forceSinglePass = false
  return material
}

function createShockRings(parent) {
  const rings = []
  const geometry = getRingGeometry()

  for (let i = 0; i < 7; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffb45c,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })

    const ring = new THREE.Mesh(geometry, material)
    ring.userData.phaseOffset = i / 7
    parent.add(ring)
    rings.push(ring)
  }

  return rings
}

function animateShockRings(rings, elapsed, values, pulse) {
  for (const ring of rings) {
    const phase = (elapsed * values.speed * 0.72 + ring.userData.phaseOffset) % 1
    const z = -(0.08 + phase * values.length * 0.86)
    const radius = values.radius * (1.02 - phase * 0.74) * pulse
    const opacity = (1.0 - phase) * 0.11 * values.intensity

    ring.position.z = z
    ring.scale.set(radius, radius, radius)
    ring.material.opacity = Math.max(opacity, 0.0)
  }
}

const FLAME_LAYERS = [
  {
    name: 'outer_orange_flame',
    radiusMul: 1.0,
    lengthMul: 1.0,
    material: {
      base: '#ff5a0a',
      mid: '#ff9f1a',
      tip: '#b91c1c',
      opacity: 0.38,
      noiseOffset: 0.0
    }
  },
  {
    name: 'middle_yellow_flame',
    radiusMul: 0.58,
    lengthMul: 0.77,
    material: {
      base: '#fff1a8',
      mid: '#ffb11b',
      tip: '#ff5f0f',
      opacity: 0.58,
      noiseOffset: 1.7
    }
  },
  {
    name: 'inner_white_hot_core',
    radiusMul: 0.24,
    lengthMul: 0.48,
    material: {
      base: '#ffffff',
      mid: '#ffe36e',
      tip: '#ff9a16',
      opacity: 0.80,
      noiseOffset: 3.2
    }
  }
]

export function createEngineFlameVFX(parent, config = {}) {
  const settings = normalizeEngineFlameConfig(config)
  const root = new THREE.Group()
  root.name = 'EngineFlameVFX'
  parent.add(root)

  const sharedState = {
    intensity: uniform(settings.intensity),
    speed: uniform(settings.speed)
  }

  const coneGeometry = getConeGeometry()

  const flameLayers = FLAME_LAYERS.map((layer) => {
    const mesh = new THREE.Mesh(
      coneGeometry,
      createFlameMaterial(sharedState, layer.material)
    )
    mesh.name = layer.name
    // fly.glb engine empties exhaust along local -Z (forward is +Z).
    mesh.rotation.x = -Math.PI * 0.5
    root.add(mesh)
    return { ...layer, mesh }
  })

  const shockRings = createShockRings(root)

  function applyShape(values, pulse = 1.0) {
    sharedState.intensity.value = values.intensity
    sharedState.speed.value = values.speed

    for (const layer of flameLayers) {
      const length = values.length * layer.lengthMul * pulse
      const radiusPulse = 1.0 + (pulse - 1.0) * 0.65
      const radius = values.radius * layer.radiusMul * radiusPulse
      layer.mesh.scale.set(radius, length, radius)
      layer.mesh.position.z = -length * 0.5
    }
  }

  function update(elapsed, values = settings) {
    const pulse = 1.0
      + Math.sin(elapsed * 18.0) * 0.040
      + Math.sin(elapsed * 37.0) * 0.018

    applyShape(values, pulse)
    animateShockRings(shockRings, elapsed, values, pulse)
  }

  function setVisible(visible) {
    root.visible = visible
  }

  function dispose() {
    parent.remove(root)

    for (const layer of flameLayers) {
      layer.mesh.material.dispose()
    }

    for (const ring of shockRings) {
      ring.material.dispose()
    }
  }

  applyShape(settings)

  return {
    root,
    settings,
    applyShape,
    update,
    setVisible,
    dispose
  }
}
