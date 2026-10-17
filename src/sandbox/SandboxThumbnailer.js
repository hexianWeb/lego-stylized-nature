import { WebGLRenderer, OrthographicCamera, Scene, Mesh, MeshBasicMaterial, Box3, Vector3, Color } from 'three'
import { LDrawPartLoader } from '../utils/LDrawPartLoader.js'

const THUMB_SIZE = 64

/**
 * Lazy GPU thumbnail cache for the part strip.
 *
 * One shared offscreen `WebGLRenderer` (separate from the main WebGPU
 * renderer) renders each requested LDraw part once at 64×64 and caches
 * the data URL. The WebGL path is used because `WebGPURenderer`'s
 * `GPUCanvasContext` does not support `toDataURL()` — WebGL canvases
 * do.
 *
 * Render path:
 *  - LDrawPartLoader.loadPart(partNumber) yields a merged BufferGeometry
 *  - Center & frame the geometry inside a 1-unit orthographic view
 *  - `renderer.render(scene, camera)` → `canvas.toDataURL('image/png')`
 */
export class SandboxThumbnailer {
  constructor({ cellSize, layerHeight, partsBasePath = '/model/parts/' } = {}) {
    this.cellSize = cellSize
    this.layerHeight = layerHeight
    this.partLoader = new LDrawPartLoader({ cellSize, layerHeight, partsBasePath })

    this.cache = new Map()
    this._inflight = new Map()

    this._renderer = null
    this._scene = null
    this._camera = null
    this._canvas = null
  }

  _ensureSetup() {
    if (this._renderer) return
    const canvas = document.createElement('canvas')
    canvas.width = THUMB_SIZE
    canvas.height = THUMB_SIZE
    canvas.style.position = 'absolute'
    canvas.style.left = '-9999px'
    canvas.style.top = '0'
    canvas.style.pointerEvents = 'none'
    document.body.appendChild(canvas)
    this._canvas = canvas

    this._renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: true
    })
    this._renderer.setPixelRatio(window.devicePixelRatio)
    this._renderer.setSize(THUMB_SIZE, THUMB_SIZE, false)

    this._scene = new Scene()

    this._camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
    this._camera.position.set(0, 0, 10)
    this._camera.lookAt(0, 0, 0)
  }

  /**
   * Returns a data URL (or null on failure). Cached per-partNumber.
   */
  async ensureThumbnail(partNumber) {
    if (this.cache.has(partNumber)) return this.cache.get(partNumber)
    if (this._inflight.has(partNumber)) return this._inflight.get(partNumber)

    const promise = (async () => {
      this._ensureSetup()

      const asset = await this.partLoader.loadPart(partNumber).catch((err) => {
        console.warn(`[Thumbnailer] Failed to load ${partNumber}:`, err)
        return null
      })
      if (!asset) return null

      const mesh = new Mesh(asset.geometry, new MeshBasicMaterial({ color: new Color(0xfec101) }))
      this._scene.add(mesh)

      const bbox = new Box3().setFromObject(mesh)
      const size = new Vector3()
      bbox.getSize(size)
      const center = new Vector3()
      bbox.getCenter(center)
      mesh.position.sub(center)

      const maxDim = Math.max(size.x, size.y, size.z) || 1
      const viewSize = maxDim * 1.4
      this._camera.left = -viewSize / 2
      this._camera.right = viewSize / 2
      this._camera.top = viewSize / 2
      this._camera.bottom = -viewSize / 2
      this._camera.near = 0.01
      this._camera.far = maxDim * 10
      this._camera.position.set(0, 0, maxDim * 3)
      this._camera.lookAt(0, 0, 0)
      this._camera.updateProjectionMatrix()

      this._renderer.render(this._scene, this._camera)
      const dataUrl = this._renderer.domElement.toDataURL('image/png')

      this._scene.remove(mesh)
      mesh.material.dispose()

      this.cache.set(partNumber, dataUrl)
      return dataUrl
    })()

    this._inflight.set(partNumber, promise)
    try {
      return await promise
    } finally {
      this._inflight.delete(partNumber)
    }
  }

  /**
   * Synchronous check: returns the cached URL or null.
   */
  cached(partNumber) {
    return this.cache.get(partNumber) ?? null
  }

  dispose() {
    this.partLoader.dispose()
    if (this._canvas) this._canvas.parentElement?.removeChild(this._canvas)
    this._renderer?.dispose()
    this._renderer = null
    this._scene = null
    this._camera = null
    this._canvas = null
    this.cache.clear()
    this._inflight.clear()
  }
}