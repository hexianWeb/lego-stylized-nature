export default class Sizes {
    constructor() {
        this.width = window.innerWidth
        this.height = window.innerHeight
        this._listeners = new Set()
        this._onResize = () => {
            this.width = window.innerWidth
            this.height = window.innerHeight
            for (const fn of this._listeners) {
                fn()
            }
        }
        window.addEventListener('resize', this._onResize)
    }

    /**
     * @param {() => void} fn
     * @returns {() => void} unsubscribe
     */
    onResize(fn) {
        this._listeners.add(fn)
        return () => {
            this._listeners.delete(fn)
        }
    }

    dispose() {
        window.removeEventListener('resize', this._onResize)
        this._listeners.clear()
    }
}
