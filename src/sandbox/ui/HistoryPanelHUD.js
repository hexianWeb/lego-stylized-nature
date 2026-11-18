import { eventBus } from '../../utils/event-bus.js'
import { SANDBOX_CHANGE_EVENT } from '../SandboxScene.js'
import { t } from '../../i18n/i18n.js'

/**
 * Top-left panel: last 5 undo steps. Click any step to roll back to
 * that point. The list is re-rendered on every state change so the
 * button labels stay in sync with the action that produced them.
 */
export class HistoryPanelHUD {
  constructor({ history, onUndoTo, parent = document.body, size = 5 }) {
    this.history = history
    this.onUndoTo = onUndoTo
    this.parent = parent
    this.size = size

    this._onChange = () => this._render()

    this.element = document.createElement('div')
    this.element.className = 'sandbox-history-panel'
    this.parent.appendChild(this.element)

    eventBus.on(SANDBOX_CHANGE_EVENT, this._onChange)
    this._render()
  }

  _render() {
    const recent = this.history.recent(this.size)
    if (recent.length === 0) {
      this.element.classList.add('is-empty')
      this.element.innerHTML = `<p class="sandbox-history-panel__empty">${this._escape(t('sandbox.history.empty', 'No actions yet'))}</p>`
      return
    }
    this.element.classList.remove('is-empty')
    // Render oldest → newest so the top entry is the most recent action.
    const items = recent.slice().reverse()
    this.element.innerHTML = `
      <h3 class="sandbox-history-panel__title">${this._escape(t('sandbox.history.title', 'History'))}</h3>
      <ol class="sandbox-history-panel__list">
        ${items.map((entry, idx) => {
          const targetStackSize = this.history.size().undo - (items.length - 1 - idx)
          return `
            <li>
              <button
                type="button"
                class="sandbox-history-panel__item"
                data-target-size="${targetStackSize}"
              >
                <span class="sandbox-history-panel__step">${items.length - idx}</span>
                <span class="sandbox-history-panel__label">${this._escape(entry.label)}</span>
              </button>
            </li>
          `
        }).join('')}
      </ol>
    `
    this.element.querySelectorAll('[data-target-size]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = Number(btn.getAttribute('data-target-size'))
        this.onUndoTo(target)
        this._render()
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
    this.element.parentElement?.removeChild(this.element)
  }
}