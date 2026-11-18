import test from 'node:test'
import assert from 'node:assert/strict'
import { HistoryStack } from '../src/sandbox/HistoryStack.js'

function makeCommand(label, log) {
  return {
    label,
    do() { log.push(`do:${label}`) },
    undo() { log.push(`undo:${label}`) }
  }
}

test('do executes the command once and enables undo', () => {
  const log = []
  const history = new HistoryStack()

  history.do(makeCommand('place', log))

  assert.deepEqual(log, ['do:place'])
  assert.equal(history.canUndo(), true)
  assert.equal(history.canRedo(), false)
  assert.deepEqual(history.size(), { undo: 1, redo: 0 })
})

test('undo and redo move the command between stacks and re-execute it', () => {
  const log = []
  const history = new HistoryStack()
  history.do(makeCommand('place', log))

  const undone = history.undo()
  assert.equal(undone.label, 'place')
  assert.deepEqual(log, ['do:place', 'undo:place'])
  assert.deepEqual(history.size(), { undo: 0, redo: 1 })

  const redone = history.redo()
  assert.equal(redone.label, 'place')
  assert.deepEqual(log, ['do:place', 'undo:place', 'do:place'])
  assert.deepEqual(history.size(), { undo: 1, redo: 0 })
})

test('a new do clears the redo stack', () => {
  const log = []
  const history = new HistoryStack()
  history.do(makeCommand('a', log))
  history.undo()
  history.do(makeCommand('b', log))

  assert.equal(history.canRedo(), false)
  assert.deepEqual(history.size(), { undo: 1, redo: 0 })
})

test('capacity overflow drops the oldest undo entry', () => {
  const log = []
  const history = new HistoryStack({ capacity: 2 })
  history.do(makeCommand('a', log))
  history.do(makeCommand('b', log))
  history.do(makeCommand('c', log))

  assert.deepEqual(history.size(), { undo: 2, redo: 0 })
  // 'a' was dropped; undo walks back c → b only.
  history.undo()
  history.undo()
  history.undo()
  assert.deepEqual(log, ['do:a', 'do:b', 'do:c', 'undo:c', 'undo:b'])
})

test('undo and redo on empty stacks return null without throwing', () => {
  const history = new HistoryStack()
  assert.equal(history.undo(), null)
  assert.equal(history.redo(), null)
})

test('do ignores non-command values', () => {
  const history = new HistoryStack()
  history.do(null)
  history.do({ label: 'no-fn' })
  assert.deepEqual(history.size(), { undo: 0, redo: 0 })
})

test('recent returns newest-first labeled snapshots', () => {
  const log = []
  const history = new HistoryStack()
  history.do(makeCommand('a', log))
  history.do(makeCommand('b', log))
  history.do(makeCommand('c', log))

  const recent = history.recent(2)
  assert.deepEqual(recent.map((r) => r.label), ['b', 'c'])
})

test('undoUntil rolls back exactly to the target stack size', () => {
  const log = []
  const history = new HistoryStack()
  history.do(makeCommand('a', log))
  history.do(makeCommand('b', log))
  history.do(makeCommand('c', log))

  const steps = history.undoUntil(1)
  assert.equal(steps, 2)
  assert.deepEqual(history.size(), { undo: 1, redo: 2 })
  assert.equal(history.undoUntil(5), 0)
})

test('clear empties both stacks', () => {
  const log = []
  const history = new HistoryStack()
  history.do(makeCommand('a', log))
  history.undo()
  history.clear()

  assert.equal(history.canUndo(), false)
  assert.equal(history.canRedo(), false)
})
