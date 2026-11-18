import * as THREE from 'three/webgpu'
import { LEGO_COLORS } from './legoColors.js'
import { box, cylinder, makePrefabScene } from './prefabParts.js'

const BASE_HEIGHT = 0.03
const STEM_HEIGHT = 0.04
const CAP_Y = BASE_HEIGHT + STEM_HEIGHT
const CAP_RADIUS = 0.045
const SPOT_RADIUS = 0.014

// Tan block and stem, a hemispherical cap, and five pale spots.
// The cap is instance-colored. The original GLB named the spots "leaf".
export function buildMushroom() {
  const dome = new THREE.SphereGeometry(CAP_RADIUS, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2)
  dome.translate(0, CAP_Y, 0)
  const underside = new THREE.CircleGeometry(CAP_RADIUS, 8)
  underside.rotateX(Math.PI / 2)
  underside.translate(0, CAP_Y, 0)

  const spots = [topSpot()]
  for (let i = 0; i < 4; i++) {
    spots.push(sideSpot(i * Math.PI / 2))
  }

  return makePrefabScene([
    {
      name: 'mushroom_root',
      color: LEGO_COLORS.mushroomStem,
      parts: [
        box({ width: 0.08, height: BASE_HEIGHT, depth: 0.08 }),
        cylinder({ radius: 0.02, height: STEM_HEIGHT, segments: 8, top: false }).translate(0, BASE_HEIGHT, 0),
      ],
    },
    { name: 'mushroom_InstanceColor', color: LEGO_COLORS.white, parts: [dome, underside] },
    { name: 'leaf', color: LEGO_COLORS.mushroomSpot, parts: spots },
  ])
}

function topSpot() {
  return cylinder({ radius: SPOT_RADIUS + 0.002, height: 0.004, segments: 8 })
    .translate(0, CAP_Y + CAP_RADIUS - 0.001, 0)
}

function sideSpot(azimuth) {
  const length = 0.006
  const rise = 0.016
  const surface = Math.sqrt(CAP_RADIUS ** 2 - rise ** 2)
  const reach = surface + 0.002 - length
  return cylinder({ radius: SPOT_RADIUS, height: length, segments: 6 })
    .rotateZ(-Math.PI / 2)
    .rotateY(azimuth)
    .translate(Math.cos(azimuth) * reach, CAP_Y + 0.016, -Math.sin(azimuth) * reach)
}
