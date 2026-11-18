import * as THREE from 'three/webgpu'
import { eventBus } from '../utils/event-bus.js'
import { PlaceCommand, RemoveCommand, DuplicateCommand } from './commands.js'
import { findStudSnap } from './tools/placeSnap.js'
import { SANDBOX_SELECTION_CHANGED_EVENT } from './SandboxScene.js'

const DRAG_THRESHOLD_PX = 4

/**
 * Wires pointer + keyboard input for the sandbox.
 *
 *  - pointerdown on canvas:
 *      - drag beyond threshold → enter marquee mode (drawn via CSS div)
 *      - click on a brick → select (or toggle if shift)
 *      - click on baseplate → drop the in-hand brick (PlaceCommand)
 *      - click on empty space → deselect
 *  - keydown:
 *      - Delete / Backspace → remove the selected brick(s) (RemoveCommand)
 *      - Cmd/Ctrl+Z → undo, Cmd/Ctrl+Shift+Z → redo
 *      - R → cycle rotation
 *      - `[` / `]` → adjust target Y
 *      - Escape → deselect + reset rotation
 *      - Cmd/Ctrl+A → select all
 *      - Cmd/Ctrl+D → duplicate selection
 */
export class SandboxInput {
  constructor({
    canvas,
    camera,
    scene,
    state,
    history,
    brickRenderer,
    baseplate,
    getMaxY
  }) {
    this.canvas = canvas
    this.camera = camera
    this.scene = scene
    this.state = state
    this.history = history
    this.brickRenderer = brickRenderer
    this.baseplate = baseplate
    this.getMaxY = getMaxY ?? (() => 32)

    this.raycaster = new THREE.Raycaster()
    this._tmpV3 = new THREE.Vector3()

    this._dragging = null
    this._marqueeEl = null

    this._onPointerDown = (e) => this._handlePointerDown(e)
    this._onPointerMove = (e) => this._handlePointerMove(e)
    this._onPointerUp = (e) => this._handlePointerUp(e)
    this._onKeyDown = (e) => this._handleKeyDown(e)
  }

  attach() {
    this.canvas.addEventListener('pointerdown', this._onPointerDown)
    window.addEventListener('keydown', this._onKeyDown)
  }

  detach() {
    this.canvas.removeEventListener('pointerdown', this._onPointerDown)
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('pointermove', this._onPointerMove)
    window.removeEventListener('pointerup', this._onPointerUp)
    this._removeMarquee()
  }

  _ndc(event) {
    const rect = this.canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1
    }
  }

  _raycastFromEvent(event) {
    this.raycaster.setFromCamera(this._ndc(event), this.camera)
    return this.raycaster
  }

  _handlePointerDown(event) {
    if (event.button !== 0) return
    if (event.target !== this.canvas) return

    this._dragging = {
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      shift: event.shiftKey
    }
    window.addEventListener('pointermove', this._onPointerMove)
    window.addEventListener('pointerup', this._onPointerUp)
  }

  _handlePointerMove(event) {
    if (!this._dragging) return
    this._dragging.currentX = event.clientX
    this._dragging.currentY = event.clientY
    const dx = Math.abs(this._dragging.currentX - this._dragging.startX)
    const dy = Math.abs(this._dragging.currentY - this._dragging.startY)
    if (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) {
      this._ensureMarquee()
      this._updateMarquee()
    }
  }

  _handlePointerUp(event) {
    if (!this._dragging) return
    const wasDrag = this._isDragging()
    const startClient = { x: this._dragging.startX, y: this._dragging.startY }
    const endClient = { x: this._dragging.currentX, y: this._dragging.currentY }
    const shift = this._dragging.shift
    this._dragging = null
    window.removeEventListener('pointermove', this._onPointerMove)
    window.removeEventListener('pointerup', this._onPointerUp)
    this._removeMarquee()

    if (wasDrag) {
      this._selectByMarquee(startClient, endClient, shift)
    } else {
      this._handleClick(endClient, shift)
    }
  }

  _worldToXZFromEvent(event) {
    const ray = this._raycastFromEvent(event)
    const hits = ray.intersectObjects([this.baseplate.mesh], false)
    const hit = hits[0]
    if (!hit) return null
    const cell = this._worldToCell(hit.point)
    return { x: cell.x, z: cell.z }
  }

  _isDragging() {
    if (!this._dragging) return false
    return Math.abs(this._dragging.currentX - this._dragging.startX) > DRAG_THRESHOLD_PX ||
      Math.abs(this._dragging.currentY - this._dragging.startY) > DRAG_THRESHOLD_PX
  }

  _handleClick(client, shift) {
    const fakeEvent = { clientX: client.x, clientY: client.y }
    const ray = this._raycastFromEvent(fakeEvent)
    const hit = this.brickRenderer.pickByRaycaster(this.raycaster)
    if (hit) {
      this._toggleSelection(hit.placement.id, shift)
      return
    }
    const baseplateIntersects = ray.intersectObjects([this.baseplate.mesh], false)
    const baseHit = baseplateIntersects[0]
    if (baseHit) {
      const cell = this._worldToCell(baseHit.point)
      this._dropBrick(cell.x, this.state.state.targetY, cell.z)
      return
    }
    if (!shift) {
      this._setSelection([])
    }
  }

  beginShape(client, tool) {
    const cell = this._raycastFromEvent({ clientX: client.x, clientY: client.y })
    if (!cell) return null
    const baseHit = this.raycaster.intersectObjects([this.baseplate.mesh], false)[0]
    if (!baseHit) return null
    const c = this._worldToCell(baseHit.point)
    this.state.shapeTool = tool
    this._shapeCells = [{ x: c.x, z: c.z }]
    return c
  }

  updateShape(client) {
    const baseHit = this._raycastFromEvent({ clientX: client.x, clientY: client.y })
      .intersectObjects([this.baseplate.mesh], false)[0]
    if (!baseHit) return
    const c = this._worldToCell(baseHit.point)
    if (!this._shapeStart) this._shapeStart = c
    this._shapeEnd = c
  }

  commitShape() {
    const cells = this._shapeCells ?? []
    if (cells.length === 0) return
    this._dropMany(cells)
    this._shapeStart = null
    this._shapeEnd = null
    this._shapeCells = null
  }

  cancelShape() {
    this._shapeStart = null
    this._shapeEnd = null
    this._shapeCells = null
  }

  _dropMany(cells) {
    const partNumber = this.state.state.partNumber
    const color = this.state.state.color
    const rot = this.state.state.rotation
    const y = this.state.state.targetY
    const footprint = this.state.state.partsCatalog?.[partNumber]?.footprint ?? { x: 1, z: 1 }
    this.history.do({
      do: () => {
        for (const c of cells) {
          this.brickRenderer.addBrick({ partNumber, x: c.x, y, z: c.z, rot, color })
        }
      },
      undo: () => {
        for (const c of cells) {
          const list = [...this.brickRenderer.placements.values()].filter(
            (p) => p.x === c.x && p.y === y && p.z === c.z && p.partNumber === partNumber
          )
          for (const p of list) this.brickRenderer.removeBrick(p.id)
        }
      },
      label: `drop ${cells.length}`
    })
    this.state.syncPlacements(this.brickRenderer.listPlacements())
  }

  _toggleSelection(id, shift) {
    if (!shift) {
      this._setSelection([id])
      return
    }
    const current = [...this.state.state.selectedIds]
    const idx = current.indexOf(id)
    if (idx >= 0) current.splice(idx, 1)
    else current.push(id)
    this._setSelection(current)
  }

  _selectByMarquee(start, end, shift) {
    const minX = Math.min(start.x, end.x)
    const maxX = Math.max(start.x, end.x)
    const minY = Math.min(start.y, end.y)
    const maxY = Math.max(start.y, end.y)
    const ids = []
    for (const p of this.brickRenderer.placements.values()) {
      const center = this._tmpV3.set(
        (p.x + (p.footprint?.x ?? 1) * 0.5) * this.brickRenderer.grid.cellSize,
        (p.y + (p.height ?? 1) * 0.5) * this.brickRenderer.grid.layerHeight,
        (p.z + (p.footprint?.z ?? 1) * 0.5) * this.brickRenderer.grid.cellSize
      )
      center.project(this.camera)
      const screenX = (center.x * 0.5 + 0.5) * this.canvas.clientWidth + this.canvas.getBoundingClientRect().left
      const screenY = (-center.y * 0.5 + 0.5) * this.canvas.clientHeight + this.canvas.getBoundingClientRect().top
      if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
        ids.push(p.id)
      }
    }
    if (shift) {
      const merged = new Set([...this.state.state.selectedIds, ...ids])
      this._setSelection([...merged])
    } else {
      this._setSelection(ids)
    }
  }

  _setSelection(ids) {
    this.state.setSelected(ids.length > 0 ? ids[ids.length - 1] : null)
    this.state.setSelectedIds(ids)
    this.brickRenderer.setSelected(ids)
  }

  _ensureMarquee() {
    if (this._marqueeEl) return
    const el = document.createElement('div')
    el.className = 'sandbox-marquee'
    document.body.appendChild(el)
    this._marqueeEl = el
  }

  _updateMarquee() {
    if (!this._marqueeEl || !this._dragging) return
    const a = this._dragging.startX
    const b = this._dragging.startY
    const c = this._dragging.currentX
    const d = this._dragging.currentY
    const rect = this.canvas.getBoundingClientRect()
    this._marqueeEl.style.left = `${rect.left + Math.min(a, c)}px`
    this._marqueeEl.style.top = `${rect.top + Math.min(b, d)}px`
    this._marqueeEl.style.width = `${Math.abs(c - a)}px`
    this._marqueeEl.style.height = `${Math.abs(d - b)}px`
  }

  _removeMarquee() {
    if (this._marqueeEl) {
      this._marqueeEl.parentElement?.removeChild(this._marqueeEl)
      this._marqueeEl = null
    }
  }

  _worldToCell(point) {
    return {
      x: Math.floor(point.x / this.brickRenderer.grid.cellSize),
      z: Math.floor(point.z / this.brickRenderer.grid.cellSize)
    }
  }

  _dropBrick(x, y, z) {
    const maxX = this.brickRenderer.grid.width
    const maxZ = this.brickRenderer.grid.depth
    if (x < 0 || x >= maxX || z < 0 || z >= maxZ) return
    const maxY = this.getMaxY()
    if (y < 0) y = 0
    if (y >= maxY) y = maxY - 1

    const partNumber = this.state.state.partNumber
    const color = this.state.state.color
    const rot = this.state.state.rotation
    const entry = this.state.partsCatalog?.[partNumber]
    const footprint = entry?.footprint ?? { x: 1, z: 1 }

    const placements = this.brickRenderer.listPlacements()
    const snap = findStudSnap({
      grid: this.brickRenderer.grid,
      placements,
      x, y, z,
      footprint,
      getY: () => y
    })
    const finalX = snap?.x ?? x
    const finalZ = snap?.z ?? z

    const placeAndCommit = () => {
      const cmd = new PlaceCommand({
        renderer: this.brickRenderer,
        partNumber, x: finalX, y, z: finalZ, rot, color
      })
      this.history.do(cmd)
      this.state.syncPlacements(this.brickRenderer.listPlacements())
    }
    if (this.brickRenderer.partLoader.isReady(partNumber)) {
      placeAndCommit()
    } else {
      this.brickRenderer.ensureLoaded(partNumber).then(() => {
        if (this.brickRenderer.entries.has(partNumber)) placeAndCommit()
      })
    }
  }

  _handleKeyDown(event) {
    const tag = (event.target?.tagName ?? '').toLowerCase()
    if (tag === 'input' || tag === 'textarea') return

    if (event.metaKey || event.ctrlKey) {
      if (event.key === 'z' || event.key === 'Z') {
        event.preventDefault()
        if (event.shiftKey) this.history.redo()
        else this.history.undo()
        this._setSelection([])
        this.state.syncPlacements(this.brickRenderer.listPlacements())
        return
      }
      if (event.key === 'd' || event.key === 'D') {
        event.preventDefault()
        this._duplicateSelection()
        return
      }
      if (event.key === 'a' || event.key === 'A') {
        event.preventDefault()
        const ids = [...this.brickRenderer.placements.keys()]
        this._setSelection(ids)
        return
      }
      return
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      const ids = [...this.state.state.selectedIds]
      if (ids.length === 0) return
      event.preventDefault()
      for (const id of ids) {
        const placement = this.brickRenderer.getPlacement(id)
        if (!placement) continue
        this.history.do(new RemoveCommand({
          renderer: this.brickRenderer,
          placement: { ...placement }
        }))
      }
      this._setSelection([])
      this.state.syncPlacements(this.brickRenderer.listPlacements())
      return
    }

    if (event.key === 'r' || event.key === 'R') {
      this.state.cycleRotation()
      return
    }

    if (event.key === '[') {
      this.state.setTargetY(Math.max(0, this.state.state.targetY - 1))
      return
    }

    if (event.key === ']') {
      this.state.setTargetY(Math.min(this.getMaxY() - 1, this.state.state.targetY + 1))
      return
    }

    if (event.key === 'Escape') {
      this._setSelection([])
      this.state.setRotation(0)
      return
    }
  }

  _duplicateSelection() {
    const ids = [...this.state.state.selectedIds]
    if (ids.length === 0) return
    const sources = ids
      .map((id) => this.brickRenderer.getPlacement(id))
      .filter(Boolean)
    if (sources.length === 0) return
    this.history.do(new DuplicateCommand({ renderer: this.brickRenderer, sourcePlacements: sources }))
    this.state.syncPlacements(this.brickRenderer.listPlacements())
  }
}