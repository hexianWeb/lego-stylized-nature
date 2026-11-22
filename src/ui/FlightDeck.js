import { createCockpitOverlay } from './cockpit/cockpit-overlay.mjs'
import { getHeadingDegrees } from './FlightNavigation.js'

const VIEW_NAMES = { top: '俯视', chase: '追尾', cockpit: '驾驶舱' }
const STUNT_NAMES = { roll: '翻滚', backLoop: '后空翻', frontLoop: '前空翻' }
const DEGREES = 180 / Math.PI

export const flightDeckMarkup = '<canvas class="cockpit-overlay" aria-hidden="true" hidden></canvas>'

export function getCockpitTelemetry(state, cellSize, camera) {
  // One terrain cell represents one simulated meter. Altitude is relative to world y=0.
  const metersPerUnit = 1 / cellSize
  camera.updateWorldMatrix(true, false)
  const basis = camera.matrixWorld.elements
  return {
    speedKmh: state.velocity.length() * metersPerUnit * 3.6,
    thrustPercent: state.boost * 100,
    altitudeM: state.position.y * metersPerUnit,
    verticalSpeedMps: state.velocity.y * metersPerUnit,
    pitchDeg: Math.asin(Math.max(-1, Math.min(1, -basis[9]))) * DEGREES,
    // Canvas y points down. Project the world up axis onto the camera's right and up axes.
    horizonRollDeg: Math.atan2(basis[1], basis[5]) * DEGREES,
    headingDeg: getHeadingDegrees(state.yaw),
  }
}

export default class FlightDeck {
  constructor(root) {
    this.root = root
    this.canvas = root.querySelector('.cockpit-overlay')
    this.status = root.querySelector('[data-flight-status]')
    this.alt = root.querySelector('[data-alt]')
    this.view = root.querySelector('[data-view]')
  }

  renderCockpit(player, cellSize, delta) {
    if (player?.enabled && !this.cockpitLoading) {
      const { maxSpeed, ceiling } = player.motionConfig
      this.cockpitLoading = createCockpitOverlay(this.canvas, {
        gaugeRanges: { speed: maxSpeed / cellSize * 3.6, altitude: ceiling / cellSize, climb: maxSpeed / cellSize },
      }).then((cockpit) => {
        if (!this.disposed) this.cockpit = cockpit
      }).catch((error) => {
        if (!this.disposed) console.warn('[FlightDeck] 驾驶舱仪表加载失败。', error)
      })
    }

    const camera = player?.experience.worldCamera
    const visible = Boolean(this.cockpit && player?.enabled && camera?.insideCockpit)
    const wasVisible = !this.canvas.hidden
    if (visible !== wasVisible) {
      this.canvas.hidden = !visible
      this.root.classList.toggle('has-cockpit-overlay', visible)
      if (visible) this.cockpit.reset()
    }
    if (visible) this.cockpit.render(delta, getCockpitTelemetry(player.state, cellSize, camera.instance))
  }

  update(player, cellSize) {
    if (!player?.enabled) return
    const s = player.state
    const clearance = s.surfaceKnown ? Math.max(0, (s.position.y - s.groundHeight) / cellSize).toFixed(1) : '—'
    this.alt.textContent = clearance
    this.view.textContent = VIEW_NAMES[player.view]
    const status = player.paused ? '飞行已暂停'
      : s.noticeTime > 0 && s.blocked ? (s.blocked === 'ground' ? '下方净空不足' : '已达空翻限高')
        : STUNT_NAMES[s.stunt?.kind] ?? (s.boost > 0.55 ? '加速中' : '自由巡航')
    if (this.status.textContent !== status) this.status.textContent = status
  }

  dispose() {
    this.disposed = true
    this.cockpit = null
    this.canvas.remove()
  }
}
