import { Timer } from 'three/webgpu'

/**
 * Wraps THREE.Timer. Call {@link update} once per frame from the same driver as rendering
 * (here: WebGPURenderer.setAnimationLoop), passing the rAF timestamp. That keeps a single
 * tick source while still using the timer for delta/elapsed and Page Visibility handling
 * after {@link connectDocument}.
 */
export default class Time {
    constructor() {
        this.timer = new Timer()
    }

    connectDocument(document) {
        this.timer.connect(document)
    }

    /**
     * @param {number} [timestamp] ms, from setAnimationFrame callback when available
     */
    update(timestamp) {
        this.timer.update(timestamp)
    }

    getDelta() {
        return this.timer.getDelta()
    }

    getElapsed() {
        return this.timer.getElapsed()
    }

    dispose() {
        this.timer.dispose()
    }
}
