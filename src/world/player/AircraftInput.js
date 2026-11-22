const HELD = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']
const ACTION = { KeyR: 'roll', KeyF: 'backLoop', KeyG: 'frontLoop', Space: 'view' }

export default class AircraftInput {
  constructor(target = globalThis.window ?? null, canvas = null, { weaponsEnabled = false } = {}) {
    this.target = target
    this.canvas = canvas
    this.weaponsEnabled = weaponsEnabled
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
    if (this.weaponsEnabled) {
      listen(this.canvas, 'mousedown', e => {
        if (e.button === 0) {
          this.cannon = true
          this.cannonPressed = true
        }
        else if (e.button === 2) this.missile = true
        else return
        this.canvas.focus?.({ preventScroll: true })
        e.preventDefault?.()
      })
      listen(this.target, 'mouseup', e => {
        if (e.button === 0) this.cannon = false
      })
      listen(this.canvas, 'pointerleave', e => {
        if (e.pointerType !== 'touch') this.cannon = false
      })
      listen(this.canvas, 'contextmenu', e => e.preventDefault?.())
    }
    this.isAttached = true
  }

  handleKeyDown(e) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return
    if (e.code === 'Space' && e.target?.closest?.('button, a')) return
    if (HELD.includes(e.code)) this.keys[e.code] = true
    else if (this.weaponsEnabled && e.code === 'KeyM') this.missile = true
    else if (Object.hasOwn(ACTION, e.code)) this.request(ACTION[e.code])
    else return
    e.preventDefault?.()
  }

  handleKeyUp(e) {
    if (HELD.includes(e.code)) this.keys[e.code] = false
  }

  request(action) {
    if (action === 'view') this.changeView = true
    else if (['roll', 'backLoop', 'frontLoop'].includes(action)) this.stunt = action
  }

  getKeys() { return { ...this.keys } }

  consume(invertY = true) {
    const k = this.keys
    const turn = Number(k.KeyD || k.ArrowRight) - Number(k.KeyA || k.ArrowLeft)
    const vertical = Number(k.KeyW || k.ArrowUp) - Number(k.KeyS || k.ArrowDown)
    const command = {
      turn,
      climb: vertical === 0 ? 0 : invertY ? -vertical : vertical,
      boost: k.ShiftLeft || k.ShiftRight,
      stunt: this.stunt, view: this.changeView,
    }
    if (this.cannon || this.cannonPressed) command.cannon = true
    if (this.missile) command.missile = true
    this.stunt = null
    this.changeView = false
    this.cannonPressed = false
    this.missile = false
    return command
  }

  clear() {
    this.keys = Object.fromEntries(HELD.map(code => [code, false]))
    this.stunt = null
    this.changeView = false
    this.cannon = false
    this.cannonPressed = false
    this.missile = false
  }

  dispose() {
    for (const remove of this.listeners) remove()
    this.listeners.length = 0
    this.isAttached = false
    this.clear()
  }
}
