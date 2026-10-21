import TerrainMinimap from './TerrainMinimap.js'

const ICONS = {
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  home: '<path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-7h6v7"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01"/>',
  fullscreen: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  leaf: '<path d="M20 4C8 1 2 8 5 15s16 5 15-11ZM4 21 15 10"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
  muted: '<path d="m11 4-6 5H2v6h3l6 5ZM16 9l6 6M16 15l6-6"/>',
}
const BIOMES = {
  forest: '青翠森林', autumnForest: '秋日林地', desert: '金色沙丘',
  volcano: '熔岩山谷', snowForest: '雪境森林', meadow: '繁花草甸', wetland: '水岸湿地',
}
const svg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
const button = (action, icon, label, extra = '') => `<button type="button" class="icon-button" data-action="${action}" title="${label}" aria-label="${label}" ${extra}>${svg(icon)}</button>`

export default class ExplorerUI {
  constructor(root, experience) {
    this.root = root
    this.experience = experience
    this.ready = false
    this.flightPaused = false
    this.mapExpanded = false
    this.lastUpdate = -Infinity
    this.events = new AbortController()
    root.className = 'explorer-ui'
    root.innerHTML = `
      <header class="hud-header">
        <div class="brand hud-part">
          <span class="brick-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <div><h1>积木旷野<span>BRICKLAND</span></h1><p>一场没有终点的微小冒险</p></div>
        </div>
        <div class="header-tools">
          <span class="explore-badge hud-part"><i></i><span data-flight-status>自由探索</span></span>
          <nav class="surface action-bar" aria-label="探索工具">
            ${button('pause', 'pause', '暂停飞行（空格）', 'aria-pressed="false" disabled')}
            ${button('home', 'home', '回到出生点', 'disabled')}
            <span class="tool-divider"></span>
            ${button('sound', 'sound', '静音音效（M）', 'aria-pressed="false"')}
            ${button('help', 'help', '操作帮助', 'disabled')}
            ${button('fullscreen', 'fullscreen', '切换全屏')}
            ${button('cinema', 'eye', '隐藏界面（H）', 'aria-pressed="false"')}
          </nav>
        </div>
      </header>
      <section class="surface location-card hud-part flight-panel" aria-label="飞行信息">
        <div class="eyebrow">正在探索 <span class="live-dot"></span></div>
        <h2>${svg('leaf')}<span data-biome>旷野之间</span></h2>
        <div class="flight-readings"><div><strong data-speed>0.0</strong><span>格 / 秒</span></div><div class="coordinates"><span>X <b data-x>—</b></span><span>Z <b data-z>—</b></span></div></div>
        <div class="speed-track" aria-hidden="true"><i data-speed-bar></i></div>
      </section>
      <div class="surface control-hint hud-part flight-panel" aria-label="操作提示">
        <span class="key-cluster"><kbd>W</kbd><span><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span></span>
        <span class="hint-copy"><b>出发，随心而行</b><span>方向键亦可驾驶 <i>·</i> 拖动环视 <i>·</i> 滚轮缩放</span></span>
        <button type="button" data-action="help" class="text-button">操作指南 <span>↗</span></button>
      </div>
      <aside class="surface map-card hud-part flight-panel" aria-label="周边地形小地图">
        <div class="map-heading"><div><span>旷野一隅</span><span class="eyebrow">LOCAL MAP</span></div><button type="button" class="map-expand" data-action="map" aria-label="放大小地图" title="放大小地图" aria-expanded="false">${svg('fullscreen')}</button></div>
        <canvas class="terrain-minimap" aria-label="周边已探索地形与飞行朝向"></canvas>
        <div class="map-footer"><span><i></i> 你的位置</span><span data-seed></span></div>
      </aside>
      <div class="touch-controls hud-part flight-panel" aria-label="触屏驾驶">
        <button type="button" data-flight-code="KeyA" aria-label="左转">↶</button>
        <button type="button" data-flight-code="KeyW" aria-label="前进">↑</button>
        <button type="button" data-flight-code="KeyS" aria-label="后退">↓</button>
        <button type="button" data-flight-code="KeyD" aria-label="右转">↷</button>
      </div>
      <div class="loading-card surface" role="status"><span class="eyebrow">A LITTLE WORLD, A BIG ADVENTURE</span><h2>旷野正在生长</h2><p data-stage>正在唤醒这片小世界…</p><div class="loading-track"><i></i></div></div>
      <div class="hud-toast surface" role="status" hidden></div>
      <dialog class="help-dialog surface" aria-labelledby="help-title">
        ${button('close-help', 'close', '关闭操作帮助')}
        <span class="eyebrow">LET'S WANDER</span><h2 id="help-title">把方向交给好奇心</h2><p class="help-intro">驾驶你的小飞机，掠过森林、河流与山丘。</p>
        <dl class="help-keys"><div><dt><kbd>W</kbd> / <kbd>↑</kbd></dt><dd>向前飞行</dd></div><div><dt><kbd>S</kbd> / <kbd>↓</kbd></dt><dd>反向推进</dd></div><div><dt><kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd></dt><dd>左右转向</dd></div><div><dt>鼠标拖动 / 滚轮</dt><dd>环视 / 缩放</dd></div><div><dt><kbd>Space</kbd></dt><dd>暂停 / 继续飞行</dd></div><div><dt><kbd>H</kbd></dt><dd>隐藏 / 显示界面</dd></div><div><dt><kbd>M</kbd></dt><dd>静音 / 开启音效</dd></div><div><dt>小地图右上角 / <kbd>Esc</kbd></dt><dd>展开 / 收起地图</dd></div></dl>
        <p class="help-note">触屏设备还可使用屏幕上的方向按钮驾驶。</p><button type="button" class="primary-button" data-action="close-help">开始探索 <span>→</span></button>
      </dialog>`
    this.speed = root.querySelector('[data-speed]')
    this.speedBar = root.querySelector('[data-speed-bar]')
    this.biome = root.querySelector('[data-biome]')
    this.x = root.querySelector('[data-x]')
    this.z = root.querySelector('[data-z]')
    this.dialog = root.querySelector('dialog')
    this.minimap = new TerrainMinimap(root.querySelector('.terrain-minimap'), experience)
    this.syncAudioControl()
    root.querySelector('[data-seed]').textContent = `# ${experience.world.config.seed}`
    const options = { signal: this.events.signal }
    root.addEventListener('click', event => this.onAction(event.target.closest('[data-action]')?.dataset.action), options)
    window.addEventListener('keydown', event => this.onKeyDown(event), { ...options, capture: true })
    this.dialog.addEventListener('close', () => this.syncPause(), options)
    document.addEventListener('fullscreenchange', () => {
      const control = root.querySelector('[data-action="fullscreen"]')
      control.setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '切换全屏')
    }, options)
    if (!document.fullscreenEnabled) root.querySelector('[data-action="fullscreen"]').hidden = true
    for (const control of root.querySelectorAll('[data-flight-code]')) {
      const release = () => this.experience.world.playerAircraft?.input.setVirtualKey(control.dataset.flightCode, false)
      control.addEventListener('pointerdown', (event) => {
        const player = this.experience.world.playerAircraft
        if (!this.ready || !player?.enabled || player.paused) return
        event.preventDefault()
        control.setPointerCapture(event.pointerId)
        player.input.setVirtualKey(control.dataset.flightCode, true)
      }, options)
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) control.addEventListener(type, release, options)
    }
  }

  setStage(message) {
    this.root.querySelector('[data-stage]').textContent = message
  }

  setReady() {
    this.ready = true
    this.root.classList.add('is-ready')
    for (const control of this.root.querySelectorAll('button[disabled]')) control.disabled = false
    if (!this.experience.world.playerAircraft?.enabled) {
      for (const control of this.root.querySelectorAll('[data-action="pause"], [data-action="home"], [data-flight-code]')) control.disabled = true
      this.root.querySelector('[data-flight-status]').textContent = '风景漫游'
    }
    this.update(0)
  }

  syncPause() {
    this.experience.world.playerAircraft?.setPaused(this.flightPaused || this.dialog.open)
    const control = this.root.querySelector('[data-action="pause"]')
    control.setAttribute('aria-pressed', String(this.flightPaused))
    control.setAttribute('aria-label', this.flightPaused ? '继续飞行（空格）' : '暂停飞行（空格）')
    control.title = control.getAttribute('aria-label')
    control.innerHTML = svg(this.flightPaused ? 'play' : 'pause')
    this.root.querySelector('[data-flight-status]').textContent = !this.experience.world.playerAircraft?.enabled ? '风景漫游' : this.flightPaused ? '飞行已暂停' : '自由探索'
    this.root.classList.toggle('is-paused', this.flightPaused)
  }

  onAction(action) {
    if (!action) return
    const audio = this.experience.audio
    if (action === 'sound' && audio) {
      audio.setMuted(!audio.muted)
      this.syncAudioControl()
      if (!audio.muted) audio.play('click')
      return
    }
    audio?.play(action === 'pause' ? this.flightPaused ? 'resume' : 'pause' : action === 'home' ? 'home' : 'click')
    if (action === 'cinema') {
      if (this.mapExpanded) this.toggleMap(false)
      const hidden = this.root.classList.toggle('is-cinema')
      const control = this.root.querySelector('[data-action="cinema"]')
      control.setAttribute('aria-pressed', String(hidden))
      control.setAttribute('aria-label', hidden ? '显示界面（H）' : '隐藏界面（H）')
      control.title = control.getAttribute('aria-label')
      return
    }
    if (action === 'fullscreen') {
      const operation = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
      operation.catch(() => this.toast('当前浏览器暂时无法切换全屏'))
      return
    }
    if (!this.ready) return
    if (action === 'map') this.toggleMap()
    if (action === 'help') {
      this.dialog.showModal()
      this.syncPause()
    }
    if (action === 'close-help') this.dialog.close()
    const player = this.experience.world.playerAircraft
    if (!player?.enabled) return
    if (action === 'pause') {
      this.flightPaused = !this.flightPaused
      this.syncPause()
    }
    if (action === 'home') {
      player.reset()
      this.experience.world.regenerate()
      this.experience.worldCamera.resetView(player.state.position)
      this.toast('已回到出发的地方')
    }
  }

  onKeyDown(event) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input, textarea, select, [contenteditable="true"]')) return
    if (this.dialog.open) return
    if (event.code === 'Escape' && this.mapExpanded) {
      event.preventDefault()
      event.stopPropagation()
      this.toggleMap(false)
      this.experience.audio?.play('click')
      return
    }
    const interactive = event.target.closest('button, a')
    const action = event.code === 'KeyH' ? 'cinema' : event.code === 'KeyM' ? 'sound' : event.code === 'Space' && !interactive ? 'pause' : event.key === '?' ? 'help' : null
    if (action) {
      event.preventDefault()
      event.stopPropagation()
      this.onAction(action)
    }
  }

  update(timestamp) {
    if (!this.ready || timestamp - this.lastUpdate < 100) return
    this.lastUpdate = timestamp
    if (this.root.classList.contains('is-cinema')) return
    const player = this.experience.world.playerAircraft
    if (!player) return
    const cellSize = this.experience.world.config.terrain.cellSize
    const speed = player.paused ? 0 : player.state.velocity.length()
    this.speed.textContent = (speed / cellSize).toFixed(1)
    this.speedBar.style.width = `${Math.min(100, speed / player.motionConfig.maxSpeed * 100)}%`
    this.x.textContent = String(Math.floor(player.state.position.x / cellSize)).padStart(4, '0')
    this.z.textContent = String(Math.floor(player.state.position.z / cellSize)).padStart(4, '0')
    this.minimap.update()
    const biomeId = this.minimap.getCurrentBiomeId()
    if (biomeId && this.lastBiomeId && biomeId !== this.lastBiomeId) this.experience.audio?.play('biome')
    if (biomeId) this.lastBiomeId = biomeId
    this.biome.textContent = BIOMES[biomeId] ?? '旷野之间'
  }

  syncAudioControl() {
    const muted = this.experience.audio?.muted ?? true
    const control = this.root.querySelector('[data-action="sound"]')
    control.setAttribute('aria-pressed', String(muted))
    control.setAttribute('aria-label', muted ? '开启音效（M）' : '静音音效（M）')
    control.title = control.getAttribute('aria-label')
    control.innerHTML = svg(muted ? 'muted' : 'sound')
  }

  toggleMap(expanded = !this.mapExpanded) {
    this.mapExpanded = expanded
    this.root.classList.toggle('is-map-expanded', expanded)
    this.root.querySelector('.map-card').classList.toggle('is-expanded', expanded)
    const control = this.root.querySelector('[data-action="map"]')
    control.setAttribute('aria-expanded', String(expanded))
    control.setAttribute('aria-label', expanded ? '收起地图' : '放大小地图')
    control.title = control.getAttribute('aria-label')
    control.innerHTML = svg(expanded ? 'close' : 'fullscreen')
    this.minimap.update()
  }

  toast(message) {
    const element = this.root.querySelector('.hud-toast')
    element.textContent = message
    element.hidden = false
    clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => { element.hidden = true }, 2600)
  }

  dispose() {
    this.events.abort()
    clearTimeout(this.toastTimer)
    if (this.dialog.open) this.dialog.close()
    this.minimap.dispose()
    this.root.replaceChildren()
  }
}
