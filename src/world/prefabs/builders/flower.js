import { LEGO_COLORS } from './legoColors.js'
import { STUD_HEIGHT } from './legoUnits.js'
import { cylinder, makePrefabScene, stud } from './prefabParts.js'

const BASE_HEIGHT = 0.044
const STEM_Y = BASE_HEIGHT + STUD_HEIGHT * 0.4
const HEAD_HEIGHT = 0.011
const PETAL_OFFSET = 0.038

// Point at the stem, cleft between the two outer lobes.
const HEART = [
  [0.74, 0],
  [1, 0.42],
  [0.55, 0.52],
  [0.2, 0.2],
  [0, 0],
  [0.2, -0.2],
  [0.55, -0.52],
  [1, -0.42],
]

const ARMS = [
  { kind: 'leaf', azimuth: 0, reach: 0.058, rise: 0.09 },
  { kind: 'flower', azimuth: Math.PI / 3, reach: 0.078, rise: 0.112 },
  { kind: 'leaf', azimuth: (2 * Math.PI) / 3, reach: 0.058, rise: 0.09 },
  { kind: 'flower', azimuth: Math.PI, reach: 0.078, rise: 0.112 },
  { kind: 'leaf', azimuth: (4 * Math.PI) / 3, reach: 0.058, rise: 0.09 },
  { kind: 'flower', azimuth: (5 * Math.PI) / 3, reach: 0.078, rise: 0.112 },
]

export function buildFlower({ stemColor = LEGO_COLORS.green } = {}) {
  const root = [
    cylinder({ radius: 0.046, height: BASE_HEIGHT, segments: 8 }),
    stud().translate(0, BASE_HEIGHT, 0),
    cylinder({ radius: 0.028, height: 0.012, segments: 8 }).translate(0, STEM_Y, 0),
  ]
  const heads = []

  for (const { kind, azimuth, reach, rise } of ARMS) {
    const length = Math.hypot(reach, rise)
    const tilt = Math.atan2(reach, rise)
    const tip = stemTip(length, tilt, azimuth)
    root.push(stem(length, tilt, azimuth))

    if (kind === 'flower') {
      for (let petal = 0; petal < 4; petal++) {
        heads.push(flowerPetal(azimuth + petal * Math.PI / 2).translate(tip.x, tip.y, tip.z))
      }
      heads.push(stud().translate(tip.x, tip.y + HEAD_HEIGHT, tip.z))
    }
    else {
      root.push(
        heartLeaf(0.098, 0.08, 0.01)
          .rotateZ(0.32)
          .rotateY(azimuth)
          .translate(tip.x, tip.y, tip.z),
      )
    }
  }

  return makePrefabScene([
    { name: 'flower_root', color: stemColor, parts: root },
    { name: 'flower_InstanceColor', color: LEGO_COLORS.white, parts: heads },
  ])
}

function stem(length, tilt, azimuth) {
  return cylinder({ radius: 0.01, height: length, segments: 5, top: false })
    .rotateZ(-tilt)
    .rotateY(azimuth)
    .translate(0, STEM_Y, 0)
}

function stemTip(length, tilt, azimuth) {
  const reach = length * Math.sin(tilt)
  return {
    x: reach * Math.cos(azimuth),
    y: STEM_Y + length * Math.cos(tilt),
    z: -reach * Math.sin(azimuth),
  }
}

function flowerPetal(azimuth) {
  return cylinder({ radius: 0.024, height: HEAD_HEIGHT, segments: 6, bottom: true })
    .scale(1.45, 1, 1)
    .rotateY(azimuth)
    .translate(Math.cos(azimuth) * PETAL_OFFSET, 0, -Math.sin(azimuth) * PETAL_OFFSET)
}

function heartLeaf(length, width, thickness) {
  const geometry = cylinder({ radius: 1, height: thickness, segments: 8, bottom: true })
  const position = geometry.getAttribute('position')
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    if (Math.hypot(x, z) < 1e-5) {
      const crown = y > thickness * 0.5 ? thickness * 0.65 : 0
      position.setXYZ(i, length * 0.5, y - thickness / 2 + crown, 0)
      continue
    }
    let theta = Math.atan2(z, x)
    if (theta < 0) {
      theta += Math.PI * 2
    }
    const [px, pz] = HEART[Math.round(theta / (Math.PI / 4)) % 8]
    position.setXYZ(i, px * length - 0.014, y - thickness / 2, pz * width)
  }
  geometry.computeVertexNormals()
  return geometry
}
