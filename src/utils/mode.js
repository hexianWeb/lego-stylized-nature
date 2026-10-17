import { eventBus } from './event-bus.js'

export const MODE_CHANGED_EVENT = 'build:mode:changed'

export const MODES = Object.freeze({
  SHOWCASE: 'showcase',
  BUILD: 'build',
  SANDBOX: 'sandbox'
})

function parseHash(hash) {
  const cleaned = (hash ?? '').replace(/^#/, '')
  if (!cleaned) return { flags: new Set(), query: new Map() }

  const parts = cleaned.split('&').filter(Boolean)
  const flags = new Set()
  const query = new Map()
  for (const part of parts) {
    if (part.includes('=')) {
      const idx = part.indexOf('=')
      query.set(part.slice(0, idx), part.slice(idx + 1))
    } else {
      flags.add(part)
    }
  }
  return { flags, query }
}

function modeFromHash(hash) {
  const { flags } = parseHash(hash)
  if (flags.has('build')) return MODES.BUILD
  if (flags.has('sandbox')) return MODES.SANDBOX
  if (flags.has('play')) return MODES.SHOWCASE
  // V2: default is sandbox when no hash
  return MODES.SANDBOX
}

/**
 * Parse the current hash without subscribing to changes.
 * Useful for one-shot lookups (e.g. URL share import).
 */
export function currentModeFromHash(hash = window.location.hash) {
  return modeFromHash(hash)
}

/**
 * Read URL hash params (e.g. `?s=…`) for things like shared scene payloads.
 */
export function currentHashQuery(hash = window.location.hash) {
  return parseHash(hash).query
}

/**
 * Watches `window.location.hash` and emits `MODE_CHANGED_EVENT` on the
 * global event bus when the mode flag (`#build` vs `#play`) flips. Other
 * hash flags such as `#debug` are preserved.
 */
export class ModeManager {
  constructor() {
    this.mode = modeFromHash(window.location.hash)
    this._onHashChange = () => this._handleHashChange()
    window.addEventListener('hashchange', this._onHashChange)
  }

  _handleHashChange() {
    const next = modeFromHash(window.location.hash)
    if (next === this.mode) return
    const previous = this.mode
    this.mode = next
    eventBus.emit(MODE_CHANGED_EVENT, { previous, current: next })
  }

  get() {
    return this.mode
  }

  set(mode) {
    let targetHash
    if (mode === MODES.BUILD) targetHash = '#build'
    else if (mode === MODES.SANDBOX) targetHash = '#sandbox'
    else targetHash = '#play'
    if (window.location.hash === targetHash || window.location.hash === `?${targetHash.slice(1)}`) {
      return
    }
    window.location.hash = targetHash
  }

  dispose() {
    window.removeEventListener('hashchange', this._onHashChange)
  }
}
