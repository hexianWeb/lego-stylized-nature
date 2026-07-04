import test from 'node:test'
import assert from 'node:assert/strict'
import { mainStoryContent, STORY_RECORD_PAGE_TYPES } from '../src/story/mainStoryContent.js'
import { zhStoryContent } from '../src/i18n/locales/zh/storyContent.js'

function assertNonEmptyString(value, label) {
  assert.equal(typeof value, 'string', label)
  assert.equal(value.trim().length > 0, true, label)
}

test('defines fixed mainline tower order', () => {
  assert.deepEqual(mainStoryContent.towerOrder, ['forest', 'badlands', 'desert', 'volcano'])
})

test('badlands story record maps to the autumn forest world tower', () => {
  assert.equal(mainStoryContent.towerRecords.badlands.towerId, 'autumnForest')
  assert.equal(zhStoryContent.towerRecords.badlands.towerId, 'autumnForest')
})

test('defines opening story, four tower records, and final reveal', () => {
  assert.equal(Boolean(mainStoryContent.openingStory), true)
  assert.equal(Boolean(mainStoryContent.finalReveal), true)
  assert.deepEqual(Object.keys(mainStoryContent.towerRecords), [
    'forest',
    'badlands',
    'desert',
    'volcano'
  ])
})

test('all records contain playable pages with supported types', () => {
  const records = [
    mainStoryContent.openingStory,
    ...Object.values(mainStoryContent.towerRecords),
    mainStoryContent.finalReveal
  ]

  for (const record of records) {
    assert.equal(typeof record.id, 'string')
    assert.equal(typeof record.title, 'string')
    assert.equal(Array.isArray(record.pages), true)
    assert.equal(record.pages.length > 0, true)

    for (const page of record.pages) {
      assert.equal(STORY_RECORD_PAGE_TYPES.has(page.type), true, `${record.id}:${page.type}`)

      if (page.type === 'comic') {
        assertNonEmptyString(page.image, `${record.id}:comic:image`)
        assertNonEmptyString(page.alt, `${record.id}:comic:alt`)
        continue
      }

      if (page.type === 'archiveLog') {
        assertNonEmptyString(page.source, `${record.id}:archiveLog:source`)
        assertNonEmptyString(page.text, `${record.id}:archiveLog:text`)
        continue
      }

      assertNonEmptyString(page.speaker, `${record.id}:${page.type}:speaker`)
      assertNonEmptyString(page.text, `${record.id}:${page.type}:text`)
    }
  }
})

test('tower records point at provided comic images', () => {
  assert.equal(mainStoryContent.towerRecords.forest.pages.some((page) => page.image === '/story/forest-evidence.png'), true)
  assert.equal(mainStoryContent.towerRecords.badlands.pages.some((page) => page.image === '/story/badlands-evidence.png'), true)
  assert.equal(mainStoryContent.towerRecords.desert.pages.some((page) => page.image === '/story/desert-evidence.png'), true)
  assert.equal(mainStoryContent.towerRecords.volcano.pages.some((page) => page.image === '/story/volcano-evidence.png'), true)
})
