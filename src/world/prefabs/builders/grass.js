import * as THREE from 'three/webgpu'
import { LEGO_COLORS } from './legoColors.js'
import { PLATE_HEIGHT, STUD_PITCH } from './legoUnits.js'
import { cylinder, makePrefabScene } from './prefabParts.js'

const ROOT_Y = PLATE_HEIGHT - 0.004

// A compact three-leaf sprig, and a taller five-leaf tuft. Both grow from the
// same one-stud square plate; the blades and collar overlap inside the plate.
export function buildGrassShort() {
  return buildGrass([
    { angle: 0.12, rise: 0.114, reach: 0.047, width: 0.017 },
    { angle: 2.25, rise: 0.096, reach: 0.051, width: 0.018 },
    { angle: 4.35, rise: 0.083, reach: 0.045, width: 0.018 },
  ], [0, 0.27, 0.58, 0.83, 0.96], 6, 1.5)
}

export function buildGrassTall() {
  return buildGrass([
    { angle: 0.18, rise: 0.224, reach: 0.029, width: 0.016 },
    { angle: 1.4, rise: 0.182, reach: 0.058, width: 0.018 },
    { angle: 2.7, rise: 0.169, reach: 0.068, width: 0.019 },
    { angle: 3.95, rise: 0.198, reach: 0.044, width: 0.017 },
    { angle: 5.18, rise: 0.154, reach: 0.065, width: 0.019 },
  ], [0, 0.2, 0.43, 0.67, 0.86, 0.965], 8, 1.5)
}

function buildGrass(leaves, rings, collarSegments, foliageScale = 1) {
  const parts = [
    beveledPlate(),
    cylinder({ radius: 0.021, height: 0.019, segments: collarSegments })
      .translate(0, PLATE_HEIGHT - 0.006, 0),
  ]
  for (const leaf of leaves) {
    parts.push(curvedLeaf(leaf, rings))
  }
  // Scale the leaves and collar from the plate top, keeping the 1 x 1 base.
  if (foliageScale !== 1) {
    for (const part of parts.slice(1)) {
      part.translate(0, -PLATE_HEIGHT, 0)
        .scale(foliageScale, foliageScale, foliageScale)
        .translate(0, PLATE_HEIGHT, 0)
    }
  }
  return makePrefabScene([
    { name: 'grass_root', color: LEGO_COLORS.green, parts },
  ])
}

// Eight corners form a square with small chamfers. The bevel rings soften its
// top and bottom edges while the middle band keeps the full 1 x 1 footprint.
function beveledPlate() {
  const half = STUD_PITCH / 2
  const bevel = 0.003
  const ringSpecs = [
    { half: half - bevel, y: 0 },
    { half, y: bevel },
    { half, y: PLATE_HEIGHT - bevel },
    { half: half - bevel, y: PLATE_HEIGHT },
  ]
  const positions = []
  const indices = []
  for (const { half: extent, y } of ringSpecs) {
    const inset = 0.004
    for (const [x, z] of [
      [-extent + inset, extent],
      [extent - inset, extent],
      [extent, extent - inset],
      [extent, -extent + inset],
      [extent - inset, -extent],
      [-extent + inset, -extent],
      [-extent, -extent + inset],
      [-extent, extent - inset],
    ]) {
      positions.push(x, y, z)
    }
  }
  for (let ring = 0; ring < ringSpecs.length - 1; ring++) {
    for (let side = 0; side < 8; side++) {
      const a = ring * 8 + side
      const b = ring * 8 + (side + 1) % 8
      indices.push(a, b, b + 8, a, b + 8, a + 8)
    }
  }

  // Cap vertices stay separate so the broad plate faces retain flat normals.
  for (const top of [false, true]) {
    const start = positions.length / 3
    const sourceRing = top ? 3 : 0
    for (let side = 0; side < 8; side++) {
      const offset = (sourceRing * 8 + side) * 3
      positions.push(...positions.slice(offset, offset + 3))
    }
    const center = positions.length / 3
    positions.push(0, top ? PLATE_HEIGHT : 0, 0)
    for (let side = 0; side < 8; side++) {
      const a = start + side
      const b = start + (side + 1) % 8
      indices.push(center, top ? a : b, top ? b : a)
    }
  }
  return geometryFrom(positions, indices)
}

// Sweeping a thick elliptical section along a bent stem gives the blade a
// rounded plastic front, back and edges. Its last ring closes into a rounded
// tip rather than collapsing a full ring into zero-area triangles.
function curvedLeaf({ angle, rise, reach, width }, rings) {
  const sides = 8
  const positions = []
  const indices = []
  const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))
  const across = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle))

  for (const t of rings) {
    const center = radial.clone().multiplyScalar(0.004 + reach * t * t)
    center.y = ROOT_Y + rise * t
    const tangent = radial.clone().multiplyScalar(2 * reach * t)
    tangent.y = rise
    tangent.normalize()
    const front = radial.clone().multiplyScalar(tangent.y)
    front.y = -Math.hypot(tangent.x, tangent.z)

    const roundTip = Math.sqrt(1 - t * t)
    const leafWidth = width * (0.55 + 0.65 * Math.sin(Math.PI * t)) * roundTip
    const thickness = 0.009 * (1 - 0.3 * t) * roundTip
    for (let side = 0; side < sides; side++) {
      const theta = side / sides * Math.PI * 2
      const point = center.clone()
        .addScaledVector(across, Math.cos(theta) * leafWidth)
        .addScaledVector(front, Math.sin(theta) * thickness)
      positions.push(point.x, point.y, point.z)
    }
  }

  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let side = 0; side < sides; side++) {
      const a = ring * sides + side
      const b = ring * sides + (side + 1) % sides
      indices.push(a, b, b + sides, a, b + sides, a + sides)
    }
  }

  const rootRing = positions.length / 3
  for (let side = 0; side < sides; side++) {
    positions.push(...positions.slice(side * 3, side * 3 + 3))
  }
  const root = positions.length / 3
  positions.push(radial.x * 0.004, ROOT_Y, radial.z * 0.004)
  const tip = positions.length / 3
  positions.push(radial.x * (0.004 + reach), ROOT_Y + rise, radial.z * (0.004 + reach))
  const lastRing = (rings.length - 1) * sides
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides
    indices.push(root, rootRing + next, rootRing + side, lastRing + side, lastRing + next, tip)
  }
  return geometryFrom(positions, indices)
}

function geometryFrom(positions, indices) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
