import * as THREE from 'three/webgpu'

export const DEFAULT_ENGINE_FLAME_CONFIG = {
  enabled: true,
  intensity: 1.15,
  length: 0.38,
  radius: 0.036,
  speed: 1.05,
  respondToThrusters: true,
  respondToSpeed: true,
  minIntensity: 0.72,
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
      ? clamp01(config.minIntensity)
      : DEFAULT_ENGINE_FLAME_CONFIG.minIntensity,
  }
}

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1)
}

function blendResponse(min, ratio) {
  return min + (1 - min) * clamp01(ratio)
}

export function resolveFlameResponseScale(config, speedRatio, boost = 1) {
  const speed = clamp01(speedRatio)
  const thrust = clamp01(boost)
  const drive = config.respondToThrusters
    ? (config.respondToSpeed ? 0.3 * speed + 0.7 * thrust : thrust)
    : (config.respondToSpeed ? speed : 1)
  // A running engine keeps its outlet width at cruise. Boost mostly extends
  // the plume; multiplying speed and throttle used to shrink all three axes.
  return {
    intensity: blendResponse(config.minIntensity, drive),
    length: blendResponse(0.43, drive),
    radius: blendResponse(0.8, drive),
    speed: blendResponse(0.65, drive),
  }
}

export function applyFlameResponseScale(config, scale) {
  return {
    ...config,
    intensity: config.intensity * scale.intensity,
    length: config.length * scale.length,
    radius: config.radius * scale.radius,
    speed: config.speed * scale.speed,
  }
}

// One bright central tongue and four narrower shoulders meet at the outlet.
// Dimensions across the exhaust are in nozzle radii; depth is a fraction of plume length.
const FLAME_BRICKS = [
  // x, y, width, height, start, end, color
  [0, 0, 1.04, 1.12, 0, 0.26, 0xfff8d2],
  [-0.68, 0, 0.32, 0.82, 0.04, 0.32, 0xffc44e],
  [ 0.68, 0, 0.32, 0.82, 0.04, 0.37, 0xffb13d],
  [0, -0.69, 0.78, 0.26, 0.05, 0.32, 0xff9331],
  [0,  0.69, 0.72, 0.26, 0.06, 0.23, 0xffdd75],
  [0, 0, 1.00, 1.02, 0.26, 0.52, 0xffdc70],
  [-0.66, 0.06, 0.32, 0.50, 0.32, 0.48, 0xff8b26],
  [ 0.63, -0.06, 0.26, 0.44, 0.37, 0.55, 0xff912a],
  [0.04, 0, 0.76, 0.74, 0.52, 0.73, 0xffa32e],
  [-0.05, 0.05, 0.48, 0.48, 0.73, 0.90, 0xf77b24],
  [-0.08, 0.06, 0.26, 0.26, 0.94, 1.00, 0xef6820],
]
const FLICKER = [0.92, 1.06, 0.97, 1.10]

export function createEngineFlameVFX(parent, config = {}, phaseOffset = 0) {
  const settings = normalizeEngineFlameConfig(config)
  const root = new THREE.Group()
  root.name = 'EngineFlameVFX'
  parent.add(root)

  const geometry = new THREE.BoxGeometry()
  const material = new THREE.MeshBasicMaterial({ toneMapped: false })
  const bricks = new THREE.InstancedMesh(geometry, material, FLAME_BRICKS.length)
  bricks.name = 'EngineFlameBricks'
  bricks.frustumCulled = false
  bricks.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  root.add(bricks)
  const transform = new THREE.Object3D()
  const tint = new THREE.Color()
  let lastBeat = -1
  let phase = phaseOffset
  let previousTime = 0

  function drawBricks(beat) {
    // Four poses change the lengths of the outer tongues while the throat stays seated.
    for (let i = 0; i < FLAME_BRICKS.length; i++) {
      const [x, y, width, height, start, end] = FLAME_BRICKS[i]
      const from = start + Math.max(0, start - 0.52) * (FLICKER[beat] - 1)
      const to = end + Math.max(0, end - 0.52) * (FLICKER[beat] - 1)
      const edge = i === 6 || i === 7 ? FLICKER[(beat + i) % FLICKER.length] : 1
      const depth = (to - from) * edge
      transform.position.set(x, y, -from - depth / 2)
      transform.scale.set(width, height, depth)
      transform.updateMatrix()
      bricks.setMatrixAt(i, transform.matrix)
    }
    bricks.instanceMatrix.needsUpdate = true
    lastBeat = beat
  }

  for (const [i, brick] of FLAME_BRICKS.entries()) bricks.setColorAt(i, tint.setHex(brick[6]))
  function applyShape(values, pulse = 1) {
    root.scale.set(values.radius, values.radius, values.length * pulse)
    material.color.setScalar(0.60 + 0.40 * values.intensity)
  }
  function update(elapsed, values = settings) {
    if (elapsed < previousTime) phase = phaseOffset
    phase += Math.max(0, elapsed - previousTime) * values.speed * 12
    previousTime = elapsed
    const beat = Math.floor(phase) % 4
    if (beat !== lastBeat) drawBricks(beat)
    applyShape(values)
  }
  drawBricks(0)
  applyShape(settings)
  return {
    root, settings, applyShape, update,
    setVisible(visible) { root.visible = visible },
    dispose() {
      root.removeFromParent()
      bricks.dispose()
      geometry.dispose()
      material.dispose()
    },
  }
}
