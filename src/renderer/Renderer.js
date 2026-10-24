import {
  dot,
  float,
  Fn,
  mix,
  pass,
  renderOutput,
  screenUV,
  smoothstep,
  vec3,
  vec4,
} from 'three/tsl'
import * as THREE from 'three/webgpu'
import { installObjectResourceCleanup } from './installObjectResourceCleanup.js'
import { installPrefabRenderPreparation } from './installPrefabRenderPreparation.js'

// dist is scaled so screen corners sit near 1.0 (~sqrt(2)/2 * 1.42)
const VIGNETTE_INNER = 0.22
const VIGNETTE_OUTER = 0.92
// Linear 0.6 converts to about sRGB 0.8, matching the previous corner darkening.
const VIGNETTE_AMOUNT = 0.42
const TOY_CONTRAST_STRENGTH = 0.18
const TOY_SATURATION = 1.22
const LUMA_WEIGHTS = vec3(0.2126, 0.7152, 0.0722)

const applyVignette = Fn(() => {
  const dist = screenUV.sub(0.5).length().mul(1.42)
  const mask = smoothstep(VIGNETTE_INNER, VIGNETTE_OUTER, dist)
  return float(1.0).sub(mask.mul(VIGNETTE_AMOUNT))
})

const applyToyGrade = Fn(([rgb]) => {
  const clamped = rgb.clamp(0.0, 1.0)
  const contrasted = mix(clamped, smoothstep(0.0, 1.0, clamped), TOY_CONTRAST_STRENGTH)
  const luma = dot(contrasted, LUMA_WEIGHTS)
  return mix(vec3(luma), contrasted, TOY_SATURATION).max(0.0)
})

export default class Renderer {
  /**
   * @param {{
   *   canvas: HTMLCanvasElement,
   *   trackTimestamp?: boolean,
   *   postProcessing?: {
   *     enabled?: boolean
   *   }
   * }} options
   */
  constructor({ canvas, postProcessing = {}, trackTimestamp = false }) {
    this.instance = new THREE.WebGPURenderer({
      canvas,
      forceWebGL: false,
      trackTimestamp,
      antialias: true,
    })
    this.instance.outputColorSpace = THREE.SRGBColorSpace
    this.instance.toneMapping = THREE.ACESFilmicToneMapping
    this.instance.toneMappingExposure = 1.22
    this.instance.shadowMap.enabled = true
    this.instance.shadowMap.type = THREE.PCFSoftShadowMap
    // Count all scene, shadow and postprocessing passes in one game frame.
    this.instance.info.autoReset = false

    this.postProcessingEnabled = postProcessing.enabled !== false

    /** @type {THREE.RenderPipeline | null} */
    this.renderPipeline = null
    this.scene = null
    this.camera = null
    this.pipelineNodes = []
    this.initialized = false
    this.disposed = false
    this.prefabPreparation = null
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

    this.renderPipeline = new THREE.RenderPipeline(this.instance)
    this.renderPipeline.outputColorTransform = false
    this.renderPipeline.outputNode = this.createFinalOutput(sceneColor)
  }

  createFinalOutput(sceneColor) {
    const color = renderOutput(sceneColor, this.instance.toneMapping, THREE.LinearSRGBColorSpace)
    const graded = applyToyGrade(color.rgb)
    const vignetted = vec4(graded.mul(applyVignette()), color.a)
    return renderOutput(vignetted, THREE.NoToneMapping, THREE.SRGBColorSpace)
  }

  async init() {
    await this.instance.init()
    this.initialized = true
    if (this.disposed) {
      this.instance.dispose()
      throw new Error('[Renderer] Disposed during initialization')
    }
    this.objectResourceCleanup = installObjectResourceCleanup(this.instance)
    this.prefabPreparation = installPrefabRenderPreparation(this.instance)
  }

  releaseSceneObjects(group) {
    this.prefabPreparation?.releaseGroup(group)
    this.objectResourceCleanup?.releaseGroup(group)
  }

  async prepareVisiblePrefabs() {
    // Rendering discovers the exact main and shadow RenderObjects. Preparing one
    // pass may expose another, so drain until a complete render queues no work.
    if (!this.prefabPreparation)
      return
    do {
      await this.prefabPreparation.whenIdle()
      if (this.disposed)
        return
      this.render()
    } while (this.prefabPreparation.metrics.pending > 0)
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
    }
    else {
      this.instance.render(this.scene, this.camera)
    }
  }

  disposePipeline() {
    this.renderPipeline?.dispose()
    const nodes = new Set(this.pipelineNodes ?? [])
    for (const node of nodes) {
      // r185's RTTNode inherits Node.dispose() without releasing these allocations.
      if (node.isRTTNode) {
        node.renderTarget.dispose()
        node._quadMesh.material.dispose()
      }
      node.dispose()
    }
    this.pipelineNodes = []
    this.renderPipeline = null
  }

  dispose() {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.prefabPreparation?.dispose()
    this.prefabPreparation = null
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
