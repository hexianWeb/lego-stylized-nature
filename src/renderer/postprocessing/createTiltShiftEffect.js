import {
  mix,
  screenUV,
  smoothstep,
  uniform
} from 'three/tsl'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
import { TILT_SHIFT_DEFAULTS } from './tiltShiftConfig.js'

const BLUR_RESOLUTION_SCALE = 0.25
const BLUR_SIGMA = 4

export function createTiltShiftEffect(
  sceneColor,
  config = TILT_SHIFT_DEFAULTS
) {
  const uniforms = {
    focusCenter: uniform(
      config.focusCenter ?? TILT_SHIFT_DEFAULTS.focusCenter
    ),
    focusWidth: uniform(
      config.focusWidth ?? TILT_SHIFT_DEFAULTS.focusWidth
    ),
    falloff: uniform(
      config.falloff ?? TILT_SHIFT_DEFAULTS.falloff
    ),
    blurStrength: uniform(
      config.blurStrength ?? TILT_SHIFT_DEFAULTS.blurStrength
    )
  }

  const blurNode = gaussianBlur(
    sceneColor,
    uniforms.blurStrength,
    BLUR_SIGMA,
    { resolutionScale: BLUR_RESOLUTION_SCALE }
  )

  const distance = screenUV.y.sub(uniforms.focusCenter).abs()
  const clearEdge = uniforms.focusWidth.mul(0.5)
  const blurMask = smoothstep(
    clearEdge,
    clearEdge.add(uniforms.falloff),
    distance
  )
  const enabledOutput = mix(sceneColor, blurNode, blurMask)

  let disposed = false

  return {
    enabledOutput,
    disabledOutput: sceneColor,
    blurNode,
    uniforms,

    sync(nextConfig = {}) {
      uniforms.focusCenter.value =
        nextConfig.focusCenter ?? uniforms.focusCenter.value
      uniforms.focusWidth.value =
        nextConfig.focusWidth ?? uniforms.focusWidth.value
      uniforms.falloff.value =
        nextConfig.falloff ?? uniforms.falloff.value
      uniforms.blurStrength.value =
        nextConfig.blurStrength ?? uniforms.blurStrength.value
    },

    dispose() {
      if (disposed) {
        return
      }

      blurNode.dispose()
      disposed = true
    }
  }
}
