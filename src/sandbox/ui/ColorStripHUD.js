import { eventBus } from '../../utils/event-bus.js'
import { STANDARD_PALETTE } from '../../assets/manifests/partsCatalog.js'
import { SANDBOX_CHANGE_EVENT } from '../SandboxScene.js'

/**
 * Bottom-left row of 12 color swatches. Click selects.
 */
export class ColorStripHUD {
  constructor({ state, palette = STANDARD_PALETTE, parent = document.body }) {
    this.state = state
    this.palette = palette
    this.parent = parent
    this._onChange = () => this._render()

    this.element = document.createElement('div')
    this.element.className = 'sandbox-color-strip'
    this.parent.appendChild(this.element)

    eventBus.on(SANDBOX_CHANGE_EVENT, this._onChange)
    this._render()
  }

  _render() {
    const active = this.state.state.color
    this.element.innerHTML = `
      <div class="sandbox-color-strip__row">
        ${this.palette.map((hex) => `
          <button
            type="button"
            class="sandbox-color-strip__swatch ${hex === active ? 'is-selected' : ''}"
            data-color="${hex}"
            style="--swatch-color: ${hex};"
            aria-label="${hex}"
            aria-pressed="${hex === active}"
          ></button>
        `).join('')}
      </div>
    `
    this.element.querySelectorAll('[data-color]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const color = btn.getAttribute('data-color')
        this.state.setColor(color)
      })
    })
  }

  dispose() {
    eventBus.off(SANDBOX_CHANGE_EVENT, this._onChange)
    this.element.parentElement?.removeChild(this.element)
  }
}