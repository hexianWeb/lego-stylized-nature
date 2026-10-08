import * as THREE from 'three/webgpu'
import {
  pass,
  renderOutput,
  Fn,
  float,
  vec4,
  screenUV,
  smoothstep
} from 'three/tsl'
import { smaa } from 'three/addons/tsl/display/SMAANode.js'
import { createTiltShiftEffect } from './postprocessing/createTiltShiftEffect.js'
import { installObjectResourceCleanup } from './installObjectResourceCleanup.js'
import { TILT_SHIFT_DEFAULTS } from './postprocessing/tiltShiftConfig.js'
import { createSpeedLinesEffect } from './postprocessing/createSpeedLinesEffect.js'
import {
  SPEED_LINES_DEFAULTS,
  normalizeSpeedLinesConfig
} from './postprocessing/speedLinesConfig.js'

// dist is scaled so screen corners sit near 1.0 (~sqrt(2)/2 * 1.42)
const VIGNETTE_INNER = 0.22
const VIGNETTE_OUTER = 0.92
// Linear 0.6 converts to about sRGB 0.8, matching the previous corner darkening.
const VIGNETTE_AMOUNT = 0.4

const applyVignette = Fn(() => {
  const dist = screenUV.sub(0.5).length().mul(1.42)
  const mask = smoothstep(VIGNETTE_INNER, VIGNETTE_OUTER, dist)
  return float(1.0).sub(mask.mul(VIGNETTE_AMOUNT))
})

export default class Renderer {
  /**
    * @param {{
    *   canvas: HTMLCanvasElement,
    *   trackTimestamp?: boolean,
    *   postProcessing?: {
    *     enabled?: boolean,
    *     tiltShift?: {
   *       enabled?: boolean,
   *       focusCenter?: number,
   *       focusWidth?: number,
   *       falloff?: number,
   *       blurStrength?: number
   *     },
   *     speedLines?: {
   *       enabled?: boolean,
   *       color?: { r?: number, g?: number, b?: number },
   *       density?: number,
   *       speed?: number,
   *       thickness?: number,
   *       minRadius?: number,
   *       maxRadius?: number,
   *       randomness?: number,
   *       opacity?: number
   *     }
   *   }
   * }} options
   */
  constructor({ canvas, postProcessing = {}, trackTimestamp = false }) {
    this.instance = new THREE.WebGPURenderer({
      canvas,
      forceWebGL: false,
      trackTimestamp
    })
    this.instance.outputColorSpace = THREE.SRGBColorSpace
    this.instance.toneMapping = THREE.ACESFilmicToneMapping
    this.instance.toneMappingExposure = 0.9
    this.instance.shadowMap.enabled = true
    this.instance.shadowMap.type = THREE.BasicShadowMap
    // Count all scene, shadow and postprocessing passes in one game frame.
    this.instance.info.autoReset = false

    this.postProcessingEnabled = postProcessing.enabled !== false
    this.tiltShiftConfig =
      postProcessing.tiltShift ?? { ...TILT_SHIFT_DEFAULTS }
    this.speedLinesConfig = normalizeSpeedLinesConfig(
      postProcessing.speedLines ?? SPEED_LINES_DEFAULTS
    )

    /** @type {THREE.RenderPipeline | null} */
    this.renderPipeline = null
    this.tiltShiftEffect = null
    this.speedLinesEffect = null
    this.outputNodes = null
    this.scene = null
    this.camera = null
    this.pipelineNodes = []
    this.initialized = false
    this.disposed = false

    this.postProcessingController = Object.freeze({
      setTiltShiftEnabled: (enabled) => {
        this.setTiltShiftEnabled(enabled)
      },
      syncTiltShift: (config) => {
        this.syncTiltShift(config)
      },
      setSpeedLinesEnabled: (enabled) => {
        this.setSpeedLinesEnabled(enabled)
      },
      setSpeedLineOpacity: (opacity) => {
        this.setSpeedLineOpacity(opacity)
      },
      syncSpeedLines: (config) => {
        this.syncSpeedLines(config)
      }
    })
  }

  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  attachPipeline(scene, camera) {
    this.disposePipeline()
    this.scene = scene
    this.camera = camera

    if (!this.postProcessingEnabled) {
      return
    }

    const scenePass = pass(scene, camera)
    this.pipelineNodes.push(scenePass)
    const sceneColor = scenePass.getTextureNode('output')
    this.speedLinesEffect = createSpeedLinesEffect(
      sceneColor,
      this.speedLinesConfig
    )
    this.tiltShiftEffect = createTiltShiftEffect(
      this.speedLinesEffect.outputNode,
      this.tiltShiftConfig
    )
    this.pipelineNodes.push(this.tiltShiftEffect)

    this.outputNodes = {
      tiltShiftEnabled: this.createFinalOutput(
        this.tiltShiftEffect.enabledOutput
      ),
      tiltShiftDisabled: this.createFinalOutput(
        this.tiltShiftEffect.disabledOutput
      )
    }

    this.renderPipeline = new THREE.RenderPipeline(this.instance)
    this.renderPipeline.outputColorTransform = false
    this.setTiltShiftEnabled(this.tiltShiftConfig.enabled)
  }

  createFinalOutput(sceneColor) {
    const color = renderOutput(sceneColor, this.instance.toneMapping, THREE.LinearSRGBColorSpace)
    const vignetted = vec4(color.rgb.mul(applyVignette()), color.a)
    const aa = smaa(vignetted)
    this.pipelineNodes.push(aa.textureNode, aa)
    return renderOutput(aa, THREE.NoToneMapping, THREE.SRGBColorSpace)
  }

  setTiltShiftEnabled(enabled) {
    const nextEnabled = enabled === true
    this.tiltShiftConfig.enabled = nextEnabled

    if (!this.renderPipeline || !this.outputNodes) {
      return
    }

    const nextOutput = nextEnabled
      ? this.outputNodes.tiltShiftEnabled
      : this.outputNodes.tiltShiftDisabled
    if (this.renderPipeline.outputNode !== nextOutput) {
      this.renderPipeline.outputNode = nextOutput
      this.renderPipeline.needsUpdate = true
    }
  }

  syncTiltShift(config = {}) {
    Object.assign(this.tiltShiftConfig, config)
    this.tiltShiftEffect?.sync(this.tiltShiftConfig)
  }

  setSpeedLinesEnabled(enabled) {
    this.speedLinesConfig.enabled = enabled === true
    this.speedLinesEffect?.setEnabled(enabled)
  }

  setSpeedLineOpacity(opacity) {
    const nextOpacity = THREE.MathUtils.clamp(opacity, 0, 1)
    this.speedLinesConfig.opacity = nextOpacity
    this.speedLinesEffect?.setOpacity(nextOpacity)
  }

  syncSpeedLines(config = {}) {
    Object.assign(this.speedLinesConfig, config)
    if (config.color) {
      this.speedLinesConfig.color = {
        ...this.speedLinesConfig.color,
        ...config.color
      }
    }
    this.speedLinesEffect?.sync(this.speedLinesConfig)
  }

  /**
   * @param {number} elapsedSec
   */
  updatePostProcessingTime(elapsedSec) {
    if (this.speedLinesEffect) {
      this.speedLinesEffect.uniforms.uTime.value = elapsedSec
    }
  }

  async init() {
    await this.instance.init()
    this.initialized = true
    if (this.disposed) {
      this.instance.dispose()
      throw new Error('[Renderer] Disposed during initialization')
    }
    this.objectResourceCleanup = installObjectResourceCleanup(this.instance)
  }

  releaseSceneObjects(group) {
    this.objectResourceCleanup?.releaseGroup(group)
  }

  /**
   * @param {{ width: number, height: number }} sizes
   */
  setSizeFromSizes(sizes) {
    this.instance.setSize(sizes.width, sizes.height)
    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  }

  render() {
    this.instance.info?.reset()
    if (this.postProcessingEnabled) {
      this.renderPipeline.render()
    } else {
      this.instance.render(this.scene, this.camera)
    }
  }

  disposePipeline() {
    this.renderPipeline?.dispose()
    const nodes = new Set(this.pipelineNodes ?? [])
    if (this.tiltShiftEffect) {
      nodes.add(this.tiltShiftEffect)
    }
    for (const node of nodes) {
      // r185's RTTNode inherits Node.dispose() without releasing these allocations.
      if (node.isRTTNode) {
        node.renderTarget.dispose()
        node._quadMesh.material.dispose()
      }
      node.dispose()
    }
    this.pipelineNodes = []
    this.tiltShiftEffect = null
    this.speedLinesEffect = null
    this.renderPipeline = null
    this.outputNodes = null
  }

  dispose() {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.disposePipeline()
    // r185's dispose() calls setAnimationLoop(), which initializes an unready renderer.
    if (this.initialized) {
      this.instance.dispose()
    }
    this.scene = null
    this.camera = null
    this.objectResourceCleanup = null
  }
}
