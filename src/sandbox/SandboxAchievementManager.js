import { eventBus } from '../utils/event-bus.js'
import { SANDBOX_CHANGE_EVENT, SANDBOX_ACHIEVEMENT_EVENT } from './SandboxScene.js'

/**
 * Listens to sandbox state changes and fires achievement events when
 * milestones cross. Achievements are tracked via `Set` so each one
 * fires exactly once per page-load (achievements persisted in
 * `localStorage` are intentionally NOT consulted — we want a fresh
 * "wow" on every visit, not a stale one).
 */
const MILESTONES = [
  { id: 'firstBrick',     matchCount: 1,   label: 'First brick placed' },
  { id: 'tenBricks',      matchCount: 10,  label: '10 bricks laid' },
  { id: 'fiftyBricks',    matchCount: 50,  label: 'Half century' },
  { id: 'hundredBricks',  matchCount: 100, label: 'Centurion' }
]

export class SandboxAchievementManager {
  constructor() {
    this.achieved = new Set()
    this.paintSeen = false
    this.deleteSeen = false
    this.saveSeen = false
    this.shareSeen = false
    this.importSeen = false

    this._onChange = (e) => this._handleStateChange(e?.snapshot)
    eventBus.on(SANDBOX_CHANGE_EVENT, this._onChange)
  }

  _handleStateChange(snapshot) {
    if (!snapshot) return
    const count = snapshot.placements?.length ?? 0
    for (const ms of MILESTONES) {
      if (this.achieved.has(ms.id)) continue
      if (count >= ms.matchCount) {
        this._fire(ms.id, ms.label)
      }
    }
  }

  /**
   * Fire one-shot achievements from tool/persistence actions.
   * Pass an event name like 'paint' / 'delete' / 'save' / 'share' / 'import'.
   */
  reportAction(action) {
    if (action === 'paint' && !this.paintSeen) {
      this.paintSeen = true
      this._fire('firstPaint', 'First color applied')
    } else if (action === 'delete' && !this.deleteSeen) {
      this.deleteSeen = true
      this._fire('firstDelete', 'Cleared a brick')
    } else if (action === 'save' && !this.saveSeen) {
      this.saveSeen = true
      this._fire('firstSave', 'Saved your build')
    } else if (action === 'share' && !this.shareSeen) {
      this.shareSeen = true
      this._fire('firstShare', 'Shared with the world')
    } else if (action === 'import' && !this.importSeen) {
      this.importSeen = true
      this._fire('firstImport', 'Loaded a build')
    }
  }

  _fire(id, label) {
    this.achieved.add(id)
    eventBus.emit(SANDBOX_ACHIEVEMENT_EVENT, { id, label })
  }

  dispose() {
    eventBus.off(SANDBOX_CHANGE_EVENT, this._onChange)
  }
}