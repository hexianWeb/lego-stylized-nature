import { createCockpitOverlay } from './cockpit/cockpit-overlay.mjs'
import { getHeadingDegrees } from './FlightNavigation.js'

const VIEW_NAMES = { top: '俯视', chase: '追尾', cockpit: '驾驶舱' }
const STUNT_NAMES = { roll: '翻滚', backLoop: '后空翻', frontLoop: '前空翻' }
const DEGREES = 180 / Math.PI

export const flightDeckMarkup = `
  <canvas class="cockpit-overlay" aria-hidden="true" hidden></canvas>
  <div class="flight-pads flight-panel hud-part" data-flight-pads aria-label="飞行特技" hidden>
    <button type="button" data-flight-hold>加速</button><button type="button" data-stunt="roll">翻滚</button>
    <button type="button" data-stunt="frontLoop">前空翻</button><button type="button" data-stunt="backLoop">后空翻</button>
  </div>`

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
  constructor(root, getPlayer, options) {
    this.root = root
    this.getPlayer = getPlayer
    this.canvas = root.querySelector('.cockpit-overlay')
    this.pads = root.querySelector('[data-flight-pads]')
    this.hold = this.pads.querySelector('[data-flight-hold]')
    this.status = root.querySelector('[data-flight-status]')
    this.alt = root.querySelector('[data-alt]')
    this.view = root.querySelector('[data-view]')
    this.hold.addEventListener('pointerdown', e => {
      if (this.pads.hidden || this.finger != null || e.button !== 0) return
      e.preventDefault()
      this.finger = e.pointerId
      this.hold.setPointerCapture(e.pointerId)
      getPlayer().input.touchBoost = true
      this.hold.classList.add('held')
    }, options)
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.hold.addEventListener(type, e => {
        if (e.pointerId === this.finger) this.release()
      }, options)
    }
    this.pads.addEventListener('click', e => {
      const stunt = e.target.closest('[data-stunt]')?.dataset.stunt
      if (stunt && !this.pads.hidden) getPlayer()?.input.request(stunt)
    }, options)
    window.addEventListener('blur', () => this.release(), options)
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.release() }, options)
  }

  release() {
    const id = this.finger
    this.finger = null
    if (id == null) return
    const player = this.getPlayer()
    if (player) player.input.touchBoost = false
    this.hold.classList.remove('held')
    if (this.hold.hasPointerCapture(id)) this.hold.releasePointerCapture(id)
  }

  setTouchEnabled(enabled) {
    if (!enabled) this.release()
    this.pads.hidden = !enabled
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
    this.release()
    this.cockpit = null
    this.canvas.remove()
  }
}
