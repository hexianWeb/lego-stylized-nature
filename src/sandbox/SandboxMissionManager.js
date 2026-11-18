import { eventBus } from '../utils/event-bus.js'
import { SANDBOX_CHANGE_EVENT, SANDBOX_MISSION_COMPLETE_EVENT, SANDBOX_ALL_MISSIONS_COMPLETE_EVENT } from './SandboxScene.js'
import { MISSIONS, BONUS_PARTS } from './missions.js'

/**
 * Tracks the active mission + evaluates its goal after every change.
 * When a mission is completed, emits `SANDBOX_MISSION_COMPLETE_EVENT`
 * and advances to the next one (or null if all done).
 */
export const SANDBOX_MISSION_COMPLETE_EVENT_NAME = SANDBOX_MISSION_COMPLETE_EVENT

export class SandboxMissionManager {
  constructor() {
    this.missions = MISSIONS
    this.activeIndex = 0
    this.completed = new Set()

    this._onChange = (e) => this._handleChange(e?.snapshot)
    eventBus.on(SANDBOX_CHANGE_EVENT, this._onChange)
  }

  get activeMission() {
    return this.missions[this.activeIndex] ?? null
  }

  get progress() {
    const total = this.missions.length
    const done = this.completed.size
    return { done, total, hasMore: done < total }
  }

  _handleChange(snapshot) {
    if (!snapshot || !this.activeMission) return
    const placements = snapshot.placements ?? []
    if (this._evaluateGoal(this.activeMission.goal, placements)) {
      this._complete(this.activeMission)
    }
  }

  _evaluateGoal(goal, placements) {
    if (!placements.length) return false
    if (goal.type === 'straightRow') {
      return this._hasStraightRow(placements, goal.length)
    }
    if (goal.type === 'verticalStack') {
      return this._hasVerticalStack(placements, goal.count)
    }
    if (goal.type === 'uniqueColors') {
      const colors = new Set(placements.map((p) => (p.color ?? '').toLowerCase()))
      return colors.size >= goal.count
    }
    return false
  }

  _hasStraightRow(placements, length) {
    const byY = new Map()
    for (const p of placements) {
      const y = p.y ?? 0
      if (!byY.has(y)) byY.set(y, [])
      byY.get(y).push(p)
    }
    for (const row of byY.values()) {
      if (row.length < length) continue
      const xs = new Set(row.map((p) => p.x))
      const zs = new Set(row.map((p) => p.z))
      if (xs.size === length && (xs.size + zs.size === length * 2 - 1 || zs.size === length)) {
        // all same Z (row along X) — by definition xs.size === length
      }
      if (xs.size === length && [...xs].every((x, i, arr) => i === 0 || arr[i - 1] === x - 1)) return true
      if (zs.size === length && [...zs].every((z, i, arr) => i === 0 || arr[i - 1] === z - 1)) return true
    }
    return false
  }

  _hasVerticalStack(placements, count) {
    const byXZ = new Map()
    for (const p of placements) {
      const key = `${p.x},${p.z}`
      if (!byXZ.has(key)) byXZ.set(key, [])
      byXZ.get(key).push(p.y ?? 0)
    }
    for (const ys of byXZ.values()) {
      ys.sort((a, b) => a - b)
      let run = 1
      for (let i = 1; i < ys.length; i++) {
        if (ys[i] === ys[i - 1] + 1) {
          run += 1
          if (run >= count) return true
        } else {
          run = 1
        }
      }
    }
    return false
  }

  _complete(mission) {
    if (this.completed.has(mission.id)) return
    this.completed.add(mission.id)
    eventBus.emit(SANDBOX_MISSION_COMPLETE_EVENT, {
      mission,
      index: this.activeIndex
    })
    this.activeIndex += 1
    if (this.completed.size === this.missions.length) {
      eventBus.emit(SANDBOX_ALL_MISSIONS_COMPLETE_EVENT, { bonusParts: BONUS_PARTS })
    }
  }

  dispose() {
    eventBus.off(SANDBOX_CHANGE_EVENT, this._onChange)
  }
}