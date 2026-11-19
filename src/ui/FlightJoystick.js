const DEAD_ZONE = 0.13
const TRAVEL_RATIO = 0.29

export function resolveJoystickDrag(dx, dy, radius) {
  const distance = Math.hypot(dx, dy)
  if (radius <= 0 || distance === 0) {
    return { offsetX: 0, offsetY: 0, x: 0, y: 0 }
  }

  const reach = Math.min(1, distance / radius)
  const travel = reach * radius / distance
  const amount = Math.max(0, (reach - DEAD_ZONE) / (1 - DEAD_ZONE))
  const strength = amount ** 1.35 / distance
  return {
    offsetX: dx * travel,
    offsetY: dy * travel,
    x: dx * strength || 0,
    y: -dy * strength || 0,
  }
}

export default class FlightJoystick {
  constructor(element, onInput, options) {
    this.element = element
    this.onInput = onInput
    this.drag = null

    element.addEventListener('pointerdown', event => this.start(event), options)
    element.addEventListener('pointermove', event => this.move(event), options)
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      element.addEventListener(type, (event) => {
        if (event.pointerId === this.drag?.id) this.reset()
      }, options)
    }
    element.addEventListener('contextmenu', event => event.preventDefault(), options)
  }

  setEnabled(enabled) {
    if (!enabled) this.reset()
    this.element.hidden = !enabled
  }

  start(event) {
    if (this.element.hidden || this.drag || event.button !== 0) return
    const { width, height } = this.element.getBoundingClientRect()
    const radius = Math.min(width, height) * TRAVEL_RATIO
    if (radius <= 0) return
    event.preventDefault()
    this.element.setPointerCapture(event.pointerId)
    // Start relative to the thumb's landing point so grabbing the edge won't steer.
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, radius }
    this.element.classList.add('is-dragging')
  }

  move(event) {
    const drag = this.drag
    if (!drag || event.pointerId !== drag.id) return
    const { offsetX, offsetY, x, y } = resolveJoystickDrag(event.clientX - drag.x, event.clientY - drag.y, drag.radius)
    this.element.style.setProperty('--stick-x', `${offsetX}px`)
    this.element.style.setProperty('--stick-y', `${offsetY}px`)
    this.onInput(x, y)
  }

  reset() {
    if (!this.drag) return
    const { id } = this.drag
    this.drag = null
    this.element.classList.remove('is-dragging')
    this.element.style.removeProperty('--stick-x')
    this.element.style.removeProperty('--stick-y')
    this.onInput(0, 0)
    if (this.element.hasPointerCapture(id)) this.element.releasePointerCapture(id)
  }
}
