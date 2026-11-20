const VIEW_NAMES = { top: '俯视', chase: '追尾', cockpit: '驾驶舱' }
const STUNT_NAMES = { roll: '翻滚', backLoop: '后空翻', frontLoop: '前空翻' }

export const flightDeckMarkup = `
  <div class="cockpit-frame" aria-hidden="true" hidden>
    <svg viewBox="0 0 480 240" preserveAspectRatio="none">
      <g fill="#25353d" stroke="#657f82" stroke-width="2" stroke-linejoin="bevel">
        <path d="M0 16 17 16 55 0 69 0 22 25 10 31 0 84Z M480 16 463 16 425 0 411 0 458 25 470 31 480 84Z"/>
        <path d="M0 149 13 170 40 188 70 217 108 225 145 225 162 238 318 238 335 225 372 225 410 217 440 188 467 170 480 149V240H0Z"/>
        <path d="M161 240 186 211 200 204H280L294 211 319 240Z"/>
      </g>
      <g fill="#f6aa58"><path d="M38 197h8l9 9h-8z M49 208h8l8 8h-8z M442 197h-8l-9 9h8z M431 208h-8l-8 8h8z"/></g>
      <path d="M198 217h84l9 16H189Z" fill="#152a30" stroke="#548084"/>
    </svg>
    <div class="flight-glass"><i></i><b>⌃</b><i></i></div>
    <span class="cockpit-instruments" data-cockpit-readout></span>
  </div>
  <div class="flight-pads flight-panel hud-part" data-flight-pads aria-label="飞行特技" hidden>
    <button type="button" data-flight-hold>加速</button><button type="button" data-stunt="roll">翻滚</button>
    <button type="button" data-stunt="frontLoop">前空翻</button><button type="button" data-stunt="backLoop">后空翻</button>
  </div>`

export default class FlightDeck {
  constructor(root, getPlayer, options) {
    this.getPlayer = getPlayer
    this.frame = root.querySelector('.cockpit-frame')
    this.readout = root.querySelector('[data-cockpit-readout]')
    this.pads = root.querySelector('[data-flight-pads]')
    this.hold = this.pads.querySelector('[data-flight-hold]')
    this.status = root.querySelector('[data-flight-status]')
    this.panelStatus = root.querySelector('[data-panel-status]')
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
    const player = this.getPlayer()
    if (player) player.input.touchBoost = false
    this.hold.classList.remove('held')
    if (id != null && this.hold.hasPointerCapture(id)) this.hold.releasePointerCapture(id)
  }

  setTouchEnabled(enabled) {
    if (!enabled) this.release()
    this.pads.hidden = !enabled
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
    this.status.textContent = this.panelStatus.textContent = status
    this.frame.hidden = player.experience.worldCamera.insideCockpit !== true
    if (!this.frame.hidden) {
      const heading = (Math.round(s.yaw * 180 / Math.PI + 90) % 360 + 360) % 360
      this.readout.textContent = `HDG ${String(heading).padStart(3, '0')}°  ·  AGL ${clearance}`
    }
  }
}
