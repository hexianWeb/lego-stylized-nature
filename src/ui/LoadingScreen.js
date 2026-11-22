import LoadingIsland from './LoadingIsland.js'

const SEGMENT_COUNT = 16
const BUILD_RATE = 0.56
const LAUNCH_RATE = 0.30
const DEPARTURE_MS = 500
const REVEAL_START_MS = 360
const REVEAL_MS = 780
const REVEAL_TIMEOUT_MS = 3400
const CLOUD_EDGE = 'M0 0H.945Q.99 .05 .946 .107Q.92 .13 .893 .137Q.961 .192 .906 .243Q.885 .266 .859 .277Q.942 .327 .892 .385Q.869 .403 .853 .408Q.926 .462 .89 .521Q.88 .543 .848 .555Q.921 .612 .882 .666Q.892 .671 .909 .692Q.965 .746 .909 .803Q.965 .829 .932 .893Q.99 .934 .947 1H0Z'
const segments = Array.from({ length: SEGMENT_COUNT }, (_, i) => `<i style="--segment:${i}"></i>`).join('')

export const loadingScreenMarkup = `
  <div class="flight-loading">
    <svg class="loading-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="flight-cloud-left" clipPathUnits="objectBoundingBox"><path d="${CLOUD_EDGE}"/></clipPath>
        <clipPath id="flight-cloud-right" clipPathUnits="objectBoundingBox"><path d="${CLOUD_EDGE}" transform="translate(1 0) scale(-1 1)"/></clipPath>
      </defs>
    </svg>
    <div class="loading-curtain loading-curtain-left" aria-hidden="true"></div>
    <div class="loading-curtain loading-curtain-right" aria-hidden="true"></div>
    <div class="loading-content">
      <canvas class="loading-island" aria-hidden="true"></canvas>
      <section class="loading-card" aria-labelledby="loading-title">
        <div class="loading-heading">
          <h2 id="loading-title">旷野正在生长</h2>
          <span data-load-percent aria-hidden="true">0%</span>
        </div>
        <p data-load-stage role="status">正在生成地形…</p>
        <div class="loading-progress" role="progressbar" aria-labelledby="loading-title" aria-valuenow="0">
          ${segments}
        </div>
      </section>
    </div>
  </div>`

export default class LoadingScreen {
  constructor(root) {
    this.element = root.querySelector('.flight-loading')
    this.stage = this.element.querySelector('[data-load-stage]')
    this.percent = this.element.querySelector('[data-load-percent]')
    this.bar = this.element.querySelector('.loading-progress')
    const canvas = this.element.querySelector('.loading-island')
    this.island = new LoadingIsland(canvas)
    this.motion = matchMedia('(prefers-reduced-motion: reduce)')
    this.progress = this.flyout = this.target = 0
    this.stages = []
    this.frameId = null
    this.resize = new ResizeObserver(() => this.island.draw(this.progress, this.flyout))
    this.resize.observe(canvas)
    this.setStage(0.08, '正在生成地形…')
  }

  setStage(progress, label) {
    if (progress <= this.target) return
    this.stages.push({ after: this.target, label })
    this.target = progress
    this.schedule()
  }

  schedule() {
    if (this.frameId === null) this.frameId = requestAnimationFrame(this.tick)
  }

  tick = (timestamp) => {
    this.frameId = null
    const delta = Math.min(0.12, (timestamp - (this.previousFrame ?? timestamp - 16)) / 1000)
    this.previousFrame = timestamp
    const rate = this.target === 1 && this.progress >= 0.88 ? LAUNCH_RATE : BUILD_RATE
    this.progress = this.motion.matches ? this.target : Math.min(this.target, this.progress + delta * rate)

    if (this.resolveReveal && this.progress === 1) {
      this.element.classList.add('is-launching')
      this.departureAt ??= timestamp
      const elapsed = timestamp - this.departureAt
      this.flyout = Math.min(1, elapsed / DEPARTURE_MS)
      const opening = Math.max(0, Math.min(1, (elapsed - REVEAL_START_MS) / REVEAL_MS))
      this.element.style.setProperty('--cloud-open', 1 - (1 - opening) ** 2)
      this.element.style.setProperty('--loading-opacity', Math.max(0, 1 - opening * 3.4))
      if (this.motion.matches || opening === 1) this.finishReveal()
    }

    this.draw()
    if (this.progress < this.target || this.resolveReveal) this.schedule()
    else this.previousFrame = undefined
  }

  draw() {
    while (this.stages.length > 1 && this.progress > this.stages[1].after) this.stages.shift()
    const { label } = this.stages[0]
    if (this.stage.textContent !== label) this.stage.textContent = label
    const percent = Math.floor(this.progress * 100 + 1e-8)
    if (this.lastPercent !== percent) {
      this.lastPercent = percent
      this.percent.textContent = `${percent}%`
      this.bar.setAttribute('aria-valuenow', String(percent))
    }
    this.bar.style.setProperty('--load-progress', this.progress * SEGMENT_COUNT)
    this.island.draw(this.progress, this.flyout)
  }

  reveal() {
    if (this.revealPromise) return this.revealPromise
    this.setStage(1, '起飞准备就绪')
    if (this.motion.matches) return Promise.resolve()
    this.revealPromise = new Promise((resolve) => { this.resolveReveal = resolve })
    this.timeout = setTimeout(() => this.finishReveal(), REVEAL_TIMEOUT_MS)
    return this.revealPromise
  }

  finishReveal() {
    clearTimeout(this.timeout)
    const resolve = this.resolveReveal
    this.resolveReveal = null
    resolve?.()
  }

  dispose() {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId)
    this.resize.disconnect()
    this.element.remove()
    this.finishReveal()
  }
}
