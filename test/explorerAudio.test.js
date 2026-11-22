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

  connect(output) { this.output = output }
  disconnect() { this.disconnected = true }
  start() { this.started = true }
  stop() { this.stopped = true }
}

function createAudio({ ready = true, active = false, muted = false, storageFails = false, fetch, tracks, weapons = false } = {}) {
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
    state: { velocity: { x: 0, y: 0, z: 0 }, boost: 0 },
    motionConfig: { maxSpeed: 10 },
  }
  const world = { playerAircraft: player, aircraftWeapons: weapons ? {} : undefined }
  const audio = new ExplorerAudio({ world }, {
    AudioContext, eventTarget: events, document, userActivation: activation, storage, fetch, tracks,
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
  player.state.boost = 1
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
  click.source.onended()
  assert.equal(click.source.disconnected, true)
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
  assert.ok(voices.every(voice => voice.source.stopped && voice.source.disconnected && voice.gain.disconnected))
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

const WEAPON_CLIPS = ['gun', 'guntail', 'missile', 'hit', 'blast', 'explosion', 'reload']
const clipName = url => url.slice(url.lastIndexOf('/') + 1, -4)
const clipResponse = clip => ({ ok: true, arrayBuffer: async () => ({ clip, duration: 0.45 }) })
const sampled = (context, clip) => context.nodes.filter(node => node.buffer?.clip === clip)

test('weapon clips load once on unlock and leave synthesis available before or after a failed load', async () => {
  let releaseGun
  const gunReady = new Promise(resolve => { releaseGun = resolve })
  const requested = []
  const fetch = async (url) => {
    requested.push(url)
    const clip = clipName(url)
    if (clip === 'gun') await gunReady
    if (clip === 'hit') return { ok: false }
    return clipResponse(clip)
  }
  const { audio, contexts, events } = createAudio({ fetch, tracks: [], weapons: true })
  assert.equal(audio.play('cannon'), false)
  assert.deepEqual(requested, [])

  events.emit('pointerdown', { isTrusted: true, button: 0 })
  await new Promise(resolve => setImmediate(resolve))
  const context = contexts[0]
  assert.equal(audio.unlocked, true)
  assert.equal(audio.play('cannon'), true)
  assert.ok(Array.from(audio._voices).some(voice => voice.source.started && !voice.source.buffer))
  assert.equal(sampled(context, 'gun').length, 0)

  releaseGun()
  await audio._weaponLoading
  context.currentTime += 1
  assert.equal(audio.play('cannon'), true)
  assert.equal(sampled(context, 'gun').length, 1)
  for (const [cue, clip] of [['missile', 'missile'], ['destroyed', 'explosion'], ['blast', 'blast'], ['reload', 'reload']]) {
    assert.equal(audio.play(cue), true)
    const [source] = sampled(context, clip)
    assert.ok(source?.started)
    assert.ok(source.output === audio.effects || source.output?.output === audio.effects)
  }
  const before = audio._voices.size
  assert.equal(audio.play('hit'), true)
  assert.equal(audio.play('playerHit'), true)
  assert.ok(audio._voices.size > before)
  assert.equal(sampled(context, 'hit').length, 0)

  events.emit('keydown', { isTrusted: true })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(requested.sort(), WEAPON_CLIPS.map(clip => `/audio/weapon-effects/${clip}.mp3`).sort())
  audio.dispose()
})

test('player damage reuses the impact clip at higher volume and enemy fire leaves the player cannon idle', async () => {
  const fetch = async url => clipResponse(clipName(url))
  const { audio, contexts } = createAudio({ active: true, fetch, tracks: [], weapons: true })
  await audio.unlock()
  await audio._weaponLoading
  assert.equal(audio.play('enemyCannon'), true)
  assert.equal(sampled(contexts[0], 'gun').length, 0)
  assert.equal(audio.play('hit'), true)
  assert.equal(audio.play('playerHit'), true)
  const [outgoing, incoming] = sampled(contexts[0], 'hit')
  assert.equal(incoming.buffer, outgoing.buffer)
  assert.ok(incoming.output.gain.value > outgoing.output.gain.value)
  audio.dispose()
})

test('cannon pulses share one loop, use a tail on sustained release, and stop silently on mute', async () => {
  const fetch = async url => clipResponse(clipName(url))
  const { audio, contexts } = createAudio({ active: true, fetch, tracks: [], weapons: true })
  await audio.unlock()
  await audio._weaponLoading
  const context = contexts[0]
  const fireBurst = () => {
    for (let i = 0; i < 5; i++) {
      context.currentTime += 0.06
      assert.equal(audio.play('cannon'), true)
    }
    return sampled(context, 'gun').at(-1)
  }

  const loop = fireBurst()
  assert.equal(sampled(context, 'gun').length, 1)
  assert.equal(loop.loop, true)
  assert.equal(loop.started, true)
  context.currentTime += 0.07
  audio.update(16)
  assert.equal(loop.stopped, false)
  context.currentTime += 0.10
  audio.update(32)
  assert.equal(loop.stopped, true)
  assert.equal(sampled(context, 'guntail').length, 1)

  const nextLoop = fireBurst()
  audio.setMuted(true)
  assert.equal(nextLoop.stopped, true)
  assert.equal(audio.master.gain.value, 0)
  assert.equal(audio.play('cannon'), false)
  context.currentTime += 1
  audio.update(48)
  assert.equal(sampled(context, 'guntail').length, 1)

  const [tail] = sampled(context, 'guntail')
  audio.dispose()
  assert.equal(tail.stopped, true)
  assert.equal(tail.disconnected, true)
  assert.equal(nextLoop.disconnected, true)
})

test('disposal aborts weapon loads and late data cannot start audio', async () => {
  let release
  const ready = new Promise(resolve => { release = resolve })
  const signals = []
  const fetch = async (url, { signal }) => {
    signals.push(signal)
    await ready
    return clipResponse(clipName(url))
  }
  const { audio, contexts } = createAudio({ active: true, fetch, tracks: [], weapons: true })
  await audio.unlock()
  const loading = audio._weaponLoading
  const context = contexts[0]
  const nodeCount = context.nodes.length
  assert.equal(signals.length, WEAPON_CLIPS.length)
  assert.ok(signals.every(signal => !signal.aborted))

  audio.dispose()
  assert.ok(signals.every(signal => signal.aborted))
  release()
  await loading
  assert.equal(context.closeCount, 1)
  assert.equal(context.nodes.length, nodeCount)
  assert.equal(audio.play('missile'), false)
})
