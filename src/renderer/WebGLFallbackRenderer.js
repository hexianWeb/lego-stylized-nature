import { WebGLRenderer, PCFSoftShadowMap, ACESFilmicToneMapping, SRGBColorSpace, NoToneMapping } from 'three'

/**
 * Minimal WebGL fallback renderer that mirrors the WebGPU `Renderer`
 * interface (`attachPipeline`, `render`, `setSizeFromSizes`, `dispose`).
 *
 * Used when `WebGPURenderer.init()` fails (browser without WebGPU).
 * Drops the WebGPU post-processing chain (tilt-shift + speed-lines)
 * but keeps the same scene / camera / lighting so the basic sandbox
 * still works.
 *
 * Construction throws when WebGL is also unavailable; the caller
 * (Experience.init) then enters SSR-2D mode.
 */
export class WebGLFallbackRenderer {
  constructor({ canvas }) {
    let gl = null
    try {
      gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    } catch (e) {
      // fall through to throw below
    }
    if (!gl) {
      throw new Error('WebGL context unavailable')
    }
    this.instance = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      context: gl
    })
    this.instance.outputColorSpace = SRGBColorSpace
    this.instance.toneMapping = ACESFilmicToneMapping
    this.instance.toneMappingExposure = 0.9
    this.instance.shadowMap.enabled = true
    this.instance.shadowMap.type = PCFSoftShadowMap
    this.kind = 'webgl-fallback'
  }

  attachPipeline(scene, camera) {
    this.scene = scene
    this.camera = camera
  }

  render() {
    if (!this.scene || !this.camera) return
    this.instance.render(this.scene, this.camera)
  }

  setSizeFromSizes(sizes) {
    this.instance.setSize(sizes.width, sizes.height)
    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  }

  resize() {}

  updatePostProcessingTime() {}

  postProcessingController = {
    setTiltShiftEnabled: () => {},
    setSpeedLinesEnabled: () => {}
  }

  dispose() {
    this.instance.dispose()
  }
}