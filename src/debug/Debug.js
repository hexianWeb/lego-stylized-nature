import { Pane } from 'tweakpane'

export default class Debug {
  constructor() {
    this.active = import.meta.env.DEV && window.location.hash === '#debug'
    this.ui = this.active ? new Pane({ title: 'Debug' }) : null
    if (this.ui) {
      const container = this.ui.element.parentElement
      container.style.maxHeight = 'calc(100vh - 16px)'
      container.style.overflowY = 'auto'
    }
  }

  addFolder(options) {
    if (!this.active || !this.ui) {
      return undefined
    }
    return this.ui.addFolder(options)
  }

  dispose() {
    this.ui?.dispose()
    this.ui = null
  }
}
