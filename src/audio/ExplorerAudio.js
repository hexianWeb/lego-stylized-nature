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
}

const MUSIC_GAIN = 0.8
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
    this._gestureActive = false
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
    this._musicAbort = new AbortController()

    this._onGesture = (event) => {
      if (!event.isTrusted || event.repeat || (event.type === 'pointerdown' && event.button > 0))
        return
      this._gestureActive = true
      void this.unlock()
      this._gestureActive = false
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

  /** Must run during a trusted interaction. The built-in listeners handle this automatically. */
  async unlock() {
    if (!this.enabled || !this.foreground)
      return false
    if (!this._gestureActive && this.userActivation?.isActive !== true)
      return this.unlocked
    if (this._unlockPromise)
      return this._unlockPromise

    try {
      if (!this.context)
        this._createGraph()
      const context = this.context
      this._unlockPromise = Promise.resolve(context.resume())
        .then(async () => {
          if (this.disposed || context !== this.context)
            return false
          this._syncOutput()
          this._lastMotionUpdate = -Infinity
          this.update(0)
          await this._startPlaylist()
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
  }

  setMuted(muted) {
    this.muted = Boolean(muted)
    try { this.storage?.setItem('brickland-sound-muted', String(this.muted)) }
    catch { /* Sound controls also work without browser storage. */ }
    this._syncOutput()
    if (!this.muted)
      void this.unlock()
  }

  setVolume(volume) {
    if (!Number.isFinite(volume))
      return
    this.volume = clamp01(volume)
    this._syncOutput()
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
    const player = this.experience.world?.playerAircraft
    const paused = !this.ready || !player || player.enabled === false || player.paused === true || !this.foreground
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
    const thrust = clamp01(((player.attitudeState?.leftThruster ?? 0.35) + (player.attitudeState?.rightThruster ?? 0.35)) * 0.5)
    const frequency = 72 + speedRatio * 42 + thrust * 16
    this._target(this.engine.frequency, frequency)
    this._target(this.harmonic.frequency, frequency * 2.005)
    this._target(this.engineGain.gain, 0.02 + thrust * 0.013)
    this._target(this.windGain.gain, 0.008 + speedRatio * speedRatio * 0.15, 0.28)
    this._target(this.windFilter.frequency, 500 + speedRatio * 1700, 0.28)
  }

  /** Returns false when silent, unsupported, or limited to avoid overlapping UI sounds. */
  play(name) {
    if (!this.enabled || !this.unlocked || !this.foreground || this.volume === 0 || !CUES[name])
      return false
    const now = this.context.currentTime
    const cooldown = name === 'biome' ? 12 : name === 'home' ? 0.5 : 0.07
    if (now - (this._lastCue.get(name) ?? -Infinity) < cooldown || this._voices.size + CUES[name].length > 12)
      return false
    this._lastCue.set(name, now)
    for (const note of CUES[name])
      this._playTone(note, now)
    return true
  }

  _playTone(note, now) {
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
    gain.gain.exponentialRampToValueAtTime(0.0001, end)
    gain.gain.setValueAtTime(0, end + 0.01)
    oscillator.connect(gain)
    gain.connect(this.effects)
    const voice = { oscillator, gain }
    this._voices.add(voice)
    oscillator.onended = () => {
      oscillator.disconnect()
      gain.disconnect()
      this._voices.delete(voice)
    }
    oscillator.start(start)
    oscillator.stop(end + 0.02)
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
    const loaded = await Promise.all(this.tracks.map(async (path) => {
      try {
        const response = await this.fetch(encodeURI(path), { signal: this._musicAbort.signal })
        if (!response?.ok || this.disposed || this.context !== context)
          return null
        const data = await response.arrayBuffer()
        if (this.disposed || this.context !== context)
          return null
        return await context.decodeAudioData(data)
      }
      catch {
        return null
      }
    }))
    const buffers = loaded.filter(Boolean)
    if (!this.disposed && this.context === context && buffers.length)
      this._musicBuffers = buffers
    return this.context === context ? buffers : []
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
    for (const voice of this._voices) {
      voice.oscillator.onended = null
      try { voice.oscillator.stop() }
      catch { /* A scheduled voice may already have ended. */ }
      voice.oscillator.disconnect()
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
      'master', 'ambient', 'effects', 'music', 'engine', 'engineGain', 'harmonic',
      'harmonicGain', 'wind', 'windHighpass', 'windFilter', 'windGain',
    ])
      this[field] = null
  }

  dispose() {
    if (this.disposed)
      return
    this.disposed = true
    this._musicAbort.abort()
    clearTimeout(this._suspendTimer)
    this._suspendTimer = null
    this.eventTarget?.removeEventListener('pointerdown', this._onGesture, true)
    this.eventTarget?.removeEventListener('keydown', this._onGesture, true)
    this.eventTarget?.removeEventListener('blur', this._onBlur)
    this.eventTarget?.removeEventListener('focus', this._onFocus)
    this.document?.removeEventListener('visibilitychange', this._onVisibility)
    this._releaseGraph()
    this._lastCue.clear()
  }
}
