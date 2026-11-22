import FlightJoystick from './FlightJoystick.js'
import FlightDeck, { flightDeckMarkup } from './FlightDeck.js'
import FlightNavigation, { flightNavigationMarkup } from './FlightNavigation.js'
import AircraftWeaponHUD, { aircraftWeaponMarkup } from './AircraftWeaponHUD.js'
import LoadingScreen, { loadingScreenMarkup } from './LoadingScreen.js'

const ICONS = {
  view: '<path d="m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  pause: '<path fill="currentColor" stroke="none" d="M4 3h6v18H4zm10 0h6v18h-6z"/>',
  play: '<path fill="currentColor" stroke="none" d="m6 3 15 9-15 9Z"/>',
  home: '<path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-7h6v7"/>',
  help: '<path stroke-width="3.6" d="M7.5 6a4.8 4.8 0 0 1 9.2 1.7c0 3.1-4.7 3.1-4.7 6.4"/><circle cx="12" cy="20" r="1.8" fill="currentColor" stroke="none"/>',
  fullscreen: '<path stroke-width="2.8" stroke-linecap="square" d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  restore: '<path stroke-width="2.8" stroke-linecap="square" d="M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3ZM9 3v15M15 6v15"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  terrain: '<path fill="currentColor" stroke="none" d="M3 4h18l-7 6h6l-7 6h5l3 4H2l2-4h5l-5-4 4-3H2z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  sound: '<path fill="currentColor" stroke="none" d="m12 3-7 5H1v8h4l7 5Z"/><path stroke-width="2.4" d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path fill="currentColor" stroke="none" d="m12 3-7 5H1v8h4l7 5Z"/><path stroke-width="2.4" d="m16 9 6 6m-6 0 6-6"/>',
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
          <div class="brand-copy"><h1>旷野飞行队</h1><p>KESTREL-01 <span aria-hidden="true">·</span> <span data-flight-status>自由巡航</span></p></div>
        </div>
        <nav class="action-bar" aria-label="飞行工具">
          ${button('pause', 'pause', '暂停飞行（P）', 'aria-pressed="false" disabled')}
          ${button('sound', 'sound', '静音音效（U）', 'aria-pressed="false"')}
          ${button('help', 'help', '操作帮助', 'aria-haspopup="dialog" disabled')}
          ${button('fullscreen', 'fullscreen', '切换全屏')}
          <span class="touch-view">${button('view', 'view', '切换视角', 'disabled')}</span>
          ${button('map', 'map', '放大小地图', 'aria-expanded="false" disabled')}
          ${button('cinema', 'eye', '显示界面（H）', 'aria-pressed="false"')}
        </nav>
      </header>
      <section class="location-card hud-part flight-panel" aria-label="飞行信息">
        <dl class="flight-readings">
          <div><dt>空速</dt><dd><strong data-speed>—</strong><span>格/秒</span></dd></div>
          <div><dt>离地</dt><dd><strong data-alt>—</strong><span>格</span></dd></div>
        </dl>
        <div class="speed-track" data-speed-bar aria-hidden="true">${'<i></i>'.repeat(48)}</div>
        <p class="biome-reading">${svg('terrain')}<span data-biome>旷野之间</span></p>
      </section>
      <div class="map-shade" data-action="map" aria-hidden="true" hidden></div>
      ${flightNavigationMarkup}
      <div class="flight-joystick hud-part flight-panel" data-flight-joystick role="group" aria-label="飞行摇杆，横向转弯，纵向控制俯仰" hidden>
        <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" aria-hidden="true">
          <circle cx="50" cy="50" r="30" stroke-dasharray="1 4" opacity=".55"/>
          <path d="m46 15 4-4 4 4m-8 70 4 4 4-4M15 46l-4 4 4 4m70-8 4 4-4 4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="flight-joystick-thumb" aria-hidden="true"></span>
      </div>
      ${flightDeckMarkup}
      ${aircraftWeaponMarkup}
      ${loadingScreenMarkup}
      <div class="hud-toast surface" role="status" hidden></div>
      <dialog class="help-dialog surface" aria-labelledby="help-title">
        ${button('close-help', 'close', '关闭操作帮助')}
        <h2 id="help-title">红隼试飞手册</h2><p class="help-intro">飞机会自动巡航。用下方操作控制转向、升降和特技。</p>
        <dl class="help-keys desktop-help">
          <div><dt><kbd>A</kbd> / <kbd>D</kbd> 或 <kbd>←</kbd> / <kbd>→</kbd><span data-mouse-flight hidden> 或鼠标左右</span></dt><dd>压坡转向</dd></div>
          <div><dt><kbd>S</kbd> / <kbd>W</kbd> 或 <kbd>↓</kbd> / <kbd>↑</kbd><span data-mouse-flight hidden> 或鼠标下 / 上</span></dt><dd>拉起 / 下压</dd></div>
          <div><dt><kbd>Shift</kbd><span data-mouse-flight hidden> / 按住左键</span></dt><dd>加速，松开回到巡航</dd></div>
          <div><dt><kbd>R</kbd><span data-mouse-flight hidden> / 轻点左键</span></dt><dd>纵轴翻滚</dd></div>
          <div><dt><kbd>F</kbd> / <kbd>G</kbd></dt><dd>后空翻 / 前空翻</dd></div>
          <div data-weapon-help hidden><dt>按住左键 / 单击右键或 <kbd>M</kbd></dt><dd>机炮连射 / 发射导弹。屏幕边缘箭头指示敌机方位，持续瞄准可锁定</dd></div>
          <div><dt><kbd>Space</kbd> / <kbd>P</kbd></dt><dd>切换视角 / 暂停</dd></div>
          <div><dt><kbd>H</kbd> / <kbd>U</kbd></dt><dd>切换界面 / 音效</dd></div>
          <div><dt>点击区域地图 / <kbd>Esc</kbd></dt><dd>展开 / 收起地图</dd></div>
        </dl>
        <dl class="help-keys touch-help">
          <div><dt>左右拨杆</dt><dd>压坡转弯</dd></div>
          <div><dt>向下拉 / 向上推</dt><dd>爬升 / 俯冲</dd></div>
          <div><dt>右侧动作区</dt><dd>按住加速，点按特技</dd></div>
          <div><dt>顶部视角按钮</dt><dd>俯视 → 追尾 → 驾驶舱</dd></div>
          <div><dt>点按区域地图</dt><dd>展开 / 收起地图</dd></div>
        </dl>
        <p class="help-note">加速时持续拉满或推满也能触发空翻。靠近地面时会自动拉平。</p>
        <div class="help-actions">
          <button type="button" data-action="view">${svg('view')}切换视角<span data-view></span></button>
          <button type="button" data-action="home">${svg('home')}回到出生点</button>
          <button type="button" data-action="cinema">${svg('eye')}隐藏界面</button>
        </div>
        <button type="button" class="primary-button" data-action="close-help">返回飞行 <span aria-hidden="true">→</span></button>
      </dialog>`
    this.speed = root.querySelector('[data-speed]')
    this.speedBar = root.querySelector('[data-speed-bar]')
    this.biome = root.querySelector('[data-biome]')
    this.map = root.querySelector('[data-flight-map]')
    this.dialog = root.querySelector('dialog')
    this.loading = new LoadingScreen(root)
    this.navigation = new FlightNavigation(root, experience)
    this.syncAudioControl()
    const options = { signal: this.events.signal }
    const getPlayer = () => this.experience.world.playerAircraft
    this.deck = new FlightDeck(root, getPlayer, options)
    this.weaponHUD = new AircraftWeaponHUD(root, experience.sizes)
    this.touchMedia = window.matchMedia('(pointer: coarse)')
    this.joystick = new FlightJoystick(
      root.querySelector('[data-flight-joystick]'),
      (x, y) => getPlayer()?.input.setJoystick?.(x, y),
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
      const fullscreen = Boolean(document.fullscreenElement)
      control.title = fullscreen ? '退出全屏' : '切换全屏'
      control.setAttribute('aria-label', control.title)
      control.innerHTML = svg(fullscreen ? 'restore' : 'fullscreen')
    }, options)
    if (!document.fullscreenEnabled) root.querySelector('[data-action="fullscreen"]').hidden = true
  }

  setStage(progress, message) {
    this.loading?.setStage(progress, message)
  }

  playCloudReveal() {
    return this.loading?.reveal()
  }

  setReady() {
    this.ready = true
    this.root.classList.add('is-ready')
    this.loading?.dispose()
    this.loading = null
    const world = this.experience.world
    const hasWeapons = Boolean(world.aircraftWeapons)
    const hasMouseFlight = !hasWeapons && typeof world.playerAircraft?.input.setJoystick === 'function'
    this.root.classList.toggle('has-weapons', hasWeapons)
    for (const hint of this.root.querySelectorAll('[data-weapon-help]')) hint.hidden = !hasWeapons
    for (const hint of this.root.querySelectorAll('[data-mouse-flight]')) hint.hidden = !hasMouseFlight
    for (const control of this.root.querySelectorAll('button[disabled]')) control.disabled = false
    if (!this.experience.world.playerAircraft?.enabled) {
      for (const control of this.root.querySelectorAll('[data-action="view"], [data-action="pause"], [data-action="home"]')) control.disabled = true
    }
    this.syncPause()
    this.update(0)
  }

  syncTouchControls() {
    const player = this.experience.world.playerAircraft
    const touch = this.touchMedia.matches && typeof player?.input.setJoystick === 'function'
    const available = touch && this.ready && player.enabled
    this.root.classList.toggle('is-touch', touch)
    this.root.classList.toggle('has-flight-joystick', available)
    const enabled = available && !player.paused && !this.mapExpanded && !this.root.classList.contains('is-cinema')
    this.joystick.setEnabled(enabled)
    this.deck.setTouchEnabled(enabled)
  }

  syncPause() {
    const paused = this.experience.platformPaused || this.flightPaused || this.dialog.open || this.mapExpanded
    const player = this.experience.world.playerAircraft
    if (player && player.paused !== paused && (this.ready || paused)) player.setPaused(paused)
    this.syncTouchControls()
    if (paused) this.weaponHUD.hide()
    const control = this.root.querySelector('[data-action="pause"]')
    control.setAttribute('aria-pressed', String(this.flightPaused))
    control.setAttribute('aria-label', this.flightPaused ? '继续飞行（P）' : '暂停飞行（P）')
    control.title = control.getAttribute('aria-label')
    control.innerHTML = svg(this.flightPaused ? 'play' : 'pause')
    this.root.querySelector('[data-flight-status]').textContent = !player?.enabled ? '风景漫游' : paused ? '飞行已暂停' : '自由巡航'
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
      if (this.dialog.open) {
        this.dialog.close()
        this.syncPause()
      }
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
      if (document.fullscreenEnabled) {
        const operation = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
        operation.catch(() => this.toast('当前浏览器暂时无法切换全屏'))
      }
      return
    }
    if (!this.ready) return
    if (action === 'map') this.toggleMap()
    if (action === 'help' && !this.dialog.open) {
      if (this.mapExpanded) this.toggleMap(false)
      this.dialog.showModal()
      this.syncPause()
    }
    if (['close-help', 'view', 'home'].includes(action) && this.dialog.open) {
      this.dialog.close()
      this.syncPause()
    }
    const player = this.experience.world.playerAircraft
    if (!player?.enabled) return
    if (action === 'view') {
      if (player.paused) this.toast('继续飞行后可切换视角')
      else player.input.request('view')
    }
    if (action === 'pause') {
      this.flightPaused = !this.flightPaused
      this.syncPause()
    }
    if (action === 'home') {
      if (this.experience.world.forestTrial?.benchmark) {
        window.location.reload()
        return
      }
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
    if (!this.ready) return
    const world = this.experience.world
    const player = world.playerAircraft
    const cellSize = world.config.terrain.cellSize
    this.deck.renderCockpit(player, cellSize, this.experience.time.getDelta())
    const hudVisible = !this.root.classList.contains('is-cinema')
    if (hudVisible) {
      this.navigation.updateHeading(player)
      this.weaponHUD.update(player, world, this.experience.worldCamera.instance)
    }
    if (timestamp >= this.lastUpdate && timestamp - this.lastUpdate < 100) return
    this.lastUpdate = timestamp
    this.deck.update(player, cellSize)
    if (!hudVisible) return
    this.navigation.update(player, world)
    if (player?.enabled) {
      const speed = player.state.velocity.length()
      this.speed.textContent = (speed / cellSize).toFixed(1)
      this.speedBar.style.setProperty('--speed', Math.min(100, speed / player.motionConfig.maxSpeed * 100) + '%')
    }
    const biomeId = this.navigation.getCurrentBiomeId()
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
    this.map.classList.toggle('is-expanded', expanded)
    this.root.querySelector('.map-shade').hidden = !expanded
    for (const control of this.root.querySelectorAll('button[data-action="map"]')) {
      control.setAttribute('aria-expanded', String(expanded))
      control.setAttribute('aria-label', expanded ? '收起地图' : '放大小地图')
      control.title = control.getAttribute('aria-label')
    }
    this.syncPause()
    this.navigation.updateMap()
    if (expanded) this.map.querySelector('button').focus({ preventScroll: true })
    else if (this.root.classList.contains('has-cockpit-overlay')) this.root.querySelector('.action-bar [data-action="map"]').focus({ preventScroll: true })
  }

  toast(message) {
    const element = this.root.querySelector('.hud-toast')
    element.textContent = message
    element.hidden = false
    clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => { element.hidden = true }, 2600)
  }

  dispose() {
    this.loading?.dispose()
    this.loading = null
    this.joystick.reset()
    this.deck.dispose()
    this.events.abort()
    clearTimeout(this.toastTimer)
    if (this.dialog.open) this.dialog.close()
    this.navigation.dispose()
    this.root.replaceChildren()
  }
}
