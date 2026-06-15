import test from 'node:test'
import assert from 'node:assert/strict'
import volcano from '../src/world/biomes/definitions/volcano.js'

test('volcano biome does not use forest or water prefabs', () => {
  const forbidden = new Set(['landGrass', 'landMushroom', 'phragmites', 'waterBubble'])
  const prefabIds = volcano.prefabs.map((rule) => rule.id)

  assert.deepEqual(prefabIds.filter((id) => forbidden.has(id)), [])
})

test('volcano biome exposes lava tuning parameters', () => {
  assert.equal(typeof volcano.lava.poolDensity, 'number')
  assert.equal(typeof volcano.lava.crackDensity, 'number')
  assert.equal(typeof volcano.lava.minVolcanoWeight, 'number')
  assert.equal(typeof volcano.lava.pulseSpeed, 'number')
  assert.equal(typeof volcano.lava.glowStrength, 'number')
})
