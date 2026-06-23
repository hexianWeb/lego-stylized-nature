import * as THREE from 'three/webgpu'
import {
  pass,
  renderOutput,
  Fn,
  float,
  screenUV,
  smoothstep
} from 'three/tsl'
import { smaa } from 'three/addons/tsl/display/SMAANode.js'
import { createTiltShiftEffect } from './postprocessing/createTiltShiftEffect.js'
import { TILT_SHIFT_DEFAULTS } from './postprocessing/tiltShiftConfig.js'

// dist is scaled so screen corners sit near 1.0 (~sqrt(2)/2 * 1.42)
const VIGNETTE_INNER = 0.22
const VIGNETTE_OUTER = 0.92
const VIGNETTE_AMOUNT = 0.2

const applyVignette = Fn(() => {
  const dist = screenUV.sub(0.5).length().mul(1.42)
  const mask = smoothstep(VIGNETTE_INNER, VIGNETTE_OUTER, dist)
  return float(1.0).sub(mask.mul(VIGNETTE_AMOUNT))
})

export default class Renderer {
  /**
   * @param {{
   *   canvas: HTMLCanvasElement,
   *   postProcessing?: {
   *     tiltShift?: {
   *       enabled?: boolean,
   *       focusCenter?: number,
   *       focusWidth?: number,
   *       falloff?: number,
   *       blurStrength?: number
   *     }
   *   }
   * }} options
   */
  constructor({ canvas, postProcessing = {} }) {
    this.instance = new THREE.WebGPURenderer({
      canvas,
      forceWebGL: false
    })
    this.instance.outputColorSpace = THREE.SRGBColorSpace
    this.instance.toneMapping = THREE.ACESFilmicToneMapping
    this.instance.toneMappingExposure = 0.9
    this.instance.shadowMap.enabled = true
    this.instance.shadowMap.type = THREE.PCFShadowMap

    this.tiltShiftConfig =
      postProcessing.tiltShift ?? { ...TILT_SHIFT_DEFAULTS }

    /** @type {THREE.RenderPipeline | null} */
    this.renderPipeline = null
    this.tiltShiftEffect = null
    this.outputNodes = null

    this.postProcessingController = Object.freeze({
      setTiltShiftEnabled: (enabled) => {
        this.setTiltShiftEnabled(enabled)
      },
      syncTiltShift: (config) => {
        this.syncTiltShift(config)
      }
    })
  }

  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  attachPipeline(scene, camera) {
    this.tiltShiftEffect?.dispose()
    this.renderPipeline?.dispose()

    const scenePass = pass(scene, camera)
    const sceneColor = scenePass.getTextureNode('output')
    this.tiltShiftEffect = createTiltShiftEffect(
      sceneColor,
      this.tiltShiftConfig
    )

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
    const color = renderOutput(sceneColor)
    const vignetted = color.mul(applyVignette())
    return smaa(vignetted)
  }

  setTiltShiftEnabled(enabled) {
    const nextEnabled = enabled === true
    this.tiltShiftConfig.enabled = nextEnabled

    if (!this.renderPipeline || !this.outputNodes) {
      return
    }

    this.renderPipeline.outputNode = nextEnabled
      ? this.outputNodes.tiltShiftEnabled
      : this.outputNodes.tiltShiftDisabled
  }

  syncTiltShift(config = {}) {
    Object.assign(this.tiltShiftConfig, config)
    this.tiltShiftEffect?.sync(this.tiltShiftConfig)
  }

  async init() {
    await this.instance.init()
  }

  /**
   * @param {{ width: number, height: number }} sizes
   */
  setSizeFromSizes(sizes) {
    this.instance.setSize(sizes.width, sizes.height)
    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  }

  render() {
    this.renderPipeline.render()
  }

  dispose() {
    this.tiltShiftEffect?.dispose()
    this.renderPipeline?.dispose()
    this.tiltShiftEffect = null
    this.renderPipeline = null
    this.outputNodes = null
  }
}
