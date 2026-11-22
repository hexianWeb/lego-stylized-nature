const BEARING_LABELS = ['正前方', '右前方', '正右方', '右后方', '正后方', '左后方', '正左方', '左前方']

export default class ForestTrialHUD {
  constructor({ mount = document.body, title = '林地试飞' } = {}) {
    this.element = mount.ownerDocument.createElement('section')
    this.element.className = 'forest-trial-hud hud-part'
    this.element.setAttribute('aria-label', title)
    this.element.innerHTML = `
      <span class="forest-trial-hud__signal" aria-hidden="true">
        <span class="forest-trial-hud__arrow"></span><span data-trial-check hidden>✓</span>
      </span>
      <div class="forest-trial-hud__copy">
        <p class="forest-trial-hud__title" data-trial-title></p>
        <strong data-trial-waypoint role="status" aria-atomic="true"></strong>
        <p class="forest-trial-hud__detail" data-trial-detail></p>
      </div>
      <div class="forest-trial-hud__bearing">
        <span data-trial-direction></span>
        <span data-trial-distance></span>
      </div>`
    this.element.querySelector('[data-trial-title]').textContent = title
    this.arrow = this.element.querySelector('.forest-trial-hud__arrow')
    this.check = this.element.querySelector('[data-trial-check]')
    this.waypoint = this.element.querySelector('[data-trial-waypoint]')
    this.detail = this.element.querySelector('[data-trial-detail]')
    this.bearing = this.element.querySelector('.forest-trial-hud__bearing')
    this.direction = this.element.querySelector('[data-trial-direction]')
    this.distance = this.element.querySelector('[data-trial-distance]')
    this.element.hidden = true
    mount.append(this.element)
  }

  update({ waypointLabel, waypointIndex, waypointCount, distance, bearing, complete = false, detail }) {
    if (this.element.hidden) this.element.hidden = false
    const status = complete ? '试飞完成' : `${waypointIndex + 1}/${waypointCount} · ${waypointLabel}`
    const instruction = detail ?? (complete ? '用顶部的回到出生点按钮重飞' : '')

    if (this.waypoint.textContent !== status) this.waypoint.textContent = status
    if (this.detail.textContent !== instruction) this.detail.textContent = instruction
    if (this.arrow.hidden !== complete) {
      this.arrow.hidden = complete
      this.check.hidden = !complete
      this.bearing.hidden = complete
    }

    if (complete) return
    const degrees = Math.round(bearing * 180 / Math.PI)
    const octant = Math.round(degrees / 45)
    const direction = BEARING_LABELS[(octant % 8 + 8) % 8] ?? ''
    const distanceText = Number.isFinite(distance) ? `${Math.ceil(distance)} 格` : ''
    const transform = Number.isFinite(degrees) ? `rotate(${degrees}deg)` : ''

    if (this.direction.textContent !== direction) this.direction.textContent = direction
    if (this.distance.textContent !== distanceText) this.distance.textContent = distanceText
    if (this.arrow.style.transform !== transform) this.arrow.style.transform = transform
  }

  dispose() {
    this.element.remove()
  }
}
