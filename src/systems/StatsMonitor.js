import Stats from 'three/examples/jsm/libs/stats.module.js'

/**
 * mrdoob/stats.js overlay for FPS / frame-time / memory monitoring.
 * Active in dev builds only.
 */
export default class StatsMonitor {
    constructor() {
        this.active = import.meta.env.DEV
        /** @type {Stats | null} */
        this.instance = null

        if (!this.active) {
            return
        }

        this.instance = new Stats()
        this.instance.dom.style.zIndex = '2'
        document.body.appendChild(this.instance.dom)
    }

    begin() {
        this.instance?.begin()
    }

    end() {
        this.instance?.end()
    }

    dispose() {
        this.instance?.dom.remove()
        this.instance = null
    }
}
