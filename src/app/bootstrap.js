import Experience from './Experience.js'

/**
 * @param {HTMLCanvasElement} canvas
 */
export async function bootstrap(canvas) {
    const experience = new Experience(canvas)

    if (import.meta.env.DEV && typeof window !== 'undefined') {
        window.__experience = experience
    }

    try {
        await experience.init()
        experience.start()
    } catch (err) {
        experience.dispose()
        if (typeof window !== 'undefined' && window.__experience === experience) {
            delete window.__experience
        }
        console.error(err)
    }
}
