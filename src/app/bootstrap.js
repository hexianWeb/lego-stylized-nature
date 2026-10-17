import Experience from './Experience.js'

/**
 * @param {HTMLCanvasElement} canvas
 */
export async function bootstrap(canvas) {
    const errorEl = document.getElementById('app-error')
    const loadingEl = document.getElementById('sandbox-loading')
    if (errorEl) {
        errorEl.hidden = true
        errorEl.textContent = ''
    }

    // Global watchdog: if anything in init takes more than 8s, force
    // 2D SSR mode + hide the loading overlay. We also unblock any
    // pending await by replacing the experience's renderer with a
    // no-op and calling the hidden-flag path so the rest of init
    // skips the GPU stack.
    let watchdogTriggered = false
    const watchdog = setTimeout(() => {
        watchdogTriggered = true
        if (typeof window !== 'undefined') {
            window.__sandbox_2d_only = true
        }
        if (loadingEl) loadingEl.classList.add('is-hidden')
        if (errorEl) {
            errorEl.hidden = false
            errorEl.textContent = 'Init watchdog timeout (8s). Falling back to 2D mode.'
        }
    }, 8000)
    const clearWatchdog = () => clearTimeout(watchdog)

    // Guard against browsers that throw on `new WebGPURenderer`
    // synchronously (we still want to fall back).
    let experience
    try {
        experience = new Experience(canvas)
    } catch (err) {
        clearWatchdog()
        if (loadingEl) loadingEl.classList.add('is-hidden')
        if (errorEl) {
            errorEl.hidden = false
            errorEl.textContent = `WebGPU / 初始化失敗: ${err?.message ?? err}`
        }
        return
    }

    if (import.meta.env.DEV && typeof window !== 'undefined') {
        window.__experience = experience
    }

    try {
        await experience.init()
        clearWatchdog()
        if (loadingEl) loadingEl.classList.add('is-hidden')
        experience.start()
    } catch (err) {
        clearWatchdog()
        console.error(err)
        if (loadingEl) loadingEl.classList.add('is-hidden')
        const message = err instanceof Error ? err.message : String(err)
        if (errorEl) {
            errorEl.hidden = false
            errorEl.textContent = `WebGPU / 初始化失敗: ${message}`
        }
    }
}
