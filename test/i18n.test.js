import test from 'node:test'
import assert from 'node:assert/strict'
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
  assert.equal(getLocaleLabel('zh'), '中')
})
