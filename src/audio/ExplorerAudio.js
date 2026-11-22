const clamp01 = value => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))

const CUES = {
  click: [{ frequency: 880, endFrequency: 620, duration: 0.065, gain: 0.07, type: 'triangle' }],
  pause: [
    { frequency: 523.25, duration: 0.15, gain: 0.06 },
    { frequency: 392, offset: 0.075, duration: 0.19, gain: 0.055 },
  ],
  resume: [
    { frequency: 392, duration: 0.15, gain: 0.055 },
    { frequency: 523.25, offset: 0.075, duration: 0.22, gain: 0.06 },
  ],
  home: [
    { frequency: 523.25, duration: 0.22, gain: 0.055 },
    { frequency: 659.25, offset: 0.09, duration: 0.24, gain: 0.05 },
    { frequency: 783.99, offset: 0.18, duration: 0.36, gain: 0.045 },
  ],
  biome: [
    { frequency: 783.99, duration: 0.3, gain: 0.025 },
    { frequency: 1174.66, offset: 0.12, duration: 0.4, gain: 0.018 },
  ],
  cannon: [
    { frequency: 185, endFrequency: 63, duration: 0.075, gain: 0.11, type: 'sawtooth' },
    { frequency: 910, endFrequency: 220, duration: 0.024, gain: 0.037, type: 'square' },
  ],
  missile: [
    { frequency: 130, endFrequency: 48, duration: 0.19, gain: 0.14, type: 'sawtooth' },
    { frequency: 250, endFrequency: 1500, offset: 0.16, duration: 0.23, gain: 0.045, type: 'triangle' },
  ],
  hit: [{ frequency: 395, endFrequency: 174, duration: 0.09, gain: 0.095, type: 'triangle' }],
  playerHit: [{ frequency: 248, endFrequency: 62, duration: 0.15, gain: 0.2, type: 'sawtooth' }],
  enemyCannon: [{ frequency: 141, endFrequency: 69, duration: 0.075, gain: 0.07, type: 'triangle' }],
  incomingMissile: [
    { frequency: 770, duration: 0.1, gain: 0.085, type: 'square' },
    { frequency: 770, offset: 0.19, duration: 0.14, gain: 0.085, type: 'square' },
  ],
  destroyed: [
    { frequency: 165, endFrequency: 34, duration: 0.31, gain: 0.155, type: 'sawtooth' },
    { frequency: 525, endFrequency: 98, duration: 0.13, gain: 0.06, type: 'triangle' },
  ],
}

const CUE_COOLDOWNS = { biome: 12, home: 0.5, cannon: 0.045, hit: 0.12, enemyCannon: 0.12 }
const LOCK_PROGRESS_CUES = [
  { progress: 0, frequency: 780, endFrequency: 1080, duration: 0.145, gain: 0.34, type: 'triangle', release: 0.08 },
  { progress: 0.31, frequency: 1120, duration: 0.115, gain: 0.29, type: 'triangle', release: 0.06 },
  { progress: 0.58, frequency: 1320, duration: 0.095, gain: 0.32, type: 'triangle', release: 0.055 },
  { progress: 0.81, frequency: 1580, duration: 0.080, gain: 0.35, type: 'triangle', release: 0.048 },
]
const LOCK_CONFIRM_CUE = [
  { frequency: 1550, duration: 0.080, gain: 0.42, type: 'triangle', release: 0.047 },
  { frequency: 2120, offset: 0.082, duration: 0.16, gain: 0.38, type: 'triangle', release: 0.10 },
]
const LOCK_CONFIRMED = LOCK_PROGRESS_CUES.length
const LOCK_TICK_COOLDOWN = 0.09
const WEAPON_EFFECTS = {
  cannon: { file: 'gun', gain: 0.7 },
  cannonTail: { file: 'guntail', gain: 0.48 },
  missile: { file: 'missile', gain: 0.62 },
  hit: { file: 'hit', gain: 0.3 },
  blast: { file: 'blast', gain: 0.48 },
  destroyed: { file: 'explosion', gain: 0.62 },
  reload: { file: 'reload', gain: 0.4 },
}

const MUSIC_GAIN = 0.8
const MUSIC_LOCK_GAIN = 0.39
const MUSIC_TRACKS = [
  '/audio/Warm Adventure.mp3',
  '/audio/Miniature Nature.mp3',
]

/** Flight ambience, interface cues, and a looping background playlist. */
export default class ExplorerAudio {
  constructor(experience, options = {}) {
    this.experience = experience
    this.AudioContext = options.AudioContext ?? globalThis.AudioContext ?? globalThis.webkitAudioContext
    this.fetch = options.fetch ?? globalThis.fetch?.bind(globalThis)
    this.tracks = options.tracks ?? MUSIC_TRACKS
    this.eventTarget = options.eventTarget ?? globalThis.window
    this.document = options.document ?? globalThis.document
    this.userActivation = options.userActivation ?? globalThis.navigator?.userActivation
    this.context = null
    this.muted = false
    this.volume = 0.28
    this.ready = false
    try {
      this.storage = options.storage ?? globalThis.localStorage
      this.muted = this.storage?.getItem('brickland-sound-muted') === 'true'
    }
    catch { /* Storage may be unavailable in private or embedded browsing. */ }
    this.disposed = false
    this._focused = this.document?.hasFocus?.() !== false
    this._unlockPromise = null
    this._suspendTimer = null
    this._lastMotionUpdate = -Infinity
    this._lastPaused = null
    this._lastCue = new Map()
    this._nodes = new Set()
    this._sources = new Set()
    this._voices = new Set()
    this._musicBuffers = null
    this._musicSource = null
    this._musicLoading = false
    this._audioAbort = new AbortController()
    this._weaponBuffers = new Map()
    this._weaponLoading = null
    this._cannonLoop = null
    this._pendingCannon = false
    this._lockTarget = null
    this._lockStage = -1
    this._lastLockCue = -Infinity
    this._lockVoices = new Set()
    this._musicDucked = false

    this._onGesture = (event) => {
      if (!event.isTrusted || event.repeat) return
      if (this.experience.ui && (event.code === 'KeyU' || event.target?.closest?.('[data-action="sound"]'))) return
      const touchOrPen = event.pointerType === 'touch' || event.pointerType === 'pen'
      if ((event.type === 'pointerdown' && touchOrPen) || (event.type === 'pointerup' && !touchOrPen)) return
      const missilePress = event.button === 2 && event.target === this.experience.canvas && this.experience.world?.aircraftWeapons
      if (event.type === 'pointerdown' && event.button > 0 && !missilePress) return
      void this.unlock(event)
    }
    this._onBlur = () => {
      this._focused = false
      this._syncForeground()
    }
    this._onFocus = () => {
      this._focused = true
      this._syncForeground()
    }
    this._onVisibility = () => this._syncForeground()

    this.eventTarget?.addEventListener('pointerdown', this._onGesture, true)
    this.eventTarget?.addEventListener('pointerup', this._onGesture, true)
    this.eventTarget?.addEventListener('keydown', this._onGesture, true)
    this.eventTarget?.addEventListener('blur', this._onBlur)
    this.eventTarget?.addEventListener('focus', this._onFocus)
    this.document?.addEventListener('visibilitychange', this._onVisibility)
  }

  get supported() {
    return Boolean(this.AudioContext)
  }

  get enabled() {
    return this.supported && !this.muted && !this.disposed
  }

  get unlocked() {
    return this.context?.state === 'running'
  }

  get foreground() {
    return this._focused && this.document?.hidden !== true
  }

  /** Called by the built-in listeners or the sound control during a trusted interaction. */
  async unlock(event) {
    const trusted = event?.isTrusted === true
    // A real interaction can reach the page before the separate window focus event.
    const recoveredFocus = trusted && !this._focused && this.document?.hidden !== true
    if (recoveredFocus) this._focused = true
    if (!this.enabled || !this.foreground)
      return false
    if (!trusted && this.userActivation?.isActive !== true)
      return this.unlocked
    if (this.unlocked) {
      if (recoveredFocus) this._syncForeground()
      return true
    }

    try {
      if (this._unlockPromise) {
        // An earlier resume can stay pending until the browser accepts a real gesture.
        void this.context.resume().catch(() => {})
        return this._unlockPromise
      }
      if (!this.context)
        this._createGraph()
      const context = this.context
      this._unlockPromise = Promise.resolve(context.resume())
        .then(() => {
          if (this.disposed || context !== this.context)
            return false
          this._syncOutput()
          this._lastMotionUpdate = -Infinity
          this.update(0)
          this._loadWeaponEffects(context)
          if (this._pendingCannon) {
            this._pendingCannon = false
            this.play('cannon')
          }
          void this._startPlaylist()
          return this.context === context && this.unlocked
        })
        .catch(() => false)
        .finally(() => { this._unlockPromise = null })
      return await this._unlockPromise
    }
    catch {
      // Unsupported/blocked audio must never prevent the world from running.
      this._releaseGraph()
      return false
    }
  }

  setEnabled(enabled) {
    this.setMuted(!enabled)
  }

  setReady(ready = true) {
    this.ready = Boolean(ready)
    this._lastMotionUpdate = -Infinity
    this.update(0)
    if (this.unlocked) this._loadWeaponEffects(this.context)
  }

  setMuted(muted, event) {
    this.muted = Boolean(muted)
    try { this.storage?.setItem('brickland-sound-muted', String(this.muted)) }
    catch { /* Sound controls also work without browser storage. */ }
    this._syncOutput()
    if (this.muted) {
      this._stopCannon()
      this._stopLockVoices()
      return
    }
    return this.unlock(event)
  }

  setVolume(volume) {
    if (!Number.isFinite(volume))
      return
    this.volume = clamp01(volume)
    this._syncOutput()
    if (this.volume === 0) this._stopLockVoices()
  }

  _track(node) {
    this._nodes.add(node)
    return node
  }

  _start(source) {
    this._sources.add(source)
    source.start()
    return source
  }

  _createGraph() {
    const context = new this.AudioContext({ latencyHint: 'interactive' })
    this.context = context
    this.master = this._track(context.createGain())
    this.master.gain.value = 0
    this.master.connect(context.destination)
    this.ambient = this._track(context.createGain())
    this.ambient.gain.value = 0
    this.ambient.connect(this.master)
    this.effects = this._track(context.createGain())
    this.effects.gain.value = 0.8
    this.effects.connect(this.master)
    this.lockBus = this._track(context.createGain())
    this.lockBus.connect(this.master)
    this.music = this._track(context.createGain())
    this.music.gain.value = MUSIC_GAIN
    this.music.connect(this.master)

    this.engine = this._track(context.createOscillator())
    this.engine.type = 'sine'
    this.engine.frequency.value = 72
    this.engineGain = this._track(context.createGain())
    this.engineGain.gain.value = 0.024
    this.engine.connect(this.engineGain)
    this.engineGain.connect(this.ambient)

    this.harmonic = this._track(context.createOscillator())
    this.harmonic.type = 'sine'
    this.harmonic.frequency.value = 144
    this.harmonicGain = this._track(context.createGain())
    this.harmonicGain.gain.value = 0.006
    this.harmonic.connect(this.harmonicGain)
    this.harmonicGain.connect(this.ambient)

    const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate)
    const samples = buffer.getChannelData(0)
    let noise = 0
    for (let i = 0; i < samples.length; i++) {
      noise = noise * 0.93 + (Math.random() * 2 - 1) * 0.07
      samples[i] = noise * 2
    }
    // Bring the loop ends together so the wind has no periodic click.
    const fadeSamples = Math.min(Math.floor(context.sampleRate * 0.05), Math.floor(samples.length / 2))
    for (let i = 0; i < fadeSamples; i++) {
      samples[i] *= i / fadeSamples
      samples[samples.length - 1 - i] *= i / fadeSamples
    }
    this.wind = this._track(context.createBufferSource())
    this.wind.buffer = buffer
    this.wind.loop = true
    this.windHighpass = this._track(context.createBiquadFilter())
    this.windHighpass.type = 'highpass'
    this.windHighpass.frequency.value = 160
    this.windFilter = this._track(context.createBiquadFilter())
    this.windFilter.type = 'lowpass'
    this.windFilter.frequency.value = 550
    this.windFilter.Q.value = 0.45
    this.windGain = this._track(context.createGain())
    this.windGain.gain.value = 0.012
    this.wind.connect(this.windHighpass)
    this.windHighpass.connect(this.windFilter)
    this.windFilter.connect(this.windGain)
    this.windGain.connect(this.ambient)
    this._start(this.engine)
    this._start(this.harmonic)
    this._start(this.wind)
  }

  _target(parameter, value, timeConstant = 0.18) {
    parameter.setTargetAtTime(value, this.context.currentTime, timeConstant)
  }

  _syncOutput() {
    if (!this.context || this.disposed)
      return
    this._target(this.master.gain, this.muted || !this.foreground ? 0 : this.volume, 0.025)
  }

  _syncForeground() {
    clearTimeout(this._suspendTimer)
    this._suspendTimer = null
    if (!this.context || this.disposed)
      return
    this._syncOutput()
    this._lastMotionUpdate = -Infinity
    this.update(0)
    if (!this.foreground) {
      // Let the short fade finish before suspending the audio processing thread.
      this._suspendTimer = setTimeout(() => {
        this._suspendTimer = null
        if (!this.disposed && !this.foreground)
          void this.context?.suspend().catch(() => {})
      }, 100)
    }
    else {
      // An existing context was already authorized by the first interaction.
      void this.context.resume().catch(() => {})
    }
  }

  /** Called by the frame loop; no audio context is created here. */
  update(timestamp = 0) {
    if (!this.context || this.disposed)
      return
    const world = this.experience.world
    const player = world?.playerAircraft
    const paused = !this.ready || !player || player.enabled === false || player.paused === true || !this.foreground
    const silent = paused || this.muted || this.volume === 0
    if (silent) this._stopCannon()
    else if (this._cannonLoop && this.context.currentTime >= this._cannonLoop.until) this._stopCannon(true)
    if (this.unlocked || silent) {
      this._updateMissileLock(world?.aircraftWeapons, !silent && !world?.aircraftCombatStatus?.defeated)
    }
    if (paused === this._lastPaused && timestamp >= this._lastMotionUpdate && timestamp - this._lastMotionUpdate < 50)
      return
    this._lastMotionUpdate = timestamp
    this._lastPaused = paused
    this._target(this.ambient.gain, paused ? 0 : 1, 0.12)
    if (paused)
      return

    const velocity = player.state?.velocity
    const speed = typeof velocity?.length === 'function'
      ? velocity.length()
      : Math.hypot(velocity?.x ?? 0, velocity?.y ?? 0, velocity?.z ?? 0)
    const maxSpeed = player.motionConfig?.maxSpeed ?? 1
    const speedRatio = clamp01(maxSpeed > 0 ? speed / maxSpeed : 0)
    const thrust = 0.35 + 0.65 * clamp01(player.state?.boost ?? 0)
    const frequency = 72 + speedRatio * 42 + thrust * 16
    this._target(this.engine.frequency, frequency)
    this._target(this.harmonic.frequency, frequency * 2.005)
    this._target(this.engineGain.gain, 0.02 + thrust * 0.013)
    this._target(this.windGain.gain, 0.008 + speedRatio * speedRatio * 0.15, 0.28)
    this._target(this.windFilter.frequency, 500 + speedRatio * 1700, 0.28)
  }

  /** Returns false when silent, unsupported, or limited to avoid overlapping UI sounds. */
  play(name) {
    if (!this.enabled || !this.foreground || this.volume === 0)
      return false
    if (!this.unlocked) {
      // A click can fire before the first trusted gesture's resume has resolved.
      if (name === 'cannon' && this._unlockPromise) this._pendingCannon = true
      return false
    }
    const now = this.context.currentTime
    const sample = this._weaponBuffers.get(name)
    if (name === 'cannon' && sample) {
      if (!this._cannonLoop) {
        if (this._voices.size >= 12) return false
        const voice = this._playSample(sample, now, true)
        this._cannonLoop = { voice, started: now, until: now }
      }
      this._cannonLoop.until = now + 0.14
      return true
    }

    const tones = CUES[name === 'blast' ? 'destroyed' : name === 'reload' ? 'click' : name]
    if (!sample && !tones) return false
    const cooldown = CUE_COOLDOWNS[name] ?? 0.07
    if (now - (this._lastCue.get(name) ?? -Infinity) < cooldown || this._voices.size + (sample ? 1 : tones.length) > 12)
      return false
    this._lastCue.set(name, now)
    if (sample) this._playSample(sample, now)
    else for (const note of tones) this._playTone(note, now)
    return true
  }

  _connectVoice(source, gain, output = this.effects) {
    source.connect(gain)
    gain.connect(output)
    const voice = { source, gain }
    this._voices.add(voice)
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
      this._voices.delete(voice)
      if (this._lockVoices.delete(voice) && this._lockVoices.size === 0) this._setMusicDucked(false)
    }
    return voice
  }

  _playSample({ buffer, gain: level }, now, loop = false) {
    const source = this.context.createBufferSource()
    const gain = this.context.createGain()
    source.buffer = buffer
    source.loop = loop
    gain.gain.value = loop ? 0 : level
    if (loop) gain.gain.setTargetAtTime(level, now, 0.008)
    const voice = this._connectVoice(source, gain)
    source.start(now)
    return voice
  }

  _stopCannon(playTail = false) {
    this._pendingCannon = false
    const loop = this._cannonLoop
    if (!loop) return
    this._cannonLoop = null
    const now = this.context.currentTime
    loop.voice.gain.gain.setTargetAtTime(0, now, 0.012)
    loop.voice.source.stop(now + 0.05)
    if (playTail && now - loop.started >= 0.2)
      this.play('cannonTail')
  }

  _updateMissileLock(weapons, audible) {
    const target = weapons?.lockTarget ?? null
    const stage = !target ? -1 : weapons.locked ? LOCK_CONFIRMED
      : LOCK_PROGRESS_CUES.findLastIndex(cue => weapons.lockProgress >= cue.progress)
    const newTarget = target !== this._lockTarget || stage < this._lockStage
    this._lockTarget = target
    if (!audible || newTarget) this._stopLockVoices()
    if (newTarget) this._lockStage = -1
    if (!audible) {
      this._lockStage = stage
      return
    }
    if (stage <= this._lockStage) return

    const now = this.context.currentTime
    const confirmed = stage === LOCK_CONFIRMED
    // Retry an acquisition on the next frame if a rapid swap overlaps the cooldown.
    if (!confirmed && now - this._lastLockCue < LOCK_TICK_COOLDOWN) return
    const notes = confirmed ? LOCK_CONFIRM_CUE : [LOCK_PROGRESS_CUES[this._lockStage < 0 ? 0 : stage]]
    this._lockStage = stage
    this._lastLockCue = now
    this._stopLockVoices()
    // The lock has its own two short voices so a burst of combat sounds cannot mask the confirmation.
    for (const note of notes) this._lockVoices.add(this._playTone(note, now, this.lockBus))
    this._setMusicDucked(true)
  }

  _setMusicDucked(ducked) {
    if (this._musicDucked === ducked) return
    this._musicDucked = ducked
    this._target(this.music.gain, ducked ? MUSIC_LOCK_GAIN : MUSIC_GAIN, ducked ? 0.018 : 0.18)
  }

  _stopLockVoices() {
    if (!this._lockVoices.size) return
    const now = this.context.currentTime
    for (const { source, gain } of this._lockVoices) {
      gain.gain.cancelScheduledValues(now)
      gain.gain.setTargetAtTime(0, now, 0.006)
      source.stop(now + 0.02)
    }
    this._lockVoices.clear()
    this._setMusicDucked(false)
  }

  _playTone(note, now, output) {
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    const start = now + (note.offset ?? 0)
    const end = start + note.duration
    oscillator.type = note.type ?? 'sine'
    oscillator.frequency.setValueAtTime(note.frequency, start)
    if (note.endFrequency)
      oscillator.frequency.exponentialRampToValueAtTime(note.endFrequency, end)
    gain.gain.setValueAtTime(0, now)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.linearRampToValueAtTime(note.gain, start + 0.008)
    if (note.release) gain.gain.setValueAtTime(note.gain, start + note.release)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)
    gain.gain.setValueAtTime(0, end + 0.01)
    const voice = this._connectVoice(oscillator, gain, output)
    oscillator.start(start)
    oscillator.stop(end + 0.02)
    return voice
  }

  async _startPlaylist() {
    if (this.disposed || !this.context || !this.fetch || this._musicSource || this._musicLoading || !this.tracks?.length)
      return
    const context = this.context
    this._musicLoading = true
    try {
      const buffers = await this._loadTracks(context)
      if (this.disposed || this.context !== context || this._musicSource || !buffers.length)
        return
      this._playTrack(0)
    }
    catch {
      // A missing soundtrack must not affect flight or the interface.
    }
    finally {
      this._musicLoading = false
    }
  }

  async _loadTracks(context) {
    if (this._musicBuffers)
      return this._musicBuffers
    const loaded = await Promise.all(this.tracks.map(path => this._decodeSample(context, path)))
    const buffers = loaded.filter(Boolean)
    if (!this.disposed && this.context === context && buffers.length)
      this._musicBuffers = buffers
    return this.context === context ? buffers : []
  }

  async _decodeSample(context, path) {
    try {
      const response = await this.fetch(encodeURI(path), { signal: this._audioAbort.signal })
      if (!response?.ok || this.disposed || this.context !== context) return null
      const data = await response.arrayBuffer()
      if (this.disposed || this.context !== context) return null
      const buffer = await context.decodeAudioData(data)
      return !this.disposed && this.context === context ? buffer : null
    }
    catch {
      return null
    }
  }

  _loadWeaponEffects(context) {
    if (!this.fetch || !this.experience.world?.aircraftWeapons || this._weaponLoading) return
    this._weaponLoading = Promise.all(Object.entries(WEAPON_EFFECTS).map(async ([name, effect]) => {
      const buffer = await this._decodeSample(context, `/audio/weapon-effects/${effect.file}.mp3`)
      if (buffer && this.context === context && !this.disposed) {
        this._weaponBuffers.set(name, { buffer, gain: effect.gain })
        if (name === 'hit') this._weaponBuffers.set('playerHit', { buffer, gain: 0.75 })
      }
    }))
  }

  _playTrack(index) {
    const buffers = this._musicBuffers
    if (!buffers?.length || this.disposed || !this.context || !this.music)
      return
    const next = index % buffers.length
    const buffer = buffers[next]
    if (!buffer)
      return
    this._stopMusic()
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.connect(this.music)
    source.onended = () => {
      if (this._musicSource !== source)
        return
      this._musicSource = null
      this._sources.delete(source)
      try { source.disconnect() }
      catch { /* The source may already have been released. */ }
      this._playTrack(next + 1)
    }
    this._musicSource = source
    this._start(source)
  }

  _stopMusic() {
    const source = this._musicSource
    if (!source)
      return
    this._musicSource = null
    source.onended = null
    try { source.stop() }
    catch { /* An ended track has already stopped. */ }
    try { source.disconnect() }
    catch { /* The source may already have been released. */ }
    this._sources.delete(source)
  }

  _releaseGraph() {
    this._stopMusic()
    this._musicBuffers = null
    this._musicLoading = false
    this._weaponLoading = null
    this._weaponBuffers.clear()
    this._cannonLoop = null
    this._pendingCannon = false
    this._lockTarget = null
    this._lockStage = -1
    this._lastLockCue = -Infinity
    this._lockVoices.clear()
    this._musicDucked = false
    for (const voice of this._voices) {
      voice.source.onended = null
      try { voice.source.stop() }
      catch { /* A scheduled voice may already have ended. */ }
      voice.source.disconnect()
      voice.gain.disconnect()
    }
    this._voices.clear()
    for (const source of this._sources) {
      try { source.stop() }
      catch { /* A partially initialized source may not have started. */ }
    }
    this._sources.clear()
    for (const node of this._nodes)
      node.disconnect()
    this._nodes.clear()
    if (this.context && this.context.state !== 'closed')
      void this.context.close().catch(() => {})
    this.context = null
    for (const field of [
      'master', 'ambient', 'effects', 'lockBus', 'music', 'engine', 'engineGain', 'harmonic',
      'harmonicGain', 'wind', 'windHighpass', 'windFilter', 'windGain',
    ])
      this[field] = null
  }

  dispose() {
    if (this.disposed)
      return
    this.disposed = true
    this._audioAbort.abort()
    clearTimeout(this._suspendTimer)
    this._suspendTimer = null
    this.eventTarget?.removeEventListener('pointerdown', this._onGesture, true)
    this.eventTarget?.removeEventListener('pointerup', this._onGesture, true)
    this.eventTarget?.removeEventListener('keydown', this._onGesture, true)
    this.eventTarget?.removeEventListener('blur', this._onBlur)
    this.eventTarget?.removeEventListener('focus', this._onFocus)
    this.document?.removeEventListener('visibilitychange', this._onVisibility)
    this._releaseGraph()
    this._lastCue.clear()
  }
}
