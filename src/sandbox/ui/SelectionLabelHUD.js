import { eventBus } from '../../utils/event-bus.js'
import { SANDBOX_CHANGE_EVENT } from '../SandboxScene.js'
import { t } from '../../i18n/i18n.js'

/**
 * Top-right tiny readout: brick count, current Y, current rotation.
 * One line of text. Updates on every state change.
 */
export class SelectionLabelHUD {
  constructor({ state, parent = document.body }) {
    this.state = state
    this.parent = parent
    this._onChange = () => this._render()

    this.element = document.createElement('div')
    this.element.className = 'sandbox-selection-label'
    this.parent.appendChild(this.element)

    eventBus.on(SANDBOX_CHANGE_EVENT, this._onChange)
    this._render()
  }

  _render() {
    const s = this.state.state
    const count = s.placements.length
    const rotDeg = Math.round((s.rotation * 180 / Math.PI)) % 360
    const unit = t(
      count === 1 ? 'sandbox.selection.bricksOne' : 'sandbox.selection.bricksMany',
      count === 1 ? 'brick' : 'bricks'
    )
    this.element.textContent =
      `${count} ${unit} · Y ${s.targetY} · ${rotDeg}°`
  }

  dispose() {
    eventBus.off(SANDBOX_CHANGE_EVENT, this._onChange)
    this.element.parentElement?.removeChild(this.element)
  }
}