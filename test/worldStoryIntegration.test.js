import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

test('world subscribes story UI before starting the story manager', () => {
  const source = readFileSync(resolve(__dirname, '../src/world/world.js'), 'utf8')
  const modalIndex = source.indexOf('new StoryRecordModalHUD')
  const objectiveIndex = source.indexOf('new StoryObjectiveHUD')
  const managerStartIndex = source.indexOf('this.storyRecordManager.start()')

  assert.notEqual(modalIndex, -1)
  assert.notEqual(objectiveIndex, -1)
  assert.notEqual(managerStartIndex, -1)
  assert.equal(modalIndex < managerStartIndex, true)
  assert.equal(objectiveIndex < managerStartIndex, true)
})
