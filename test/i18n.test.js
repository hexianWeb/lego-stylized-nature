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
  assert.equal(getLocalizedStoryContent('en').openingStory.title, 'Incoming Tower Signal')

  setLocale('zh')
  const zh = getLocalizedStoryContent('zh')
  assert.equal(zh.openingStory.title, '收到神秘信号')
  assert.equal(zh.openingStory.pages[0].speaker, '神秘信号')
  assert.equal(zh.openingStory.pages.length, 3)
  assert.equal(zh.openingStory.pages[0].text.includes('信号连接成功'), true)
  assert.equal(zh.openingStory.pages[0].text.includes('外星来客'), true)
  assert.equal(zh.openingStory.pages[2].text.includes('四座生态中心'), true)
  assert.equal(zh.towerRecords.forest.objectiveLabel, '前往森林归生塔')
  assert.equal(zh.towerRecords.forest.activationLabel, '按 E 激活森林归生塔')
  assert.equal(zh.towerRecords.badlands.pages.some((page) => page.text?.includes('采矿废料')), true)
  assert.equal(zh.finalReveal.pages.at(-1).text.includes('需要授权'), true)
})
