import { eventBus as defaultEventBus } from '../utils/event-bus.js'
import {
  getLocale,
  getLocaleLabel,
  getSupportedLocales,
  LOCALE_CHANGED_EVENT,
  setLocale
} from '../i18n/i18n.js'

export function createLocaleSwitch({
  eventBus = defaultEventBus,
  className = 'locale-switch'
} = {}) {
  const element = document.createElement('div')
  element.className = className

  const render = () => {
    element.replaceChildren()
    const currentLocale = getLocale()

    for (const locale of getSupportedLocales()) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `${className}__button`
      button.textContent = getLocaleLabel(locale)
      button.setAttribute('aria-pressed', locale === currentLocale ? 'true' : 'false')
      button.disabled = locale === currentLocale
      button.addEventListener('click', () => setLocale(locale))
      element.appendChild(button)
    }
  }

  const onLocaleChanged = () => render()
  eventBus.on(LOCALE_CHANGED_EVENT, onLocaleChanged)
  render()

  return {
    element,
    dispose() {
      eventBus.off(LOCALE_CHANGED_EVENT, onLocaleChanged)
    }
  }
}
