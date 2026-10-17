import { eventBus } from '../../utils/event-bus.js'
import { LOCALE_CHANGED_EVENT, t } from '../../i18n/i18n.js'
import { SANDBOX_CHANGE_EVENT } from '../SandboxScene.js'

const CATEGORY_IDS = [
  'all', 'brick', 'plate', 'slope', 'tile',
  'round', 'wedge', 'technic', 'baseplate', 'decor'
]

/**
 * Bottom-right segmented control for the part strip filter.
 */
export class CategoryFilterHUD {
  constructor({ state, parent = document.body }) {
    this.state = state
    this.parent = parent
    this._onChange = () => this._render()
    this._onLocaleChanged = () => this._render()

    this.element = document.createElement('div')
    this.element.className = 'sandbox-category-filter'
    this.parent.appendChild(this.element)

    eventBus.on(SANDBOX_CHANGE_EVENT, this._onChange)
    eventBus.on(LOCALE_CHANGED_EVENT, this._onLocaleChanged)
    this._render()
  }

  _render() {
    const active = this.state.state.category
    this.element.innerHTML = `
      <div class="sandbox-category-filter__row">
        ${CATEGORY_IDS.map((id) => `
          <button
            type="button"
            class="sandbox-category-filter__btn ${id === active ? 'is-selected' : ''}"
            data-category="${id}"
            aria-pressed="${id === active}"
          >${this._escape(t(`sandbox.categories.${id}`, id))}</button>
        `).join('')}
      </div>
    `
    this.element.querySelectorAll('[data-category]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-category')
        this.state.setCategory(cat)
      })
    })
  }

  _escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]))
  }

  dispose() {
    eventBus.off(SANDBOX_CHANGE_EVENT, this._onChange)
    eventBus.off(LOCALE_CHANGED_EVENT, this._onLocaleChanged)
    this.element.parentElement?.removeChild(this.element)
  }
}