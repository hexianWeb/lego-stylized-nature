import test from 'node:test'
import assert from 'node:assert/strict'
import { WATER_BUCKETS, classifyWaterDepth } from '../src/world/bricks/waterDepth.js'

test('classifies water depth using configured inclusive thresholds', () => {
  const config = { shallowMaxDepth: 1, transitionMaxDepth: 3 }

  assert.deepEqual(WATER_BUCKETS, ['shallow', 'transition', 'deep'])
  assert.equal(classifyWaterDepth(0, config), 'shallow')
  assert.equal(classifyWaterDepth(1, config), 'shallow')
  assert.equal(classifyWaterDepth(2, config), 'transition')
  assert.equal(classifyWaterDepth(3, config), 'transition')
  assert.equal(classifyWaterDepth(4, config), 'deep')
})

test('clamps transition depth to the shallow threshold', () => {
  const config = { shallowMaxDepth: 3, transitionMaxDepth: 1 }

  assert.equal(classifyWaterDepth(3, config), 'shallow')
  assert.equal(classifyWaterDepth(3.1, config), 'deep')
})

test('uses default water depth thresholds', () => {
  assert.equal(classifyWaterDepth(1), 'shallow')
  assert.equal(classifyWaterDepth(2), 'transition')
  assert.equal(classifyWaterDepth(4), 'deep')
})
