/**
 * Concrete commands for sandbox brick manipulation. Each command
 * captures enough state to be reversed by the `HistoryStack`.
 */
export class PlaceCommand {
  constructor({ renderer, partNumber, x, y, z, rot, color }) {
    this.renderer = renderer
    this.partNumber = partNumber
    this.x = x
    this.y = y
    this.z = z
    this.rot = rot
    this.color = color
    this.placement = null
    this.label = `place ${partNumber}`
  }

  do() {
    this.placement = this.renderer.addBrick({
      partNumber: this.partNumber,
      x: this.x,
      y: this.y,
      z: this.z,
      rot: this.rot,
      color: this.color
    })
  }

  undo() {
    if (this.placement) this.renderer.removeBrick(this.placement.id)
  }
}

export class RemoveCommand {
  constructor({ renderer, placement }) {
    this.renderer = renderer
    this.placement = { ...placement }
    this.label = `remove ${placement.partNumber}`
  }

  do() {
    this.renderer.removeBrick(this.placement.id)
  }

  undo() {
    this.renderer.addPlacement({ ...this.placement })
  }
}

export class MoveCommand {
  constructor({ renderer, placement, targetX, targetY, targetZ, targetRot }) {
    this.renderer = renderer
    this.placement = placement
    this.fromX = placement.x
    this.fromY = placement.y
    this.fromZ = placement.z
    this.fromRot = placement.rot ?? 0
    this.toX = targetX
    this.toY = targetY
    this.toZ = targetZ
    this.toRot = targetRot
    this.label = `move ${placement.partNumber}`
  }

  do() {
    this.renderer.updatePlacement(this.placement.id, {
      x: this.toX, y: this.toY, z: this.toZ, rot: this.toRot
    })
    this.placement.x = this.toX
    this.placement.y = this.toY
    this.placement.z = this.toZ
    this.placement.rot = this.toRot
  }

  undo() {
    this.renderer.updatePlacement(this.placement.id, {
      x: this.fromX, y: this.fromY, z: this.fromZ, rot: this.fromRot
    })
    this.placement.x = this.fromX
    this.placement.y = this.fromY
    this.placement.z = this.fromZ
    this.placement.rot = this.fromRot
  }
}

export class PaintCommand {
  constructor({ renderer, placement, newColor }) {
    this.renderer = renderer
    this.placement = placement
    this.fromColor = placement.color
    this.toColor = newColor
    this.label = `paint ${placement.partNumber}`
  }

  do() {
    this.renderer.updatePlacement(this.placement.id, { color: this.toColor })
    this.placement.color = this.toColor
  }

  undo() {
    this.renderer.updatePlacement(this.placement.id, { color: this.fromColor })
    this.placement.color = this.fromColor
  }
}

/**
 * Duplicate a set of selected placements, offsetting each by +1 cell
 * on the X axis so the copy is visible next to the originals.
 */
export class DuplicateCommand {
  constructor({ renderer, sourcePlacements, offsetX = 1, offsetZ = 0 }) {
    this.renderer = renderer
    this.sourcePlacements = sourcePlacements
    this.offsetX = offsetX
    this.offsetZ = offsetZ
    this.created = []
    this.label = `duplicate ${sourcePlacements.length}`
  }

  do() {
    this.created = []
    for (const src of this.sourcePlacements) {
      const clone = this.renderer.addBrick({
        partNumber: src.partNumber,
        x: src.x + this.offsetX,
        y: src.y,
        z: src.z + this.offsetZ,
        rot: src.rot ?? 0,
        color: src.color
      })
      if (clone) this.created.push(clone)
    }
  }

  undo() {
    for (const placement of this.created) {
      this.renderer.removeBrick(placement.id)
    }
  }
}
