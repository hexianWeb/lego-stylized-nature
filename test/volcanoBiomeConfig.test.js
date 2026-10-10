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
  assert.equal(typeof volcano.lava.poolCellScale, 'number')
  assert.equal(typeof volcano.lava.poolEdgeWarp, 'number')
  assert.equal(typeof volcano.lava.minVolcanoWeight, 'number')
  assert.equal(volcano.lava.darkColor, '#C2410C')
  assert.equal(volcano.lava.midColor, '#F15A24')
  assert.equal(volcano.lava.lightColor, '#FFB020')
  assert.equal('flowSpeed' in volcano.lava, false)
  assert.equal('textureScale' in volcano.lava, false)
  assert.equal('pulseSpeed' in volcano.lava, false)
  assert.equal('glowStrength' in volcano.lava, false)
  assert.equal('crackDensity' in volcano.lava, false)
  assert.equal('crackNoiseScale' in volcano.lava, false)
})
