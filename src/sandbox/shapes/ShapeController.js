/**
 * Shape drawing controller — shared between the 2D SSR view and the 3D
 * raycast view. Holds a "current shape" (line | rect | fill) and
 * computes the list of grid cells to fill for any given start/end.
 *
 * Cells are 2D (`{ x, z }`); the caller assigns a Y layer when committing.
 */
export class ShapeController {
  constructor({ grid }) {
    this.grid = grid
    this.tool = 'place'  // 'place' | 'line' | 'rect' | 'fill'
    this.start = null
    this.end = null
  }

  setTool(tool) {
    this.tool = tool
    this.start = null
    this.end = null
  }

  begin(cell) {
    if (this.tool === 'fill') {
      return this._floodFillCells(cell)
    }
    this.start = cell
    this.end = cell
  }

  update(cell) {
    if (this.start && !this._committed) {
      this.end = cell
    }
  }

  finish() {
    if (this.tool === 'fill') {
      const cells = this._floodFillCells(this.start ?? this.end)
      this._committed = true
      this.start = null
      this.end = null
      return cells
    }
    if (!this.start || !this.end) return []
    const start = this.start
    const end = this.end
    this._committed = true
    this.start = null
    this.end = null
    if (this.tool === 'line') return this._lineCells(start, end)
    if (this.tool === 'rect') return this._rectCells(start, end)
    return []
  }

  cancel() {
    this.start = null
    this.end = null
  }

  previewCells() {
    if (this.tool === 'fill') return []
    if (!this.start || !this.end) return []
    if (this.tool === 'line') return this._lineCells(this.start, this.end)
    if (this.tool === 'rect') return this._rectCells(this.start, this.end)
    return []
  }

  _lineCells(a, b) {
    const cells = []
    let x0 = a.x, z0 = a.z, x1 = b.x, z1 = b.z
    const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0)
    const sx = x0 < x1 ? 1 : -1
    const sz = z0 < z1 ? 1 : -1
    let err = dx - dz
    const w = this.grid.width
    const d = this.grid.depth
    while (true) {
      cells.push({ x: x0, z: z0 })
      if (x0 === x1 && z0 === z1) break
      const e2 = 2 * err
      if (e2 > -dz) { err -= dz; x0 += sx }
      if (e2 < dx) { err += dx; z0 += sz }
      if (x0 < 0 || z0 < 0 || x0 >= w || z0 >= d) break
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

  _floodFillCells(start) {
    if (!start) return []
    const isOccupied = (x, z) => {
      for (const p of this.grid.placements?.values?.() ?? []) {
        if ((p.y ?? 0) !== (this.grid.targetY ?? 0)) continue
        const fp = p.footprint ?? { x: 1, z: 1 }
        if (x >= p.x && x < p.x + fp.x && z >= p.z && z < p.z + fp.z) return true
      }
      return false
    }
    const placed = []
    const visited = new Set()
    const stack = [start]
    const keyOf = (x, z) => `${x},${z}`
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
    return placed
  }
}