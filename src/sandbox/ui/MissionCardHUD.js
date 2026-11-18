import { eventBus } from '../../utils/event-bus.js'
import { LOCALE_CHANGED_EVENT, t } from '../../i18n/i18n.js'
import { SANDBOX_CHANGE_EVENT, SANDBOX_MISSION_COMPLETE_EVENT } from '../SandboxScene.js'

/**
 * Bottom-left mission card. Shows the current objective, a tiny
 * progress bar (mission N / total), and a short hint. Disappears when
 * all missions are complete.
 */
export class MissionCardHUD {
  constructor({ missionManager, state, parent = document.body }) {
    this.missionManager = missionManager
    this.state = state
    this.parent = parent

    this._onChange = () => this._render()
    this._onComplete = (e) => this._onMissionComplete(e)

    this.element = document.createElement('div')
    this.element.className = 'sandbox-mission-card'
    this.parent.appendChild(this.element)

    eventBus.on(SANDBOX_CHANGE_EVENT, this._onChange)
    eventBus.on(SANDBOX_MISSION_COMPLETE_EVENT, this._onComplete)
    this._render()
  }

  _onMissionComplete({ mission, index }) {
    this._flash(mission)
  }

  _flash(mission) {
    this.element.classList.add('is-flashing')
    setTimeout(() => this.element.classList.remove('is-flashing'), 800)
    this._render()
  }

  _render() {
    const active = this.missionManager.activeMission
    const progress = this.missionManager.progress
    if (!active) {
      this.element.innerHTML = `
        <div class="sandbox-mission-card__panel">
          <p class="sandbox-mission-card__title">${this._escape(t('sandbox.missions.allComplete', 'All missions complete 🎉'))}</p>
        </div>
      `
      return
    }
    this.element.innerHTML = `
      <div class="sandbox-mission-card__panel">
        <div class="sandbox-mission-card__header">
          <span class="sandbox-mission-card__progress">${progress.done + 1} / ${progress.total}</span>
          <span class="sandbox-mission-card__title">${this._escape(active.title)}</span>
        </div>
        <p class="sandbox-mission-card__brief">${this._escape(active.brief)}</p>
        <p class="sandbox-mission-card__hint">${this._escape(active.nextHint ?? '')}</p>
      </div>
    `
  }

  _escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]))
  }

  dispose() {
    eventBus.off(SANDBOX_CHANGE_EVENT, this._onChange)
    eventBus.off(SANDBOX_MISSION_COMPLETE_EVENT, this._onComplete)
    this.element.parentElement?.removeChild(this.element)
  }
}