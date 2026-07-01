import { eventBus as defaultEventBus } from '../utils/event-bus.js'
import { LOCALE_CHANGED_EVENT, t } from '../i18n/i18n.js'

const DEFAULT_BINDING_KEYS = [
  { key: 'W', labelKey: 'controlGuide.accelerate' },
  { key: 'S', labelKey: 'controlGuide.brake' },
  { key: 'A', labelKey: 'controlGuide.turnRight' },
  { key: 'D', labelKey: 'controlGuide.turnLeft' },
  { key: 'E', labelKey: 'controlGuide.activateTower' }
]

export default class ControlGuideHUD {
  constructor({ config, eventBus = defaultEventBus, parent = null } = {}) {
    this.config = config
    this.guideConfig = config?.ui?.controlGuide ?? {}
    this.enabled = this.guideConfig.enabled !== false
    this.eventBus = eventBus
    this.parent = parent ?? (typeof document !== 'undefined' ? document.body : null)
    this.bindingKeys = this.guideConfig.bindingKeys ?? DEFAULT_BINDING_KEYS
    this._onLocaleChanged = () => this.render()

    if (!this.enabled || typeof document === 'undefined' || !this.parent) {
      return
    }

    const offset = this.guideConfig.screenOffset ?? {}
    const verticalAlign = offset.verticalAlign ?? 'center'

    this.element = document.createElement('div')
    this.element.className = 'control-guide-hud'
    this.element.style.opacity = String(this.guideConfig.opacity ?? 1)

    if (Number.isFinite(offset.right)) {
      this.element.style.right = `${offset.right}px`
    }

    if (Number.isFinite(offset.left)) {
      this.element.style.left = `${offset.left}px`
    }

    if (verticalAlign === 'center') {
      this.element.style.top = '50%'
      this.element.style.transform = 'translateY(-50%)'
    } else {
      if (Number.isFinite(offset.top)) {
        this.element.style.top = `${offset.top}px`
      }

      if (Number.isFinite(offset.bottom)) {
        this.element.style.bottom = `${offset.bottom}px`
      }
    }

    this.parent.appendChild(this.element)
    this.eventBus.on(LOCALE_CHANGED_EVENT, this._onLocaleChanged)
    this.render()
  }

  render() {
    if (!this.element) {
      return
    }

    this.element.replaceChildren()

    for (const binding of this.bindingKeys) {
      const row = document.createElement('div')
      row.className = 'control-guide-hud__row'

      const keyBox = document.createElement('span')
      keyBox.className = 'control-guide-hud__key'
      keyBox.textContent = binding.key

      const label = document.createElement('span')
      label.className = 'control-guide-hud__label'
      label.textContent = binding.label ?? t(binding.labelKey)

      row.appendChild(keyBox)
      row.appendChild(label)
      this.element.appendChild(row)
    }
  }

  dispose() {
    this.eventBus.off(LOCALE_CHANGED_EVENT, this._onLocaleChanged)
    this.element?.remove()
    this.element = null
  }
}
