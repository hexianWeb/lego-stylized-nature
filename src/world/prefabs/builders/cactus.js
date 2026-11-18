import * as THREE from 'three/webgpu'
import { LEGO_COLORS } from './legoColors.js'
import { cylinder, makePrefabScene } from './prefabParts.js'

const CENTER_X = 0.000181
const CENTER_Z = 0.003896
const WIDTH = 0.082
const DEPTH = 0.081433
const STEM_TOP = 0.345
const ARM_BOTTOM = 0.161
const ARM_TOP = 0.2288
const ARM_REACH = 0.08798

// The source is a LEGO cactus made from four stacked square blocks, two
// L-shaped arms and round studs. Keep those large shapes at scene scale.
export function buildCactus() {
  const parts = []
  const blockHeight = STEM_TOP / 4
  for (let i = 0; i < 4; i++) {
    parts.push(beveledBlock({ width: WIDTH, depth: DEPTH, height: blockHeight, top: i === 3 })
      .translate(CENTER_X, i * blockHeight, CENTER_Z))
  }
  for (const side of [-1, 1]) {
    parts.push(armSupport(side))
    parts.push(beveledBlock({ width: WIDTH, depth: DEPTH, height: ARM_TOP - ARM_BOTTOM })
      .translate(CENTER_X, ARM_BOTTOM, CENTER_Z + side * ARM_REACH))
    parts.push(cylinder({ radius: 0.024, height: 0.0183165, segments: 12 })
      .translate(CENTER_X, ARM_TOP, CENTER_Z + side * ARM_REACH))
    for (const y of [0.078, 0.155, 0.233, 0.310]) {
      parts.push(cylinder({ radius: 0.0196, height: 0.0118957, segments: 8 })
        .rotateZ(-side * Math.PI / 2)
        .translate(CENTER_X + side * (WIDTH / 2 - 0.002), y, CENTER_Z))
    }
  }
  parts.push(cylinder({ radius: 0.024, height: 0.0183165, segments: 12 })
    .translate(CENTER_X, STEM_TOP, CENTER_Z))
  const scene = makePrefabScene([{ name: 'cactus_2', color: LEGO_COLORS.cactusGreen, parts }])
  scene.children[0].material.roughness = 0.42
  scene.children[0].material.clearcoatRoughness = 0.25
  return scene
}

function beveledBlock({ width, depth, height, top = true }) {
  const bevel = 0.0012
  const corner = 0.0015
  const positions = []
  const indices = []
  for (const [y, inset] of [[0, bevel], [bevel, 0], [height - bevel, 0], [height, bevel]]) {
    const hx = width / 2 - inset
    const hz = depth / 2 - inset
    for (const [x, z] of [
      [-hx + corner, hz],
      [hx - corner, hz],
      [hx, hz - corner],
      [hx, -hz + corner],
      [hx - corner, -hz],
      [-hx + corner, -hz],
      [-hx, -hz + corner],
      [-hx, hz - corner],
    ]) positions.push(x, y, z)
  }
  for (let ring = 0; ring < 3; ring++) {
    for (let side = 0; side < 8; side++) {
      const a = ring * 8 + side
      const b = ring * 8 + (side + 1) % 8
      indices.push(a, b, b + 8, a, b + 8, a + 8)
    }
  }
  if (top) {
    const start = positions.length / 3
    for (let side = 0; side < 8; side++) positions.push(...positions.slice((24 + side) * 3, (25 + side) * 3))
    const center = positions.length / 3
    positions.push(0, height, 0)
    for (let side = 0; side < 8; side++) indices.push(center, start + side, start + (side + 1) % 8)
  }
  return geometryFrom(positions, indices)
}

// Extruded trapezoids give the arms the source's diagonal lower corners,
// while a short horizontal band joins each arm to the central stem.
function armSupport(side) {
  const profile = [
    [DEPTH / 2 - 0.004, 0.121],
    [ARM_REACH + DEPTH / 2 - 0.0353, 0.121],
    [ARM_REACH + DEPTH / 2, ARM_BOTTOM],
    [ARM_REACH + DEPTH / 2, ARM_BOTTOM + 0.002],
    [DEPTH / 2 - 0.004, ARM_BOTTOM + 0.002],
  ]
  const positions = []
  const indices = []
  const center = new THREE.Vector3(CENTER_X, 0.145, CENTER_Z + side * 0.08)
  const left = profile.map(([z, y]) => new THREE.Vector3(CENTER_X - WIDTH / 2, y, CENTER_Z + side * z))
  const right = profile.map(([z, y]) => new THREE.Vector3(CENTER_X + WIDTH / 2, y, CENTER_Z + side * z))
  const triangle = (a, b, c) => {
    const normal = b.clone().sub(a).cross(c.clone().sub(a))
    if (normal.dot(a.clone().add(b).add(c).multiplyScalar(1 / 3).sub(center)) < 0)
      [b, c] = [c, b]
    const offset = positions.length / 3
    for (const point of [a, b, c]) positions.push(point.x, point.y, point.z)
    indices.push(offset, offset + 1, offset + 2)
  }
  for (const face of [left, right]) {
    for (let i = 1; i < profile.length - 1; i++) triangle(face[0], face[i], face[i + 1])
  }
  for (let i = 0; i < profile.length - 1; i++) {
    triangle(left[i], right[i], right[i + 1])
    triangle(left[i], right[i + 1], left[i + 1])
  }
  // The final vertical edge is embedded inside the opaque stem.
  return geometryFrom(positions, indices)
}

function geometryFrom(positions, indices) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
