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
    await experience.init({ deferReady: true })
    experience.start()
    await experience.present()
  }
  catch (err) {
    experience.dispose()
    if (typeof window !== 'undefined' && window.__experience === experience) {
      delete window.__experience
    }
    console.error(err)
    const uiRoot = document.getElementById('explorer-ui')
    if (uiRoot) {
      uiRoot.className = 'startup-error'
      uiRoot.innerHTML = '<div class="surface error-card" role="alert"><span class="eyebrow">BRICKLAND EXPLORER</span><h1>旷野还没准备好</h1><p>场景加载失败，请检查浏览器是否支持 WebGPU，然后重试。</p><button type="button" class="primary-button">重新加载</button></div>'
      uiRoot.querySelector('button').addEventListener('click', () => window.location.reload())
    }
  }
}
