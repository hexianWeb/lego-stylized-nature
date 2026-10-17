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

    // Kick off thumbnail loads for the visible items
    for (const entry of items) {
      if (!this.thumbnailer.cached(entry.partNumber)) {
        this.thumbnailer.ensureThumbnail(entry.partNumber).then((url) => {
          if (url) this._render()
        })
      }
    }
  }

  _thumb(entry, isActive) {
    const url = this.thumbnailer.cached(entry.partNumber)
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