import * as THREE from 'three/webgpu'
import { eventBus } from '../utils/event-bus.js'

export const SANDBOX_CHANGE_EVENT = 'sandbox:change'
export const SANDBOX_PART_SELECTED_EVENT = 'sandbox:part:selected'
export const SANDBOX_COLOR_SELECTED_EVENT = 'sandbox:color:selected'
export const SANDBOX_CATEGORY_SELECTED_EVENT = 'sandbox:category:selected'
export const SANDBOX_SELECTION_CHANGED_EVENT = 'sandbox:selection:changed'
export const SANDBOX_THUMBNAIL_READY_EVENT = 'sandbox:thumbnail:ready'
export const SANDBOX_ACHIEVEMENT_EVENT = 'sandbox:achievement'
export const SANDBOX_MISSION_COMPLETE_EVENT = 'sandbox:mission:complete'
export const SANDBOX_ALL_MISSIONS_COMPLETE_EVENT = 'sandbox:mission:all-complete'
export const SANDBOX_PARTS_UNLOCKED_EVENT = 'sandbox:parts:unlocked'

/**
 * Tiny scene state. The sandbox has no undo, no save, no missions —
 * just a single in-memory snapshot the HUDs and input handlers share.
 *
 * State shape:
 *   partNumber  → currently-selected LDraw part
 *   color       → hex string
 *   rotation    → 0 | π/2 | π | 3π/2
 *   targetY     → integer layer index
 *   selectedId  → id of the highlighted brick, or null
 *   placements  → array of placement objects (read-only snapshot)
 *   category    → active category filter, or 'all'
 */
export class SandboxScene {
  constructor() {
    this.state = {
      partNumber: '3001',
      color: '#c91a09',
      rotation: 0,
      targetY: 0,
      selectedId: null,
      selectedIds: [],
      partsCatalog: null,
      placements: [],
      category: 'all'
    }
    this._dirty = false
  }

  _emit() {
    eventBus.emit(SANDBOX_CHANGE_EVENT, this.snapshot())
  }

  snapshot() {
    return {
      partNumber: this.state.partNumber,
      color: this.state.color,
      rotation: this.state.rotation,
      targetY: this.state.targetY,
      selectedId: this.state.selectedId,
      placements: this.state.placements.slice(),
      category: this.state.category
    }
  }

  setPart(partNumber) {
    if (this.state.partNumber === partNumber) return
    this.state.partNumber = partNumber
    eventBus.emit(SANDBOX_PART_SELECTED_EVENT, { partNumber })
    this._emit()
  }

  setColor(color) {
    if (this.state.color === color) return
    this.state.color = color
    eventBus.emit(SANDBOX_COLOR_SELECTED_EVENT, { color })
    this._emit()
  }

  setCategory(category) {
    if (this.state.category === category) return
    this.state.category = category
    eventBus.emit(SANDBOX_CATEGORY_SELECTED_EVENT, { category })
    this._emit()
  }

  setRotation(rotation) {
    this.state.rotation = rotation
    this._emit()
  }

  cycleRotation() {
    this.state.rotation = (this.state.rotation + Math.PI / 2) % (Math.PI * 2)
    this._emit()
  }

  setTargetY(y) {
    this.state.targetY = y
    this._emit()
  }

  adjustTargetY(delta) {
    this.setTargetY(this.state.targetY + delta)
  }

  setSelected(id) {
    if (this.state.selectedId === id) return
    this.state.selectedId = id
    eventBus.emit(SANDBOX_SELECTION_CHANGED_EVENT, { id })
    this._emit()
  }

  setSelectedIds(ids) {
    this.state.selectedIds = ids
    this._emit()
  }

  /** Call after the renderer mutates placements. Pushes the new list
   *  onto state and notifies HUDs. */
  syncPlacements(ments) {
    this.state.placements = ments
    if (this.state.selectedId && !ments.some((p) => p.id === this.state.selectedId)) {
      this.state.selectedId = null
    }
    this._emit()
  }
}