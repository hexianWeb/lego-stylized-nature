import { LEGO_COLORS } from './legoColors.js'
import { cylinder, makePrefabScene, sector } from './prefabParts.js'

const PAD_RADIUS = 0.066
const PAD_HEIGHT = 0.034
const STEM_HEIGHT = 0.032
const GAP = 0.14

// Four lobes separated by a cross gap, on a short stem.
export function buildDuckweed() {
  const parts = [cylinder({ radius: 0.03, height: STEM_HEIGHT, segments: 8 })]
  const quarter = Math.PI / 2
  for (let i = 0; i < 4; i++) {
    parts.push(
      sector({
        radius: PAD_RADIUS,
        height: PAD_HEIGHT,
        segments: 4,
        thetaStart: i * quarter + GAP / 2,
        thetaLength: quarter - GAP,
      }).translate(0, STEM_HEIGHT, 0),
    )
  }

  return makePrefabScene([
    { name: 'duckweed_root', color: LEGO_COLORS.duckweedGreen, parts },
  ])
}
