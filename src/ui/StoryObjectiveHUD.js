import { eventBus as defaultEventBus } from '../utils/event-bus.js'
import { LOCALE_CHANGED_EVENT, t } from '../i18n/i18n.js'
import {
  STORY_OBJECTIVE_BLOCKED_EVENT,
  STORY_OBJECTIVE_UPDATE_EVENT
} from '../story/StoryRecordManager.js'

const DEFAULT_BIOME_COLORS = {
  forest: '#53D86A',
  autumnForest: '#F4A13D',
  desert: '#E8D45A',
  volcano: '#FF513D'
}

function hexToRgba(hex, alpha = 1) {
  const normalized = hex.replace('#', '')
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export default class StoryObjectiveHUD {
  constructor({ config, eventBus = defaultEventBus, parent = null } = {}) {
    this.config = config
    this.objectiveConfig = config?.ui?.storyObjective ?? {}
    this.enabled = this.objectiveConfig.enabled !== false
    this.eventBus = eventBus
    this.parent = parent ?? (typeof document !== 'undefined' ? document.body : null)
    this.blockedTimer = 0
    this.lastObjectivePayload = null
    this.lastBlockedPayload = null
    this._onUpdate = (payload) => this.renderObjective(payload)
    this._onBlocked = (payload) => this.renderBlocked(payload)
    this._onLocaleChanged = () => {
      if (this.lastBlockedPayload) {
        this.renderBlocked(this.lastBlockedPayload)
        return
      }

      if (this.lastObjectivePayload) {
        this.renderObjective(this.lastObjectivePayload)
      }
    }

    if (!this.enabled || typeof document === 'undefined' || !this.parent) {
      return
    }

    this.element = document.createElement('div')
    this.element.className = 'story-objective-hud'
    this.parent.appendChild(this.element)
    this.eventBus.on(STORY_OBJECTIVE_UPDATE_EVENT, this._onUpdate)
    this.eventBus.on(STORY_OBJECTIVE_BLOCKED_EVENT, this._onBlocked)
    this.eventBus.on(LOCALE_CHANGED_EVENT, this._onLocaleChanged)
  }

  resolveBiomeColor(towerId) {
    const colors = {
      ...DEFAULT_BIOME_COLORS,
      ...(this.config?.ui?.biomeRadar?.colors ?? {})
    }

    return towerId ? colors[towerId] ?? null : null
  }

  applyBiomeTheme(towerId) {
    if (!this.element) {
      return
    }

    this.element.classList.remove('story-objective-hud--blocked')
    const color = this.resolveBiomeColor(towerId)

    if (!color) {
      this.element.style.removeProperty('--objective-accent')
      this.element.style.removeProperty('--objective-eyebrow')
      this.element.style.removeProperty('--objective-text')
      return
    }

    this.element.style.setProperty('--objective-accent', hexToRgba(color, 0.82))
    this.element.style.setProperty('--objective-eyebrow', hexToRgba(color, 0.95))
    this.element.style.setProperty('--objective-text', hexToRgba(color, 1))
  }

  clearBiomeTheme() {
    if (!this.element) {
      return
    }

    this.element.classList.add('story-objective-hud--blocked')
    this.element.style.removeProperty('--objective-accent')
    this.element.style.removeProperty('--objective-eyebrow')
    this.element.style.removeProperty('--objective-text')
  }

  renderObjective(payload = {}) {
    if (!this.element) {
      return
    }

    this.lastObjectivePayload = payload
    this.lastBlockedPayload = null

    const text = payload.canActivate ? payload.activationLabel : payload.label
    this.applyBiomeTheme(payload.towerId ?? payload.objectiveId)
    this.element.innerHTML = `
      <div class="story-objective-hud__eyebrow"></div>
      <div class="story-objective-hud__text"></div>
    `
    this.element.querySelector('.story-objective-hud__eyebrow').textContent = t('storyObjective.eyebrow')
    this.element.querySelector('.story-objective-hud__text').textContent = text ?? ''
  }

  renderBlocked(payload = {}) {
    if (!this.element) {
      return
    }

    this.lastBlockedPayload = payload
    this.lastObjectivePayload = null
    this.clearBiomeTheme()
    this.element.innerHTML = `
      <div class="story-objective-hud__eyebrow story-objective-hud__eyebrow--blocked"></div>
      <div class="story-objective-hud__text"></div>
    `
    this.element.querySelector('.story-objective-hud__eyebrow--blocked').textContent = t('storyObjective.syncLocked')
    this.element.querySelector('.story-objective-hud__text').textContent = payload.message ?? t('storyObjective.blocked')
  }

  dispose() {
    this.eventBus.off(STORY_OBJECTIVE_UPDATE_EVENT, this._onUpdate)
    this.eventBus.off(STORY_OBJECTIVE_BLOCKED_EVENT, this._onBlocked)
    this.eventBus.off(LOCALE_CHANGED_EVENT, this._onLocaleChanged)
    this.element?.remove()
    this.element = null
  }
}
