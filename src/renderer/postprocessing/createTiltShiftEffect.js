import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
import { NodeUpdateType } from 'three/webgpu'
import {
  dot,
  float,
  mix,
  screenUV,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from 'three/tsl'
import { TILT_SHIFT_DEFAULTS } from './tiltShiftConfig.js'

const BLUR_RESOLUTION_SCALE = 0.25
const BLUR_SIGMA = 4
const LUMA_WEIGHTS = vec3(0.2126, 0.7152, 0.0722)
const BOKEH_HIGHLIGHT_BOOST = 0.35

export function createTiltShiftEffect(
  sceneColor,
  config = TILT_SHIFT_DEFAULTS,
) {
  const uniforms = {
    focusCenter: uniform(
      config.focusCenter ?? TILT_SHIFT_DEFAULTS.focusCenter,
    ),
    focusWidth: uniform(
      config.focusWidth ?? TILT_SHIFT_DEFAULTS.focusWidth,
    ),
    falloff: uniform(
      config.falloff ?? TILT_SHIFT_DEFAULTS.falloff,
    ),
    blurStrength: uniform(
      config.blurStrength ?? TILT_SHIFT_DEFAULTS.blurStrength,
    ),
  }

  const blurNode = gaussianBlur(
    sceneColor,
    uniforms.blurStrength,
    BLUR_SIGMA,
    { resolutionScale: BLUR_RESOLUTION_SCALE },
  )

  // Non-texture inputs get an implicit RTT. Its default RENDER frequency redraws
  // the same input for both blur passes; this screen-space input changes per frame.
  if (blurNode.textureNode !== sceneColor && blurNode.textureNode.isRTTNode) {
    const input = blurNode.textureNode
    input.updateBeforeType = NodeUpdateType.FRAME
    // GaussianBlur temporarily swaps .value for the horizontal result. Keep the
    // update key stable too, or the vertical pass schedules the RTT a second time.
    input.updateReference = () => input.renderTarget.texture
  }

  const distance = screenUV.y.sub(uniforms.focusCenter).abs()
  const clearEdge = uniforms.focusWidth.mul(0.5)
  const blurMask = smoothstep(
    clearEdge,
    clearEdge.add(uniforms.falloff),
    distance,
  )
  const blurLuma = dot(blurNode.rgb, LUMA_WEIGHTS)
  const bokehHighlight = smoothstep(0.65, 1.8, blurLuma)
  const bokehColor = vec4(
    blurNode.rgb.mul(float(1).add(bokehHighlight.mul(BOKEH_HIGHLIGHT_BOOST))),
    blurNode.a,
  )
  const enabledOutput = mix(sceneColor, bokehColor, blurMask)

  let disposed = false

  return {
    enabledOutput,
    disabledOutput: sceneColor,
    blurNode,
    uniforms,

    sync(nextConfig = {}) {
      uniforms.focusCenter.value
        = nextConfig.focusCenter ?? uniforms.focusCenter.value
      uniforms.focusWidth.value
        = nextConfig.focusWidth ?? uniforms.focusWidth.value
      uniforms.falloff.value
        = nextConfig.falloff ?? uniforms.falloff.value
      uniforms.blurStrength.value
        = nextConfig.blurStrength ?? uniforms.blurStrength.value
    },

    dispose() {
      if (disposed) {
        return
      }

      blurNode.dispose()
      const input = blurNode.textureNode
      if (input !== sceneColor && input.isRTTNode) {
        // gaussianBlur() creates an RTT for non-texture inputs; r185 does not free it.
        input.renderTarget.dispose()
        input._quadMesh.material.dispose()
        input.dispose()
      }
      disposed = true
    },
  }
}
