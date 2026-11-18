const DEFAULT_CAPACITY = 200

/**
 * Command-pattern undo/redo stack.
 *
 * Commands must implement `{ do(): void, undo(): void, label?: string }`.
 * `do` is invoked once when the command is pushed; `undo` on `undo()`;
 * `do` again on `redo()`. Capacity caps the undo stack; older entries
 * are dropped silently.
 */
export class HistoryStack {
  constructor({ capacity = DEFAULT_CAPACITY } = {}) {
    this.capacity = capacity
    this.undoStack = []
    this.redoStack = []
  }

  do(command) {
    if (!command || typeof command.do !== 'function') return
    command.do()
    this.undoStack.push(command)
    if (this.undoStack.length > this.capacity) {
      this.undoStack.shift()
    }
    this.redoStack.length = 0
  }

  undo() {
    const command = this.undoStack.pop()
    if (!command) return null
    command.undo?.()
    this.redoStack.push(command)
    return command
  }

  redo() {
    const command = this.redoStack.pop()
    if (!command) return null
    command.do?.()
    this.undoStack.push(command)
    return command
  }

  clear() {
    this.undoStack.length = 0
    this.redoStack.length = 0
  }

  canUndo() {
    return this.undoStack.length > 0
  }

  canRedo() {
    return this.redoStack.length > 0
  }

  size() {
    return { undo: this.undoStack.length, redo: this.redoStack.length }
  }

  /**
   * Read-only snapshot of the last `count` undo steps. Newest first.
   */
  recent(count = 5) {
    const n = Math.min(count, this.undoStack.length)
    const slice = this.undoStack.slice(this.undoStack.length - n)
    return slice.map((cmd, i) => ({
      label: cmd.label ?? 'change',
      age: this.undoStack.length - (this.undoStack.length - n) + i
    }))
  }

  /**
   * Undo until the undo stack has `targetSize` entries. No-op if already
   * at or below the target.
   */
  undoUntil(targetSize) {
    const steps = this.undoStack.length - targetSize
    if (steps <= 0) return 0
    for (let i = 0; i < steps; i++) this.undo()
    return steps
  }
}