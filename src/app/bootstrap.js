import Experience from './Experience.js'

/**
 * @param {HTMLCanvasElement} canvas
 */
export async function bootstrap(canvas) {
    const errorEl = document.getElementById('app-error')
    if (errorEl) {
        errorEl.hidden = true
        errorEl.textContent = ''
    }

    const experience = new Experience(canvas)

    if (import.meta.env.DEV && typeof window !== 'undefined') {
        window.__experience = experience
    }

    try {
        await experience.init()
        experience.start()
    } catch (err) {
        console.error(err)
        const message = err instanceof Error ? err.message : String(err)
        if (errorEl) {
            errorEl.hidden = false
            errorEl.textContent = `WebGPU / 初始化失敗: ${message}`
        }
    }
}
