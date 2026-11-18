import { eventBus } from '../../utils/event-bus.js'
import { LOCALE_CHANGED_EVENT, t } from '../../i18n/i18n.js'
import { SANDBOX_ACHIEVEMENT_EVENT, SANDBOX_MISSION_COMPLETE_EVENT } from '../SandboxScene.js'

const HOLD_MS = 2500
const FADE_MS = 400
const MISSION_HOLD_MS = 3500
const MISSION_FADE_MS = 500

/**
 * Top-center toast that slides in on achievement events, holds 2.5s, then
 * fades out. Multiple achievements queue if needed.
 */
export class AchievementHUD {
  constructor({ parent = document.body }) {
    this.parent = parent
    this.queue = []

    this.element = document.createElement('div')
    this.element.className = 'sandbox-achievement'
    this.element.setAttribute('aria-live', 'polite')
    this.parent.appendChild(this.element)

    this._onAchievement = (e) => this._enqueue(e)
    this._onMission = (e) => this._enqueueMission(e)
    this._onLocaleChanged = () => this._renderCurrent()

    eventBus.on(SANDBOX_ACHIEVEMENT_EVENT, this._onAchievement)
    eventBus.on(SANDBOX_MISSION_COMPLETE_EVENT, this._onMission)
    eventBus.on(LOCALE_CHANGED_EVENT, this._onLocaleChanged)
  }

  _enqueue({ id, label }) {
    this.queue.push({ id, label })
    if (!this._showing) this._showNext()
  }

  _enqueueMission({ mission, index }) {
    this.queue.push({
      id: `mission-${mission.id}`,
      label: mission.title,
      brief: mission.brief,
      nextHint: mission.nextHint,
      isMission: true,
      index
    })
    if (!this._showing) this._showNext()
  }

  _showNext() {
    const next = this.queue.shift()
    if (!next) {
      this._showing = false
      this.element.innerHTML = ''
      return
    }
    this._showing = true
    this._current = next
    this._renderCurrent()
    clearTimeout(this._fadeTimer)
    clearTimeout(this._hideTimer)
    const holdMs = next.isMission ? MISSION_HOLD_MS : HOLD_MS
    const fadeMs = next.isMission ? MISSION_FADE_MS : FADE_MS
    if (next.isMission) this.element.classList.add('is-mission')
    this._fadeTimer = setTimeout(() => {
      this.element.classList.add('is-fading')
    }, holdMs)
    this._hideTimer = setTimeout(() => {
      this.element.classList.remove('is-fading', 'is-mission')
      this.element.innerHTML = ''
      this._current = null
      this._showNext()
    }, holdMs + fadeMs)
  }

  _renderCurrent() {
    if (!this._current) return
    const cur = this._current
    const titleKey = cur.isMission ? 'sandbox.missions.completeTitle' : 'sandbox.achievements.title'
    const title = t(titleKey, cur.isMission ? 'Mission complete' : 'Milestone')
    const label = cur.isMission
      ? `${cur.label} ✓`
      : t('sandbox.achievements.' + cur.id, cur.label)
    const nextHint = cur.isMission && cur.nextHint
      ? `<p class="sandbox-achievement__hint">${this._escape(t('sandbox.missions.next', 'Next'))}: ${this._escape(cur.nextHint)}</p>`
      : ''
    this.element.innerHTML = `
      <div class="sandbox-achievement__panel">
        <span class="sandbox-achievement__sparkle" aria-hidden="true">${cur.isMission ? '★' : '✦'}</span>
        <span class="sandbox-achievement__title">${this._escape(title)}</span>
        <span class="sandbox-achievement__label">${this._escape(label)}</span>
        ${nextHint}
      </div>
    `
  }

  _escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]))
  }

  dispose() {
    eventBus.off(SANDBOX_ACHIEVEMENT_EVENT, this._onAchievement)
    eventBus.off(SANDBOX_MISSION_COMPLETE_EVENT, this._onMission)
    eventBus.off(LOCALE_CHANGED_EVENT, this._onLocaleChanged)
    this.element.parentElement?.removeChild(this.element)
  }
}