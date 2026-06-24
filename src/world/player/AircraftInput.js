const CONTROL_CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD']

function createEmptyKeys() {
  return {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false
  }
}

export default class AircraftInput {
  constructor(target = globalThis.window ?? null) {
    this.target = target
    this.keys = createEmptyKeys()
    this.isAttached = false

    this._onKeyDown = (event) => this.handleKeyDown(event)
    this._onKeyUp = (event) => this.handleKeyUp(event)
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
