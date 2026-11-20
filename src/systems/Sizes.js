export default class Sizes {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    const view = canvas.ownerDocument.defaultView
    this.width = canvas.clientWidth || Math.max(1, view.innerWidth)
    this.height = canvas.clientHeight || Math.max(1, view.innerHeight)
    this.pixelRatio = view.devicePixelRatio || 1
    this._listeners = new Set()
    this._frame = null
    this._onResize = () => {
      if (this._frame !== null) return
      this._frame = view.requestAnimationFrame(() => {
        this._frame = null
        const width = canvas.clientWidth
        const height = canvas.clientHeight
        const pixelRatio = view.devicePixelRatio || 1
        if (!width || !height) return
        if (width === this.width && height === this.height && pixelRatio === this.pixelRatio) return
        this.width = width
        this.height = height
        this.pixelRatio = pixelRatio
        for (const fn of this._listeners) fn()
      })
    }

    const visualViewport = view.visualViewport
    view.addEventListener('resize', this._onResize)
    visualViewport?.addEventListener('resize', this._onResize)
    // A mobile resize event can arrive before the canvas's new layout is ready.
    const observer = view.ResizeObserver ? new view.ResizeObserver(this._onResize) : null
    observer?.observe(canvas)
    this._disconnect = () => {
      view.removeEventListener('resize', this._onResize)
      visualViewport?.removeEventListener('resize', this._onResize)
      observer?.disconnect()
      if (this._frame !== null) view.cancelAnimationFrame(this._frame)
      this._frame = null
    }
  }

  /**
   * @param {() => void} fn
   * @returns {() => void} unsubscribe
   */
  onResize(fn) {
    this._listeners.add(fn)
    return () => {
      this._listeners.delete(fn)
    }
  }

  dispose() {
    this._disconnect()
    this._listeners.clear()
  }
}
