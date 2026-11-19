const CONTROL_CODES = [
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]

function createEmptyKeys() {
  return Object.fromEntries(CONTROL_CODES.map(code => [code, false]))
}

function clampAxis(value) {
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0
}

export default class AircraftInput {
  constructor(target = globalThis.window ?? null) {
    this.target = target
    this.keys = createEmptyKeys()
    this.joystick = { x: 0, y: 0 }
    this.isAttached = false

    this._onKeyDown = event => this.handleKeyDown(event)
    this._onKeyUp = event => this.handleKeyUp(event)
    this._onBlur = () => this.clear()
  }

  attach() {
    if (!this.target || this.isAttached) {
      return
    }

    this.target.addEventListener('keydown', this._onKeyDown)
    this.target.addEventListener('keyup', this._onKeyUp)
    this.target.addEventListener('blur', this._onBlur)
    this.isAttached = true
  }

  handleKeyDown(event) {
    if (event.repeat === true || !CONTROL_CODES.includes(event.code)) {
      return
    }
    this.keys[event.code] = true
  }

  handleKeyUp(event) {
    if (!CONTROL_CODES.includes(event.code)) {
      return
    }
    this.keys[event.code] = false
  }

  clear() {
    this.keys = createEmptyKeys()
    this.setJoystick(0, 0)
  }

  setJoystick(x, y) {
    this.joystick.x = clampAxis(x)
    this.joystick.y = clampAxis(y)
  }

  getJoystick() {
    return { ...this.joystick }
  }

  getKeys() {
    return { ...this.keys }
  }

  dispose() {
    if (this.target && this.isAttached) {
      this.target.removeEventListener('keydown', this._onKeyDown)
      this.target.removeEventListener('keyup', this._onKeyUp)
      this.target.removeEventListener('blur', this._onBlur)
    }
    this.isAttached = false
    this.clear()
  }
}
