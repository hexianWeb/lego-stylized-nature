import { eventBus } from '../../utils/event-bus.js'
import { partsCatalog } from '../../assets/manifests/partsCatalog.js'
import { SANDBOX_CHANGE_EVENT, SANDBOX_PART_SELECTED_EVENT, SANDBOX_THUMBNAIL_READY_EVENT } from '../SandboxScene.js'

/**
 * Bottom-center horizontal strip of part thumbnails. Each thumbnail is
 * rendered live by `SandboxThumbnailer` and cached per-partNumber. The
 * initial paint uses an SVG placeholder; once the GPU image resolves,
 * the strip re-renders to swap in the real image.
 */
export class PartStripHUD {
  constructor({ state, thumbnailer, parent = document.body }) {
    this.state = state
    this.thumbnailer = thumbnailer
    this.parent = parent
    this.entries = Object.values(partsCatalog)

    this._onChange = () => this._render()
    this._onThumbReady = (e) => {
      if (e?.partNumber) this._render()
    }

    this.element = document.createElement('nav')
    this.element.className = 'sandbox-part-strip'
    this.element.setAttribute('aria-label', 'Part strip')
    this.parent.appendChild(this.element)

    eventBus.on(SANDBOX_CHANGE_EVENT, this._onChange)
    eventBus.on(SANDBOX_THUMBNAIL_READY_EVENT, this._onThumbReady)
    this._render()
  }

  _filtered() {
    const cat = this.state.state.category
    if (cat === 'all') return this.entries
    return this.entries.filter((e) => e.category === cat)
  }

  _render() {
    const items = this._filtered()
    const active = this.state.state.partNumber
    this.element.innerHTML = `
      <div class="sandbox-part-strip__row">
        ${items.map((entry) => this._thumb(entry, active === entry.partNumber)).join('')}
      </div>
    `
    this.element.querySelectorAll('[data-part]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const partNumber = btn.getAttribute('data-part')
        this.state.setPart(partNumber)
      })
    })

    // Thumbnail policy: auto-generate only the FIRST 12 after boot
    // (categories switch triggers further passes with their own ≤12).
    // A self-feeding queue for all 112 parts starves interactive
    // loads (click-to-place) behind minutes of background parsing.
    // Thumbnail generation is DISABLED at runtime: the browser-side
    // LDraw→WebGL thumbnail pipeline wedges unpredictably (different
    // part each run, load never settles, and the shared module parse
    // queue then starves click-to-place). Placeholders (▢ + part
    // number) remain fully usable; pre-generated thumbnails can be
    // reintroduced as a build-time asset pipeline later.
    if (!this.thumbnailer) return
    return
    const schedule = typeof requestIdleCallback === 'function'
      ? requestIdleCallback
      : (fn) => setTimeout(fn, 200)
    let kicked = 0
    for (const entry of items) {
      if (this._autoKicked >= 12 || kicked >= 12) break
      if (!this.thumbnailer.cached(entry.partNumber)) {
        kicked += 1
        this._autoKicked += 1
        const partNumber = entry.partNumber
        schedule(() => {
          if (this.thumbnailer?.cached(partNumber)) return
          this.thumbnailer.ensureThumbnail(partNumber).then((url) => {
            if (url) this._render()
          })
        })
      }
    }
  }

  /**
   * The thumbnailer is created asynchronously after activation; the
   * sandbox calls this once it exists so the strip can swap its
   * placeholders for live thumbnails.
   */
  setThumbnailer(thumbnailer) {
    this.thumbnailer = thumbnailer
    this._render()
  }

  _thumb(entry, isActive) {
    const url = this.thumbnailer?.cached(entry.partNumber)
    const img = url
      ? `<img class="sandbox-part-strip__img" src="${url}" alt="${entry.displayName}" />`
      : `<span class="sandbox-part-strip__placeholder" aria-hidden="true">▢</span>`
    return `
      <button
        type="button"
        class="sandbox-part-strip__item ${isActive ? 'is-selected' : ''}"
        data-part="${entry.partNumber}"
        title="${entry.partNumber} · ${entry.displayName}"
        aria-pressed="${isActive}"
      >
        <span class="sandbox-part-strip__frame">${img}</span>
        <span class="sandbox-part-strip__number">${entry.partNumber}</span>
      </button>
    `
  }

  dispose() {
    eventBus.off(SANDBOX_CHANGE_EVENT, this._onChange)
    eventBus.off(SANDBOX_THUMBNAIL_READY_EVENT, this._onThumbReady)
    this.element.parentElement?.removeChild(this.element)
  }
}