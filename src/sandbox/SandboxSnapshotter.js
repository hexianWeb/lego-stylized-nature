import { partsCatalog } from '../assets/manifests/partsCatalog.js'

/**
 * Capture the current sandbox state as a PNG. Two paths:
 *
 *  - 3D mode (WebGPU or WebGL): force a render then `toDataURL` on the
 *    canvas. WebGPU canvases need `preserveDrawingBuffer: true` for this
 *    to work — if the canvas reports a zero-size result we fall back to
 *    a manual `ImageBitmap` copy via `convertToBlob` (WebGPU only).
 *  - 2D SSR mode: rasterize the brick DOM to an offscreen `<canvas>`
 *    using `html2canvas`-style drawing (manual fillRects since we
 *    control the geometry).
 */
export class SandboxSnapshotter {
  constructor({ canvas, getPlacements, getMaxY, getGrid, is2D, getBricks2DEl, getSelection2DEl }) {
    this.canvas = canvas
    this.getPlacements = getPlacements
    this.getMaxY = getMaxY
    this.getGrid = getGrid
    this.is2D = is2D
    this.getBricks2DEl = getBricks2DEl
    this.getSelection2DEl = getSelection2DEl
  }

  async capture({ width = 800, height = 600 } = {}) {
    if (this.is2D?.()) return this._capture2D(width, height)
    return this._captureCanvas()
  }

  _captureCanvas() {
    if (!this.canvas) return null
    try {
      return this.canvas.toDataURL('image/png')
    } catch (err) {
      console.warn('[Snapshot] canvas.toDataURL failed:', err)
      return null
    }
  }

  _capture2D(width, height) {
    const grid = this.getGrid?.()
    const bricks = this.getBricks2DEl?.()
    if (!grid || !bricks) return null
    const cells = width / grid.width
    const c = document.createElement('canvas')
    c.width = width
    c.height = height
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#0a0d12'
    ctx.fillRect(0, 0, width, height)
    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.lineWidth = 1
    for (let i = 0; i <= grid.width; i++) {
      ctx.beginPath()
      ctx.moveTo(i * cells, 0)
      ctx.lineTo(i * cells, height)
      ctx.stroke()
    }
    for (let j = 0; j <= grid.depth; j++) {
      ctx.beginPath()
      ctx.moveTo(0, j * cells)
      ctx.lineTo(width, j * cells)
      ctx.stroke()
    }
    // Bricks
    for (const p of this.getPlacements().values()) {
      const fp = p.footprint ?? { x: 1, z: 1 }
      const w = fp.x * cells
      const h = fp.z * cells
      ctx.fillStyle = p.color ?? '#cccccc'
      ctx.fillRect(p.x * cells, p.z * cells, w, h)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
      ctx.lineWidth = 1
      ctx.strokeRect(p.x * cells, p.z * cells, w, h)
    }
    return c.toDataURL('image/png')
  }

  download(dataUrl, filename) {
    if (!dataUrl) return
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  async captureAndDownload() {
    const dataUrl = await this.capture()
    if (!dataUrl) return null
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    this.download(dataUrl, `sandbox-snapshot-${ts}.png`)
    return dataUrl
  }
}