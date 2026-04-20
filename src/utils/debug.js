import { Pane } from 'tweakpane'

/**
 * Root Tweakpane; only created when URL hash is `#debug`.
 * Child modules use {@link addFolder} from the passed `Debug` instance inside `debuggerInit()`.
 */
export default class Debug {
    constructor() {
        this.active = window.location.hash === '#debug'

        if (this.active) {
            this.ui = new Pane({ title: 'Debug' })
        } else {
            this.ui = null
        }
    }

    /**
     * @param {import('tweakpane').FolderApiOptions} options
     * @returns {import('tweakpane').FolderApi | undefined}
     */
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
