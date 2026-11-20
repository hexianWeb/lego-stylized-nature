import FlightJoystick from './FlightJoystick.js'
import FlightDeck, { flightDeckMarkup } from './FlightDeck.js'
import TerrainMinimap from './TerrainMinimap.js'

const ICONS = {
  view: '<path d="m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
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
const CLOUD_REVEAL_MS = 1800
const CLOUD_PUFFS = [
  ['16%', '24%', '46vw', '26vw', '-38vw', '-22vh'],
  ['50%', '12%', '52vw', '24vw', '2vw', '-34vh'],
  ['86%', '22%', '44vw', '26vw', '40vw', '-20vh'],
  ['6%', '52%', '38vw', '30vw', '-44vw', '2vh'],
  ['32%', '46%', '34vw', '22vw', '-26vw', '-4vh'],
  ['70%', '48%', '34vw', '22vw', '28vw', '2vh'],
  ['96%', '54%', '40vw', '28vw', '46vw', '6vh'],
  ['18%', '80%', '46vw', '26vw', '-30vw', '32vh'],
  ['52%', '88%', '54vw', '26vw', '4vw', '36vh'],
  ['86%', '78%', '42vw', '24vw', '36vw', '30vh'],
]
const cloudVeilMarkup = () => {
  const puffs = CLOUD_PUFFS.map(([x, y, w, h, dx, dy]) => `<span class="puff" style="--x:${x};--y:${y};--w:${w};--h:${h};--dx:${dx};--dy:${dy}"></span>`).join('')
  return `<div class="cloud-veil" aria-hidden="true"><div class="cloud-sky"></div><div class="cloud-burst"></div><div class="cloud-field">${puffs}</div></div>`
}

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
          <div><h1>旷野飞行队<span>KESTREL · 01</span></h1><p>积木旷野 / 自由试飞</p></div>
        </div>
        <p class="surface orientation-hint hud-part">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="10" rx="2"/><path d="M6 15v2M7 7a6 6 0 0 1 10-2l2 2m0-4v4h-4"/>
          </svg>
          建议横屏游玩
        </p>
        <div class="header-tools">
          <span class="explore-badge hud-part"><i></i><span data-flight-status>自由探索</span></span>
          <nav class="surface action-bar" aria-label="探索工具">
            ${button('view', 'view', '切换视角（空格）', 'disabled')}
            ${button('pause', 'pause', '暂停飞行（P）', 'aria-pressed="false" disabled')}
            ${button('home', 'home', '回到出生点', 'disabled')}
            <span class="tool-divider"></span>
            ${button('sound', 'sound', '静音音效（U）', 'aria-pressed="false"')}
            ${button('help', 'help', '操作帮助', 'disabled')}
            ${button('fullscreen', 'fullscreen', '切换全屏')}
            ${button('cinema', 'eye', '隐藏界面（H）', 'aria-pressed="false"')}
          </nav>
        </div>
      </header>
      <section class="surface location-card hud-part flight-panel" aria-label="飞行信息">
        <div class="eyebrow"><span data-panel-status>自由巡航</span><span class="live-dot"></span></div>
        <h2>${svg('leaf')}<span data-biome>旷野之间</span></h2>
        <div class="flight-readings"><div><strong data-speed>0.0</strong><span>格 / 秒</span></div><div class="coordinates"><span>X <b data-x>—</b></span><span>Z <b data-z>—</b></span></div></div>
        <div class="speed-track" aria-hidden="true"><i data-speed-bar></i></div>
        <div class="flight-altimeter"><span>离地 <b data-alt>—</b> 格</span><b data-view>俯视</b></div>
      </section>
      <div class="surface control-hint hud-part flight-panel" aria-label="操作提示">
        <span class="key-cluster"><kbd>W</kbd><span><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span></span>
        <span class="hint-copy"><b>S 拉起 · W 下压 · A/D 转向</b><span>Shift 加速 · R 翻滚 · F/G 空翻 · 空格切镜</span></span>
        <button type="button" data-action="help" class="text-button">操作指南 <span>↗</span></button>
      </div>
      <aside class="surface map-card hud-part flight-panel" aria-label="周边地形小地图">
        <div class="map-heading"><div><span>旷野一隅</span><span class="eyebrow">LOCAL MAP</span></div><button type="button" class="map-expand" data-action="map" aria-label="放大小地图" title="放大小地图" aria-expanded="false">${svg('fullscreen')}</button></div>
        <canvas class="terrain-minimap" aria-label="周边已探索地形与飞行朝向"></canvas>
        <div class="map-footer"><span><i></i> 你的位置</span><span data-seed></span></div>
      </aside>
      <div class="surface flight-joystick hud-part flight-panel" data-flight-joystick role="group" aria-label="飞行摇杆，横向转弯，纵向控制俯仰" hidden>
        <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" aria-hidden="true">
          <circle cx="50" cy="50" r="30" stroke-dasharray="1 4" opacity=".55"/>
          <path d="m46 15 4-4 4 4m-8 70 4 4 4-4M15 46l-4 4 4 4m70-8 4 4-4 4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="flight-joystick-thumb" aria-hidden="true"></span>
      </div>
      ${flightDeckMarkup}
      ${cloudVeilMarkup()}
      <div class="loading-card surface" role="status"><span class="eyebrow">A LITTLE WORLD, A BIG ADVENTURE</span><h2>旷野正在生长</h2><p data-stage>正在唤醒这片小世界…</p><div class="loading-track"><i></i></div></div>
      <div class="hud-toast surface" role="status" hidden></div>
      <dialog class="help-dialog surface" aria-labelledby="help-title">
        ${button('close-help', 'close', '关闭操作帮助')}
        <span class="eyebrow">KESTREL / FLIGHT MANUAL</span><h2 id="help-title">红隼试飞手册</h2><p class="help-intro">飞机会自动巡航。绕过山丘，拉起机头，看看空翻顶点的旷野。</p>
        <dl class="help-keys desktop-help">
          <div><dt><kbd>A</kbd> / <kbd>D</kbd> 或鼠标左右</dt><dd>压坡转向</dd></div>
          <div><dt><kbd>S</kbd> / <kbd>W</kbd> 或鼠标下 / 上</dt><dd>拉起 / 下压（方向键等价）</dd></div>
          <div><dt><kbd>Shift</kbd> / 按住左键</dt><dd>加速，松开回到巡航</dd></div>
          <div><dt><kbd>R</kbd> / 轻点左键</dt><dd>纵轴翻滚</dd></div>
          <div><dt><kbd>F</kbd> / <kbd>G</kbd></dt><dd>后空翻 / 前空翻</dd></div>
          <div><dt><kbd>Space</kbd> / <kbd>P</kbd></dt><dd>切换视角 / 暂停</dd></div>
          <div><dt><kbd>H</kbd> / <kbd>U</kbd></dt><dd>切换界面 / 音效</dd></div>
          <div><dt>小地图右上角 / <kbd>Esc</kbd></dt><dd>展开 / 收起地图</dd></div>
        </dl>
        <dl class="help-keys touch-help">
          <div><dt>左右拨杆</dt><dd>压坡转弯</dd></div>
          <div><dt>向下拉 / 向上推</dt><dd>爬升 / 俯冲</dd></div>
          <div><dt>右侧动作区</dt><dd>按住加速，点按特技</dd></div>
          <div><dt>顶部视角按钮</dt><dd>俯视 → 追尾 → 驾驶舱</dd></div>
        </dl>
        <p class="help-note">加速时持续拉满或推满也能触发空翻。前空翻需要下方净空；靠近地面时会自动拉平。</p><button type="button" class="primary-button" data-action="close-help">返回飞行 <span>→</span></button>
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
    this.deck = new FlightDeck(root, () => this.experience.world.playerAircraft, options)
    this.touchMedia = window.matchMedia('(pointer: coarse)')
    this.joystick = new FlightJoystick(
      root.querySelector('[data-flight-joystick]'),
      (x, y) => this.experience.world.playerAircraft?.input.setJoystick(x, y),
      options,
    )
    this.syncTouchControls()
    this.touchMedia.addEventListener('change', () => this.syncTouchControls(), options)
    window.addEventListener('blur', () => this.joystick.reset(), options)
    window.addEventListener('resize', () => this.joystick.reset(), options)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.joystick.reset()
    }, options)
    root.addEventListener('click', event => this.onAction(event.target.closest('[data-action]')?.dataset.action), options)
    window.addEventListener('keydown', event => this.onKeyDown(event), { ...options, capture: true })
    this.dialog.addEventListener('close', () => this.syncPause(), options)
    document.addEventListener('fullscreenchange', () => {
      this.joystick.reset()
      const control = root.querySelector('[data-action="fullscreen"]')
      control.setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '切换全屏')
    }, options)
    if (!document.fullscreenEnabled) root.querySelector('[data-action="fullscreen"]').hidden = true
  }

  setStage(message) {
    this.root.querySelector('[data-stage]').textContent = message
  }

  playCloudReveal() {
    const sky = this.root.querySelector('.cloud-sky')
    const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!sky || reduceMotion || this.ready) return Promise.resolve()
    this.root.classList.add('is-revealing')
    return new Promise((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        sky.removeEventListener('animationend', onEnd)
        clearTimeout(timer)
        this._cancelReveal = null
        resolve()
      }
      const onEnd = (event) => {
        if (event.target === sky) finish()
      }
      const timer = setTimeout(finish, CLOUD_REVEAL_MS)
      this._cancelReveal = finish
      sky.addEventListener('animationend', onEnd)
    })
  }

  setReady() {
    this.ready = true
    this.root.classList.add('is-ready')
    this.root.classList.remove('is-revealing')
    this.root.querySelector('.cloud-veil')?.remove()
    for (const control of this.root.querySelectorAll('button[disabled]')) control.disabled = false
    if (!this.experience.world.playerAircraft?.enabled) {
      for (const control of this.root.querySelectorAll('[data-action="view"], [data-action="pause"], [data-action="home"]')) control.disabled = true
    }
    this.syncPause()
    this.update(0)
  }

  syncTouchControls() {
    const player = this.experience.world.playerAircraft
    const touch = this.touchMedia.matches
    const available = touch && this.ready && player?.enabled === true
    this.root.classList.toggle('is-touch', touch)
    this.root.classList.toggle('has-flight-joystick', available)
    const enabled = available && !player.paused && !this.mapExpanded && !this.root.classList.contains('is-cinema')
    this.joystick.setEnabled(enabled)
    this.deck.setTouchEnabled(enabled)
  }

  syncPause() {
    const paused = this.experience.platformPaused || this.flightPaused || this.dialog.open || this.mapExpanded
    const player = this.experience.world.playerAircraft
    this.joystick.reset()
    if (player && (this.ready || paused)) player.setPaused(paused)
    this.syncTouchControls()
    const control = this.root.querySelector('[data-action="pause"]')
    control.setAttribute('aria-pressed', String(this.flightPaused))
    control.setAttribute('aria-label', this.flightPaused ? '继续飞行（P）' : '暂停飞行（P）')
    control.title = control.getAttribute('aria-label')
    control.innerHTML = svg(this.flightPaused ? 'play' : 'pause')
    this.root.querySelector('[data-flight-status]').textContent = !player?.enabled ? '风景漫游' : this.flightPaused ? '飞行已暂停' : '自由探索'
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
      this.syncTouchControls()
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
    if (action === 'view' && !player.paused) player.input.request('view')
    if (action === 'pause') {
      this.flightPaused = !this.flightPaused
      this.syncPause()
    }
    if (action === 'home') {
      this.joystick.reset()
      player.reset()
      this.experience.world.regenerate()
      this.toast('已回到出发的地方')
    }
  }

  onKeyDown(event) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return
    if (this.dialog.open) return
    if (event.code === 'Escape' && this.mapExpanded) {
      event.preventDefault()
      event.stopPropagation()
      this.toggleMap(false)
      this.experience.audio?.play('click')
      return
    }
    const action = event.code === 'KeyH' ? 'cinema' : event.code === 'KeyU' ? 'sound' : event.code === 'KeyP' ? 'pause' : event.key === '?' ? 'help' : null
    if (action) {
      event.preventDefault()
      event.stopPropagation()
      this.onAction(action)
    }
  }

  update(timestamp) {
    if (!this.ready || timestamp - this.lastUpdate < 100) return
    this.lastUpdate = timestamp
    const player = this.experience.world.playerAircraft
    if (!player) return
    const cellSize = this.experience.world.config.terrain.cellSize
    this.deck.update(player, cellSize)
    if (this.root.classList.contains('is-cinema')) return
    const speed = player.enabled ? player.state.velocity.length() : 0
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
    control.setAttribute('aria-label', muted ? '开启音效（U）' : '静音音效（U）')
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
    this.syncPause()
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
    this._cancelReveal?.()
    this.joystick.reset()
    this.deck.release()
    this.events.abort()
    clearTimeout(this.toastTimer)
    if (this.dialog.open) this.dialog.close()
    this.minimap.dispose()
    this.root.replaceChildren()
  }
}
