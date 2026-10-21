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

export default class AircraftInput {
  constructor(target = globalThis.window ?? null) {
    this.target = target
    this.keys = createEmptyKeys()
    this.virtualKeys = createEmptyKeys()
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
    this.virtualKeys = createEmptyKeys()
  }

  setVirtualKey(code, pressed) {
    if (CONTROL_CODES.includes(code)) {
      this.virtualKeys[code] = Boolean(pressed)
    }
  }

  getKeys() {
    return Object.fromEntries(CONTROL_CODES.map(code => [code, this.keys[code] || this.virtualKeys[code]]))
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
