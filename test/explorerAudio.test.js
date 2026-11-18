import assert from 'node:assert/strict'
import test from 'node:test'
import ExplorerAudio from '../src/audio/ExplorerAudio.js'

class Events {
  listeners = new Map()
  hidden = false
  hasFocus = () => true

  addEventListener(name, callback) {
    const listeners = this.listeners.get(name) ?? new Set()
    listeners.add(callback)
    this.listeners.set(name, listeners)
  }

  removeEventListener(name, callback) {
    this.listeners.get(name)?.delete(callback)
  }

  emit(name, event = {}) {
    for (const callback of this.listeners.get(name) ?? [])
      callback({ type: name, ...event })
  }

  get listenerCount() {
    return Array.from(this.listeners.values()).reduce((sum, listeners) => sum + listeners.size, 0)
  }
}

class Parameter {
  value = 0
  targets = []

  setTargetAtTime(value) {
    this.value = value
    this.targets.push(value)
  }

  setValueAtTime(value) { this.value = value }
  linearRampToValueAtTime(value) { this.value = value }
  exponentialRampToValueAtTime(value) { this.value = value }
}

class AudioNode {
  gain = new Parameter()
  frequency = new Parameter()
  Q = new Parameter()
  disconnected = false
  started = false
  stopped = false

  connect() {}
  disconnect() { this.disconnected = true }
  start() { this.started = true }
  stop() { this.stopped = true }
}

function createAudio({ ready = true, active = false, muted = false, storageFails = false, fetch } = {}) {
  const contexts = []
  class AudioContext {
    state = 'suspended'
    currentTime = 1
    sampleRate = 100
    destination = new AudioNode()
    nodes = []
    resumeCount = 0
    suspendCount = 0
    closeCount = 0

    constructor() { contexts.push(this) }
    createNode() {
      const node = new AudioNode()
      this.nodes.push(node)
      return node
    }

    createGain() { return this.createNode() }
    createOscillator() { return this.createNode() }
    createBufferSource() { return this.createNode() }
    createBiquadFilter() { return this.createNode() }
    createBuffer(channels, size) { return { getChannelData: () => new Float32Array(size) } }
    async decodeAudioData(data) { return data }
    async resume() { this.resumeCount++; this.state = 'running' }
    async suspend() { this.suspendCount++; this.state = 'suspended' }
    async close() { this.closeCount++; this.state = 'closed' }
  }

  const events = new Events()
  const document = new Events()
  const activation = { isActive: active }
  const saved = new Map([['brickland-sound-muted', String(muted)]])
  const storage = {
    getItem(key) {
      if (storageFails)
        throw new Error('Storage unavailable')
      return saved.get(key)
    },
    setItem(key, value) {
      if (storageFails)
        throw new Error('Storage unavailable')
      saved.set(key, value)
    },
  }
  const player = {
    enabled: true,
    paused: false,
    state: { velocity: { x: 0, y: 0, z: 0 } },
    motionConfig: { maxSpeed: 10 },
    attitudeState: { leftThruster: 0.35, rightThruster: 0.35 },
  }
  const audio = new ExplorerAudio({ world: { playerAircraft: player } }, {
    AudioContext, eventTarget: events, document, userActivation: activation, storage, fetch,
  })
  if (ready)
    audio.setReady()
  return { audio, contexts, events, document, activation, player, saved }
}

test('rendering and synthetic input never create audio before a real interaction', async () => {
  const { audio, contexts, events } = createAudio()
  audio.update(100)
  assert.equal(audio.play('click'), false)
  assert.equal(await audio.unlock(), false)
  events.emit('pointerdown', { isTrusted: false })
  assert.equal(contexts.length, 0)
  events.emit('pointerdown', { isTrusted: true, button: 0 })
  await Promise.resolve()
  assert.equal(contexts.length, 1)
  assert.equal(audio.unlocked, true)
  assert.equal(audio.master.gain.value, 0.28)
  audio.dispose()
})

test('flight ambience waits for readiness, follows speed and thrust, and fades when paused', async () => {
  const { audio, contexts, player } = createAudio({ active: true, ready: false })
  assert.equal(await audio.unlock(), true)
  assert.equal(audio.ambient.gain.value, 0)
  audio.setReady()
  const idleFrequency = audio.engine.frequency.value
  const idleWind = audio.windGain.gain.value
  assert.equal(audio.ambient.gain.value, 1)
  player.state.velocity.x = 10
  player.attitudeState.leftThruster = 1
  player.attitudeState.rightThruster = 1
  audio.update(100)
  assert.ok(audio.engine.frequency.value > idleFrequency)
  assert.ok(audio.windGain.gain.value > idleWind)
  assert.ok(audio.windGain.gain.value < 0.2)
  player.paused = true
  audio.update(101)
  assert.equal(audio.ambient.gain.value, 0)
  assert.equal(audio.play('pause'), true)
  assert.equal(contexts.length, 1)
  audio.dispose()
})

test('muting persists, volume is bounded, and unavailable storage does not break controls', async () => {
  const { audio, contexts, saved } = createAudio({ active: true, muted: true })
  assert.equal(audio.enabled, false)
  assert.equal(await audio.unlock(), false)
  assert.equal(contexts.length, 0)
  audio.setMuted(false)
  await audio.unlock()
  assert.equal(saved.get('brickland-sound-muted'), 'false')
  audio.setVolume(8)
  assert.equal(audio.volume, 1)
  audio.setVolume(Number.NaN)
  assert.equal(audio.volume, 1)
  audio.setVolume(-1)
  assert.equal(audio.volume, 0)
  assert.equal(audio.play('click'), false)
  audio.setVolume(0.2)
  audio.setMuted(true)
  assert.equal(audio.master.gain.value, 0)
  assert.equal(audio.play('home'), false)
  assert.equal(saved.get('brickland-sound-muted'), 'true')
  audio.dispose()

  const withoutStorage = createAudio({ storageFails: true })
  assert.doesNotThrow(() => withoutStorage.audio.setMuted(true))
  withoutStorage.audio.dispose()
})

test('blur and hidden pages silence all output and suspend processing, then focus resumes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { audio, contexts, events, document } = createAudio({ active: true })
  await audio.unlock()
  const context = contexts[0]
  events.emit('blur')
  assert.equal(audio.master.gain.value, 0)
  assert.equal(audio.ambient.gain.value, 0)
  assert.equal(audio.play('click'), false)
  t.mock.timers.tick(100)
  assert.equal(context.suspendCount, 1)
  events.emit('focus')
  assert.equal(context.state, 'running')
  assert.equal(audio.master.gain.value, 0.28)
  document.hidden = true
  document.emit('visibilitychange')
  t.mock.timers.tick(100)
  assert.equal(context.suspendCount, 2)
  assert.equal(audio.master.gain.value, 0)
  document.hidden = false
  document.emit('visibilitychange')
  assert.equal(audio.ambient.gain.value, 1)
  audio.dispose()
})

test('short cues are bounded, finish cleanly, and disposal releases every node and listener', async () => {
  const { audio, contexts, events, document } = createAudio({ active: true })
  await audio.unlock()
  const context = contexts[0]
  assert.equal(audio.play('unknown'), false)
  assert.equal(audio.play('click'), true)
  assert.equal(audio.play('click'), false)
  const click = Array.from(audio._voices)[0]
  click.oscillator.onended()
  assert.equal(click.oscillator.disconnected, true)
  assert.equal(click.gain.disconnected, true)
  assert.equal(audio._voices.size, 0)
  for (const cue of ['home', 'pause', 'resume', 'biome']) {
    context.currentTime += 1
    assert.equal(audio.play(cue), true)
  }
  const voices = Array.from(audio._voices)
  audio.dispose()
  audio.dispose()
  assert.equal(context.closeCount, 1)
  assert.equal(audio.context, null)
  assert.equal(events.listenerCount, 0)
  assert.equal(document.listenerCount, 0)
  assert.ok(context.nodes.every(node => node.disconnected))
  assert.ok(voices.every(voice => voice.oscillator.stopped && voice.oscillator.disconnected && voice.gain.disconnected))
  assert.equal(audio.play('click'), false)
  assert.equal(await audio.unlock(), false)
})

test('background tracks play in order, loop, and continue while flight is paused', async () => {
  const warm = { name: 'warm' }
  const miniature = { name: 'miniature' }
  const requested = []
  const fetch = async (url) => {
    requested.push(url)
    const payload = url.endsWith('Warm%20Adventure.mp3') ? warm : miniature
    return { ok: true, arrayBuffer: async () => payload }
  }
  const { audio, player } = createAudio({ active: true, fetch })
  assert.equal(await audio.unlock(), true)
  assert.deepEqual(requested, [
    '/audio/Warm%20Adventure.mp3',
    '/audio/Miniature%20Nature.mp3',
  ])
  assert.equal(audio.music.gain.value, 0.8)
  assert.equal(audio._musicSource.buffer, warm)
  assert.equal(audio._musicSource.started, true)

  audio._musicSource.onended()
  assert.equal(audio._musicSource.buffer, miniature)
  audio._musicSource.onended()
  assert.equal(audio._musicSource.buffer, warm)

  player.paused = true
  audio.update(200)
  assert.equal(audio.ambient.gain.value, 0)
  assert.equal(audio.music.gain.value, 0.8)

  const playing = audio._musicSource
  const ended = playing.onended
  audio.dispose()
  assert.equal(playing.stopped, true)
  assert.equal(playing.onended, null)
  ended()
  assert.equal(audio.context, null)
})

test('an interrupted unlock cannot revive a disposed experience', async () => {
  const { audio, contexts } = createAudio({ active: true })
  const pending = audio.unlock()
  audio.dispose()
  assert.equal(await pending, false)
  assert.equal(contexts[0].state, 'closed')
  assert.equal(contexts[0].closeCount, 1)
})
