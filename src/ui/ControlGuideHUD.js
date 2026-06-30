const DEFAULT_BINDINGS = [
  { key: 'W', label: 'Accelerate' },
  { key: 'S', label: 'Brake' },
  { key: 'A', label: 'Turn Right' },
  { key: 'D', label: 'Turn Left' }
]

export default class ControlGuideHUD {
  constructor({ config, parent = null } = {}) {
    this.config = config
    this.guideConfig = config?.ui?.controlGuide ?? {}
    this.enabled = this.guideConfig.enabled !== false
    this.parent = parent ?? (typeof document !== 'undefined' ? document.body : null)

    if (!this.enabled || typeof document === 'undefined' || !this.parent) {
      return
    }

    const offset = this.guideConfig.screenOffset ?? {}
    const verticalAlign = offset.verticalAlign ?? 'center'

    this.element = document.createElement('div')
    this.element.className = 'control-guide-hud'
    this.element.style.opacity = String(this.guideConfig.opacity ?? 1)

    if (Number.isFinite(offset.right)) {
      this.element.style.right = `${offset.right}px`
    }

    if (Number.isFinite(offset.left)) {
      this.element.style.left = `${offset.left}px`
    }

    if (verticalAlign === 'center') {
      this.element.style.top = '50%'
      this.element.style.transform = 'translateY(-50%)'
    } else {
      if (Number.isFinite(offset.top)) {
        this.element.style.top = `${offset.top}px`
      }

      if (Number.isFinite(offset.bottom)) {
        this.element.style.bottom = `${offset.bottom}px`
      }
    }

    const bindings = this.guideConfig.bindings ?? DEFAULT_BINDINGS

    for (const binding of bindings) {
      const row = document.createElement('div')
      row.className = 'control-guide-hud__row'

      const keyBox = document.createElement('span')
      keyBox.className = 'control-guide-hud__key'
      keyBox.textContent = binding.key

      const label = document.createElement('span')
      label.className = 'control-guide-hud__label'
      label.textContent = binding.label

      row.appendChild(keyBox)
      row.appendChild(label)
      this.element.appendChild(row)
    }

    this.parent.appendChild(this.element)
  }

  dispose() {
    this.element?.remove()
    this.element = null
  }
}
