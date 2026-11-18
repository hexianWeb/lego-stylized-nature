import * as THREE from 'three/webgpu'
import { LEGO_COLORS } from './legoColors.js'
import { box, cylinder, makePrefabScene } from './prefabParts.js'

// The source is a small square foot with three unequal cattail-like heads
// and two long outward leaves. Keep its scale and the three original colors.
export function buildPhragmites() {
  const stems = [
    box({ width: 0.07907, height: 0.02922, depth: 0.07907 }),
    cylinder({ radius: 0.0335, height: 0.004, segments: 10 }).translate(0, 0.0285, 0),
  ]
  const heads = []
  for (const { x, z, bottom, top } of [
    { x: -0.0048, z: 0.0015, bottom: 0.09954, top: 0.17408 },
    { x: 0.0197, z: 0.0095, bottom: 0.14638, top: 0.22092 },
    { x: 0.00695, z: -0.017, bottom: 0.20968, top: 0.28422 },
  ]) {
    stems.push(cylinder({ radius: 0.0075, height: top + 0.01108 - 0.03, segments: 8 })
      .translate(x, 0.03, z))
    heads.push(reedHead(bottom, top).translate(x, 0, z))
  }
  const leaves = [
    reedLeaf({ root: [-0.003, 0.028, -0.021], tip: [-0.016, 0.145, -0.062], width: 0.0105 }),
    reedLeaf({ root: [0.022, 0.028, 0.013], tip: [0.067, 0.1775, 0.038], width: 0.0125 }),
  ]
  return makePrefabScene([
    { name: 'phragmites_stem', color: LEGO_COLORS.reedStem, parts: stems },
    { name: 'phragmites_leaf', color: LEGO_COLORS.reedLeaf, parts: leaves },
    { name: 'phragmites_head', color: LEGO_COLORS.reedHead, parts: heads },
  ])
}

// A narrow neck widens into the brown cylindrical head. One small top bevel
// and eight sides are enough for the rounded silhouette at the scene scale.
function reedHead(bottom, top) {
  const sides = 8
  const positions = []
  const indices = []
  for (const [y, radius] of [
    [bottom, 0.010],
    [bottom + 0.0074, 0.0145],
    [top - 0.0012, 0.0145],
    [top, 0.0135],
  ]) {
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2
      positions.push(Math.sin(angle) * radius, y, Math.cos(angle) * radius)
    }
  }
  appendSides(indices, sides, 4)
  // Separate cap vertices keep the top flat while the sides remain smooth.
  for (const [ring, upward] of [[0, false], [3, true]]) {
    const cap = positions.length / 3
    for (let side = 0; side < sides; side++) {
      const offset = (ring * sides + side) * 3
      positions.push(...positions.slice(offset, offset + 3))
    }
    const center = positions.length / 3
    positions.push(0, upward ? top : bottom, 0)
    for (let side = 0; side < sides; side++) {
      const a = cap + side
      const b = cap + (side + 1) % sides
      indices.push(center, upward ? a : b, upward ? b : a)
    }
  }
  return geometryFrom(positions, indices)
}

function reedLeaf({ root, tip, width }) {
  const start = new THREE.Vector3(...root)
  const end = new THREE.Vector3(...tip)
  const delta = end.clone().sub(start)
  const reach = Math.hypot(delta.x, delta.z)
  const radial = new THREE.Vector3(delta.x, 0, delta.z).normalize()
  const across = new THREE.Vector3(-radial.z, 0, radial.x)
  const sides = 6
  const rings = [0, 0.27, 0.55, 0.8, 0.95]
  const positions = []
  const indices = []
  for (const t of rings) {
    const center = start.clone().addScaledVector(radial, reach * (0.25 * t + 0.75 * t * t))
    center.y += delta.y * t
    const tangent = radial.clone().multiplyScalar(reach * (0.25 + 1.5 * t))
    tangent.y = delta.y
    tangent.normalize()
    const front = radial.clone().multiplyScalar(tangent.y)
    front.y = -Math.hypot(tangent.x, tangent.z)
    const taper = Math.sqrt(1 - t * t)
    const halfWidth = width * (0.55 + 0.55 * Math.sin(Math.PI * t)) * taper
    const thickness = 0.0025 * taper
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2
      const point = center.clone()
        .addScaledVector(across, Math.cos(angle) * halfWidth)
        .addScaledVector(front, Math.sin(angle) * thickness)
      positions.push(...point.toArray())
    }
  }
  appendSides(indices, sides, rings.length)
  const rootCenter = positions.length / 3
  positions.push(...root)
  const tipIndex = positions.length / 3
  positions.push(...tip)
  const lastRing = (rings.length - 1) * sides
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides
    indices.push(rootCenter, next, side, lastRing + side, lastRing + next, tipIndex)
  }
  return geometryFrom(positions, indices)
}

function appendSides(indices, sides, rings) {
  for (let ring = 0; ring < rings - 1; ring++) {
    for (let side = 0; side < sides; side++) {
      const a = ring * sides + side
      const b = ring * sides + (side + 1) % sides
      indices.push(a, b, b + sides, a, b + sides, a + sides)
    }
  }
}

function geometryFrom(positions, indices) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
