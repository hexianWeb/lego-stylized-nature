import test from 'node:test'
import assert from 'node:assert/strict'
import { getLocalizedStoryContent } from '../src/i18n/getLocalizedStoryContent.js'
import {
  getLocaleLabel,
  initI18n,
  setLocale,
  t
} from '../src/i18n/i18n.js'

test('translates control guide strings for English and Chinese', () => {
  initI18n()
  setLocale('en')
  assert.equal(t('controlGuide.activateTower'), 'Activate Tower')

  setLocale('zh')
  assert.equal(t('controlGuide.activateTower'), '激活塔')
  assert.equal(getLocaleLabel('zh'), '中文')
})

test('returns localized story content by locale', () => {
  initI18n()
  setLocale('en')
  assert.equal(getLocalizedStoryContent('en').openingStory.title, 'Mysterious Signal Received')

  setLocale('zh')
  const zh = getLocalizedStoryContent('zh')
  assert.equal(zh.openingStory.title, '收到神秘信号')
  assert.equal(zh.openingStory.pages[0].speaker, '伊瑟拉代表')
  assert.equal(zh.openingStory.pages.length, 3)
  assert.equal(zh.openingStory.pages[0].text.includes('信号连接成功'), true)
  assert.equal(zh.openingStory.pages[0].text.includes('远道而来的朋友'), true)
  assert.equal(zh.openingStory.pages[2].text.includes('四座生态中心'), true)
  assert.equal(zh.towerRecords.forest.objectiveLabel, '前往森林意识塔')
  assert.equal(zh.towerRecords.forest.activationLabel, '按 E 激活森林意识塔')
  assert.equal(zh.towerRecords.badlands.pages.some((page) => page.text?.includes('露天矿坑')), true)
  assert.equal(zh.finalReveal.pages.some((page) => page.type === 'decision'), true)
  assert.equal(zh.finalReveal.pages.some((page) => page.type === 'outcome_yes'), true)
  assert.equal(zh.finalReveal.pages.some((page) => page.type === 'outcome_no'), true)
  assert.equal(zh.finalReveal.pages.find((page) => page.type === 'decision').text.includes('请做出你的决定'), true)
})
