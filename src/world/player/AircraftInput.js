const HELD = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']
const ACTION = { KeyR: 'roll', KeyF: 'backLoop', KeyG: 'frontLoop', Space: 'view' }
const HOLD_MS = 200
const clamp = value => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0
const axis = value => Math.sign(value) * Math.max(0, (Math.abs(clamp(value)) - 0.12) / 0.88)

export default class AircraftInput {
  constructor(target = globalThis.window ?? null, canvas = null) {
    this.target = target
    this.canvas = canvas
    this.isAttached = false
    this.listeners = []
    this.clear()
  }

  attach() {
    if (!this.target || this.isAttached) return
    const listen = (target, type, handler) => {
      if (!target) return
      target.addEventListener(type, handler)
      this.listeners.push(() => target.removeEventListener(type, handler))
    }
    listen(this.target, 'keydown', e => this.handleKeyDown(e))
    listen(this.target, 'keyup', e => this.handleKeyUp(e))
    listen(this.target, 'blur', () => this.clear())
    listen(this.canvas?.ownerDocument, 'visibilitychange', () => {
      if (this.canvas.ownerDocument.hidden) this.clear()
    })
    listen(this.canvas, 'pointerdown', e => this.pointerDown(e))
    listen(this.canvas, 'pointermove', e => this.pointerMove(e))
    listen(this.canvas, 'pointerup', e => this.pointerUp(e))
    for (const type of ['pointercancel', 'lostpointercapture'])
      listen(this.canvas, type, e => { if (this.press?.id === e.pointerId) this.cancelPointer() })
    listen(this.canvas, 'pointerleave', () => { if (!this.press) this.pointer = null })
    this.isAttached = true
  }

  handleKeyDown(e) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return
    if (e.code === 'Space' && e.target?.closest?.('button, a')) return
    if (HELD.includes(e.code)) {
      this.keys[e.code] = true
      this.pointer = null
    }
    else if (Object.hasOwn(ACTION, e.code)) this.request(ACTION[e.code])
    else return
    e.preventDefault?.()
  }

  handleKeyUp(e) {
    if (HELD.includes(e.code)) this.keys[e.code] = false
  }

  pointerDown(e) {
    if (e.button !== 0 || this.press) return
    this.canvas.focus?.({ preventScroll: true })
    this.canvas.setPointerCapture?.(e.pointerId)
    this.press = { id: e.pointerId, start: e.timeStamp, touch: e.pointerType === 'touch', x: e.clientX, y: e.clientY, moved: false }
  }

  pointerMove(e) {
    const press = this.press
    if (press && press.id !== e.pointerId) return
    if (e.pointerType === 'touch' && !press) return
    const bounds = this.canvas.getBoundingClientRect()
    const dx = e.clientX - (press?.touch ? press.x : bounds.left + bounds.width / 2)
    const dy = e.clientY - (press?.touch ? press.y : bounds.top + bounds.height / 2)
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 9) press.moved = true
    const radius = Math.max(1, Math.min(bounds.width, bounds.height) * (press?.touch ? 0.18 : 0.4))
    this.pointer = { x: axis(dx / radius), y: axis(-dy / radius) }
  }

  pointerUp(e) {
    const press = this.press
    if (press?.id !== e.pointerId || e.button !== 0) return
    if (!press.moved && e.timeStamp - press.start < HOLD_MS) this.request('roll')
    this.press = null
    if (press.touch) this.pointer = null
    if (this.canvas.hasPointerCapture?.(press.id)) this.canvas.releasePointerCapture(press.id)
  }

  cancelPointer() {
    const id = this.press?.id
    this.press = null
    this.pointer = null
    if (id !== undefined && this.canvas?.hasPointerCapture?.(id)) this.canvas.releasePointerCapture(id)
  }

  request(action) {
    if (action === 'view') this.changeView = true
    else if (['roll', 'backLoop', 'frontLoop'].includes(action)) this.stunt = action
  }

  setJoystick(x, y) { this.joystick = { x: clamp(x), y: clamp(y) } }
  getJoystick() { return { ...this.joystick } }
  getKeys() { return { ...this.keys } }

  consume(invertY = true, now = performance.now()) {
    const k = this.keys
    const stick = this.joystick.x || this.joystick.y ? this.joystick : this.pointer
    const turn = Number(k.KeyD || k.ArrowRight) - Number(k.KeyA || k.ArrowLeft)
    const vertical = Number(k.KeyW || k.ArrowUp) - Number(k.KeyS || k.ArrowDown)
    const command = {
      turn: stick?.x || turn,
      climb: (stick?.y || vertical) * (invertY ? -1 : 1),
      boost: k.ShiftLeft || k.ShiftRight || this.touchBoost || Boolean(this.press && !this.press.touch && now - this.press.start >= HOLD_MS),
      stunt: this.stunt, view: this.changeView,
    }
    this.stunt = null
    this.changeView = false
    return command
  }

  clear() {
    this.cancelPointer()
    this.keys = Object.fromEntries(HELD.map(code => [code, false]))
    this.setJoystick(0, 0)
    this.touchBoost = false
    this.stunt = null
    this.changeView = false
  }

  dispose() {
    for (const remove of this.listeners) remove()
    this.listeners.length = 0
    this.isAttached = false
    this.clear()
  }
}
