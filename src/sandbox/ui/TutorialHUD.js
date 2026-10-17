import { eventBus } from '../../utils/event-bus.js'
import { LOCALE_CHANGED_EVENT, t } from '../../i18n/i18n.js'
import { SANDBOX_CHANGE_EVENT } from '../SandboxScene.js'

const STORAGE_KEY = 'lego-stylized-nature:sandbox:tutorial-seen'

const DEFAULT_STEPS = [
  { id: 'pickPart',  label: 'Pick a brick from the strip below.' },
  { id: 'clickBase', label: 'Click the grey baseplate to drop it.' },
  { id: 'haveFun',   label: 'Have fun. Build something.' }
]

/**
 * Three-step first-time tutorial. Listens for the first brick drop and
 * skips to the "have fun" step. Persists a `seen` flag in localStorage
 * so it never shows twice.
 */
export class TutorialHUD {
  constructor({ state, parent = document.body, steps = DEFAULT_STEPS }) {
    this.state = state
    this.parent = parent
    this.steps = steps
    this.stepIndex = 0
    this.dismissed = localStorage.getItem(STORAGE_KEY) === '1'

    this._onChange = (e) => {
      const placements = e?.snapshot?.placements?.length ?? 0
      if (placements > 0 && this.stepIndex < this.steps.length - 1 && !this.dismissed) {
        this.stepIndex = this.steps.length - 1
        this._render()
        this._scheduleHide()
      }
    }
    this._onLocaleChanged = () => this._render()

    this.element = document.createElement('div')
    this.element.className = 'sandbox-tutorial'
    this.element.setAttribute('aria-live', 'polite')
    this.parent.appendChild(this.element)

    eventBus.on(SANDBOX_CHANGE_EVENT, this._onChange)
    eventBus.on(LOCALE_CHANGED_EVENT, this._onLocaleChanged)
    if (!this.dismissed) this._render()
  }

  _render() {
    if (this.dismissed) {
      this.element.classList.add('is-hidden')
      return
    }
    const step = this.steps[this.stepIndex]
    if (!step) {
      this._scheduleHide()
      return
    }
    this.element.classList.remove('is-hidden')
    this.element.innerHTML = `
      <div class="sandbox-tutorial__panel">
        <span class="sandbox-tutorial__step">${this.stepIndex + 1} / ${this.steps.length}</span>
        <p class="sandbox-tutorial__label">${this._escape(step.label)}</p>
        <button type="button" class="sandbox-tutorial__skip" data-action="skip">${this._escape(t('sandbox.tutorial.skip', 'Skip'))}</button>
      </div>
    `
    this.element.querySelector('[data-action="skip"]')?.addEventListener('click', () => this.dismiss())
  }

  _scheduleHide() {
    clearTimeout(this._hideTimer)
    this._hideTimer = setTimeout(() => this.dismiss(), 3500)
  }

  dismiss() {
    this.dismissed = true
    try { localStorage.setItem(STORAGE_KEY, '1') } catch (e) { /* private mode */ }
    this.element.classList.add('is-hidden')
  }

  _escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]))
  }

  dispose() {
    clearTimeout(this._hideTimer)
    eventBus.off(SANDBOX_CHANGE_EVENT, this._onChange)
    eventBus.off(LOCALE_CHANGED_EVENT, this._onLocaleChanged)
    this.element.parentElement?.removeChild(this.element)
  }
}