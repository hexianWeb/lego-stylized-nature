import { worldConfig } from '../world/WorldConfig.js'

/**
 * Pure-math helpers for the sandbox grid. Migrated from the deleted
 * `src/build/BuildGrid.js`. All coordinates are integer cell
 * coordinates (x, y, z); X/Z are cell indices inside the footprint,
 * Y is a layer index.
 *
 * `BuildGrid` is kept as an alias so that any future callers can use a
 * familiar name.
 */
export class SandboxGrid {
  constructor(config = worldConfig.terrain) {
    this.width = config.width
    this.depth = config.depth
    this.maxHeight = config.maxHeight
    this.cellSize = config.cellSize
    this.layerHeight = config.layerHeight
  }

  isInside(x, y, z) {
    return (
      x >= 0 && x < this.width &&
      y >= 0 && y < this.maxHeight &&
      z >= 0 && z < this.depth
    )
  }

  clamp(x, y, z) {
    return {
      x: Math.max(0, Math.min(this.width - 1, x)),
      y: Math.max(0, Math.min(this.maxHeight - 1, y)),
      z: Math.max(0, Math.min(this.depth - 1, z))
    }
  }

  cellToWorld(x, y, z) {
    return [
      (x + 0.5) * this.cellSize,
      y * this.layerHeight,
      (z + 0.5) * this.cellSize
    ]
  }

  worldToCell(worldPos) {
    return {
      x: Math.floor(worldPos.x / this.cellSize),
      y: Math.round(worldPos.y / this.layerHeight),
      z: Math.floor(worldPos.z / this.cellSize)
    }
  }

  worldSize() {
    return {
      width: this.width * this.cellSize,
      depth: this.depth * this.cellSize
    }
  }
}

export const BuildGrid = SandboxGrid