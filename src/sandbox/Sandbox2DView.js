/**
 * Pure-DOM 2D top-down view of the sandbox. Used when both WebGPU and
 * WebGL fail (e.g. ancient iPad with no GPU access).
 *
 * Renders the baseplate as a fixed-size grid and each brick as an
 * absolutely-positioned colored `<div>`. Pointer events on the grid
 * proxy into the existing `SandboxInput` (no separate input model).
 *
 * Cells are scaled so the whole 128×128 baseplate fits inside the
 * smaller viewport dimension with some padding.
 */
const PADDING_PX = 24
const GRID_LINE_COLOR = 'rgba(255, 255, 255, 0.08)'

export class Sandbox2DView {
  constructor({ grid, state, history, brickRenderer, baseplate, parent = document.body }) {
    this.grid = grid
    this.state = state
    this.history = history
    this.brickRenderer = brickRenderer
    this.baseplate = baseplate
    this.parent = parent

    this.panCellsX = 0
    this.panCellsY = 0
    this.zoomCells = null  // null = auto-fit
    this.shapeTool = 'place'  // 'place' | 'line' | 'rect' | 'fill'
    this._shapeStart = null
    this._shapePreviewEl = null

    this._onChange = () => this._render()
    this._onClick = (e) => this._handleClick(e)
    this._onMove = (e) => this._handleMove(e)
    this._onUp = (e) => this._handleUp(e)
    this._onKey = (e) => this._handleKey(e)
    this._onWheel = (e) => this._handleWheel(e)

    this.root = document.createElement('div')
    this.root.className = 'sandbox-2d-root'
    this.parent.appendChild(this.root)

    this.label = document.createElement('div')
    this.label.className = 'sandbox-2d-label'
    this.label.textContent = '2D fallback mode (no WebGPU/WebGL) · WASD/arrows pan · wheel zoom'
    this.root.appendChild(this.label)

    this.viewportEl = document.createElement('div')
    this.viewportEl.className = 'sandbox-2d-viewport'
    this.root.appendChild(this.viewportEl)

    this.gridEl = document.createElement('div')
    this.gridEl.className = 'sandbox-2d-grid'
    this.viewportEl.appendChild(this.gridEl)

    this.bricksEl = document.createElement('div')
    this.bricksEl.className = 'sandbox-2d-bricks'
    this.viewportEl.appendChild(this.bricksEl)

    this._setupGridLines()
    this._setupShapeToolbar()
    this.gridEl.addEventListener('pointerdown', this._onClick)
    this.bricksEl.addEventListener('pointerdown', this._onClick)
    this.root.addEventListener('wheel', this._onWheel, { passive: false })
    window.addEventListener('keydown', this._onKey)
    window.addEventListener('resize', this._onChange)
    this._render()
  }

  _setupShapeToolbar() {
    this.toolbarEl = document.createElement('div')
    this.toolbarEl.className = 'sandbox-2d-toolbar'
    const tools = [
      { id: 'place', label: '▣' },
      { id: 'line', label: '╱' },
      { id: 'rect', label: '▭' },
      { id: 'fill', label: '⬛' }
    ]
    for (const t of tools) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'sandbox-2d-toolbar__btn'
      btn.dataset.tool = t.id
      btn.title = t.id
      btn.textContent = t.label
      if (t.id === this.shapeTool) btn.classList.add('is-selected')
      btn.addEventListener('click', () => {
        this.shapeTool = t.id
        this.element.querySelectorAll('.sandbox-2d-toolbar__btn').forEach((b) => {
          b.classList.toggle('is-selected', b.dataset.tool === t.id)
        })
      })
      this.toolbarEl.appendChild(btn)
    }
    this.root.appendChild(this.toolbarEl)
  }

  _setupGridLines() {
    const { width, depth } = this.grid
    for (let i = 0; i <= width; i++) {
      const line = document.createElement('div')
      line.className = 'sandbox-2d-gridline sandbox-2d-gridline--v'
      line.style.left = `${(i / width) * 100}%`
      this.gridEl.appendChild(line)
    }
    for (let j = 0; j <= depth; j++) {
      const line = document.createElement('div')
      line.className = 'sandbox-2d-gridline sandbox-2d-gridline--h'
      line.style.top = `${(j / depth) * 100}%`
      this.gridEl.appendChild(line)
    }
  }

  _cellPixelSize() {
    const rect = this.viewportEl.getBoundingClientRect()
    const innerW = Math.max(64, rect.width - PADDING_PX * 2)
    const innerH = Math.max(64, rect.height - PADDING_PX * 2)
    const sizeW = innerW / this.grid.width
    const sizeH = innerH / this.grid.depth
    if (this.zoomCells != null) {
      return { cell: this.zoomCells, padding: PADDING_PX }
    }
    return { cell: Math.min(sizeW, sizeH), padding: PADDING_PX }
  }

  _render() {
    if (!this.gridEl) return
    const { cell, padding } = this._cellPixelSize()
    const totalW = cell * this.grid.width
    const totalH = cell * this.grid.depth
    this.gridEl.style.width = `${totalW}px`
    this.gridEl.style.height = `${totalH}px`
    this.gridEl.style.left = `${padding}px`
    this.gridEl.style.top = `${padding}px`
    this.bricksEl.style.width = `${totalW}px`
    this.bricksEl.style.height = `${totalH}px`
    this.bricksEl.style.left = `${padding}px`
    this.bricksEl.style.top = `${padding}px`

    // Apply pan transform: shift the viewport so the user can scroll around
    const panX = (this.panCellsX ?? 0) * cell
    const panY = (this.panCellsY ?? 0) * cell
    this.gridEl.style.transform = `translate(${-panX}px, ${-panY}px)`
    this.bricksEl.style.transform = `translate(${-panX}px, ${-panY}px)`

    // Render each brick. Sort by y so higher bricks draw on top.
    const placements = [...this.brickRenderer.placements.values()]
      .sort((a, b) => (a.y ?? 0) - (b.y ?? 0))

    const selIds = new Set(this.state.state.selectedIds ?? [])
    this.bricksEl.innerHTML = ''
    for (const p of placements) {
      const fp = p.footprint ?? { x: 1, z: 1 }
      const div = document.createElement('div')
      div.className = 'sandbox-2d-brick'
      if (selIds.has(p.id)) div.classList.add('is-selected')
      div.style.left = `${(p.x / this.grid.width) * 100}%`
      div.style.top = `${(p.z / this.grid.depth) * 100}%`
      div.style.width = `${(fp.x / this.grid.width) * 100}%`
      div.style.height = `${(fp.z / this.grid.depth) * 100}%`
      div.style.background = p.color ?? '#cccccc'
      div.dataset.placementId = p.id
      if (p.rot) div.style.transform = `rotate(${Math.round((p.rot * 180) / Math.PI)}deg)`
      this.bricksEl.appendChild(div)
    }
  }

  _handleKey(e) {
    const tag = (e.target?.tagName ?? '').toLowerCase()
    if (tag === 'input' || tag === 'textarea') return
    const step = 4
    if (e.key === 'w' || e.key === 'ArrowUp') {
      this.panCellsY = (this.panCellsY ?? 0) - step
      e.preventDefault()
      this._render()
    } else if (e.key === 's' || e.key === 'ArrowDown') {
      this.panCellsY = (this.panCellsY ?? 0) + step
      e.preventDefault()
      this._render()
    } else if (e.key === 'a' || e.key === 'ArrowLeft') {
      this.panCellsX = (this.panCellsX ?? 0) - step
      e.preventDefault()
      this._render()
    } else if (e.key === 'd' || e.key === 'ArrowRight') {
      this.panCellsX = (this.panCellsX ?? 0) + step
      e.preventDefault()
      this._render()
    } else if (e.key === 'Home') {
      this.panCellsX = 0
      this.panCellsY = 0
      this.zoomCells = null
      e.preventDefault()
      this._render()
    }
  }

  _handleWheel(e) {
    e.preventDefault()
    const { cell } = this._cellPixelSize()
    const delta = e.deltaY > 0 ? -0.5 : 0.5
    this.zoomCells = Math.max(8, Math.min(64, (cell ?? 16) + delta))
    this._render()
  }

  _handleClick(e) {
    const rect = this.gridEl.getBoundingClientRect()
    const localX = e.clientX - rect.left
    const localY = e.clientY - rect.top
    const cellX = Math.floor((localX / rect.width) * this.grid.width)
    const cellZ = Math.floor((localY / rect.height) * this.grid.depth)
    if (cellX < 0 || cellZ < 0 || cellX >= this.grid.width || cellZ >= this.grid.depth) return

    if (this.shapeTool === 'fill') {
      this._floodFill(cellX, cellZ)
      return
    }

    if (this.shapeTool === 'line' || this.shapeTool === 'rect') {
      this._shapeStart = { x: cellX, z: cellZ }
      this._ensureShapePreview()
      window.addEventListener('pointermove', this._onMove)
      window.addEventListener('pointerup', this._onUp)
      return
    }

    // Click on a brick: select
    const brickEl = e.target.closest('.sandbox-2d-brick')
    if (brickEl) {
      const id = brickEl.dataset.placementId
      const additive = e.shiftKey
      const ids = additive
        ? (this.state.state.selectedIds.includes(id)
            ? this.state.state.selectedIds.filter((x) => x !== id)
            : [...this.state.state.selectedIds, id])
        : [id]
      this.state.setSelectedIds(ids)
      this.state.setSelected(id)
      this.brickRenderer.setSelected(ids)
      this._render()
      return
    }

    // Click on empty cell: place
    this._dropAt(cellX, cellZ)
  }

  _handleMove(e) {
    if (!this._shapeStart) return
    const rect = this.gridEl.getBoundingClientRect()
    const cellX = Math.floor(((e.clientX - rect.left) / rect.width) * this.grid.width)
    const cellZ = Math.floor(((e.clientY - rect.top) / rect.height) * this.grid.depth)
    this._shapeEnd = {
      x: Math.max(0, Math.min(this.grid.width - 1, cellX)),
      z: Math.max(0, Math.min(this.grid.depth - 1, cellZ))
    }
    this._updateShapePreview()
  }

  _handleUp() {
    if (!this._shapeStart) return
    window.removeEventListener('pointermove', this._onMove)
    window.removeEventListener('pointerup', this._onUp)
    const start = this._shapeStart
    const end = this._shapeEnd ?? start
    this._shapeStart = null
    this._shapeEnd = null
    this._removeShapePreview()

    const cells = []
    if (this.shapeTool === 'line') {
      cells.push(...this._lineCells(start, end))
    } else if (this.shapeTool === 'rect') {
      cells.push(...this._rectCells(start, end))
    }
    if (cells.length === 0) return
    this._dropMany(cells)
  }

  _lineCells(a, b) {
    // Bresenham's line in 2D
    const cells = []
    let x0 = a.x, z0 = a.z, x1 = b.x, z1 = b.z
    const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0)
    const sx = x0 < x1 ? 1 : -1
    const sz = z0 < z1 ? 1 : -1
    let err = dx - dz
    while (true) {
      cells.push({ x: x0, z: z0 })
      if (x0 === x1 && z0 === z1) break
      const e2 = 2 * err
      if (e2 > -dz) { err -= dz; x0 += sx }
      if (e2 < dx) { err += dx; z0 += sz }
    }
    return cells
  }

  _rectCells(a, b) {
    const x0 = Math.min(a.x, b.x)
    const x1 = Math.max(a.x, b.x)
    const z0 = Math.min(a.z, b.z)
    const z1 = Math.max(a.z, b.z)
    const cells = []
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) cells.push({ x, z })
    }
    return cells
  }

  _floodFill(startX, startZ) {
    if (this.brickRenderer.partLoader.isReady === undefined) {
      // 2D mode doesn't pre-load parts; just attempt placement
    }
    const partNumber = this.state.state.partNumber
    const color = this.state.state.color
    const rot = this.state.state.rotation
    const y = this.state.state.targetY ?? 0
    const placed = []
    const visited = new Set()
    const stack = [{ x: startX, z: startZ }]
    const keyOf = (x, z) => `${x},${z}`
    const isOccupied = (x, z) => {
      for (const p of this.brickRenderer.placements.values()) {
        if ((p.y ?? 0) !== y) continue
        const fp = p.footprint ?? { x: 1, z: 1 }
        if (x >= p.x && x < p.x + fp.x && z >= p.z && z < p.z + fp.z) return true
      }
      return false
    }
    while (stack.length > 0) {
      const { x, z } = stack.pop()
      const k = keyOf(x, z)
      if (visited.has(k)) continue
      visited.add(k)
      if (x < 0 || z < 0 || x >= this.grid.width || z >= this.grid.depth) continue
      if (isOccupied(x, z)) continue
      placed.push({ x, z })
      stack.push({ x: x + 1, z })
      stack.push({ x: x - 1, z })
      stack.push({ x, z: z + 1 })
      stack.push({ x, z: z - 1 })
    }
    if (placed.length === 0) return
    this._dropMany(placed)
  }

  _dropMany(cells) {
    const partNumber = this.state.state.partNumber
    const color = this.state.state.color
    const rot = this.state.state.rotation
    const y = this.state.state.targetY ?? 0
    const footprint = this.state.state.partsCatalog?.[partNumber]?.footprint ?? { x: 1, z: 1 }
    this.history.do({
      do: () => {
        for (const c of cells) {
          this.brickRenderer.addBrick({
            partNumber, x: c.x, y, z: c.z, rot, color
          })
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
      label: `${this.shapeTool} ${cells.length} bricks`
    })
    this.state.syncPlacements(this.brickRenderer.listPlacements())
  }

  _ensureShapePreview() {
    if (this._shapePreviewEl) return
    const el = document.createElement('div')
    el.className = 'sandbox-2d-shape-preview'
    this.viewportEl.appendChild(el)
    this._shapePreviewEl = el
  }

  _updateShapePreview() {
    if (!this._shapePreviewEl || !this._shapeStart || !this._shapeEnd) return
    const a = this._shapeStart
    const b = this._shapeEnd
    const { cell } = this._cellPixelSize()
    if (this.shapeTool === 'line') {
      const cells = this._lineCells(a, b)
      this._drawShapePreviewCells(cells, cell)
    } else if (this.shapeTool === 'rect') {
      const cells = this._rectCells(a, b)
      this._drawShapePreviewCells(cells, cell)
    }
  }

  _drawShapePreviewCells(cells, cell) {
    this._shapePreviewEl.innerHTML = ''
    for (const c of cells) {
      const div = document.createElement('div')
      div.className = 'sandbox-2d-shape-cell'
      div.style.left = `${(c.x / this.grid.width) * 100}%`
      div.style.top = `${(c.z / this.grid.depth) * 100}%`
      div.style.width = `${(1 / this.grid.width) * 100}%`
      div.style.height = `${(1 / this.grid.depth) * 100}%`
      this._shapePreviewEl.appendChild(div)
    }
  }

  _removeShapePreview() {
    if (this._shapePreviewEl) {
      this._shapePreviewEl.innerHTML = ''
    }
  }

  _dropAt(x, z) {
    const partNumber = this.state.state.partNumber
    const color = this.state.state.color
    const rot = this.state.state.rotation
    const footprint = this.state.state.partsCatalog?.[partNumber]?.footprint ?? { x: 1, z: 1 }
    this.history.do({
      do: () => {
        this.brickRenderer.addBrick({
          partNumber, x, y: this.state.state.targetY ?? 0, z, rot, color
        })
      },
      undo: () => {
        const list = [...this.brickRenderer.placements.values()].filter(
          (p) => p.x === x && p.y === (this.state.state.targetY ?? 0) && p.z === z && p.partNumber === partNumber
        )
        for (const p of list) this.brickRenderer.removeBrick(p.id)
      },
      label: `place ${partNumber}`
    })
    this.state.syncPlacements(this.brickRenderer.listPlacements())
  }

  dispose() {
    window.removeEventListener('resize', this._onChange)
    window.removeEventListener('keydown', this._onKey)
    this.gridEl?.removeEventListener('pointerdown', this._onClick)
    this.bricksEl?.removeEventListener('pointerdown', this._onClick)
    this.root?.removeEventListener('wheel', this._onWheel)
    this.root?.parentElement?.removeChild(this.root)
  }
}