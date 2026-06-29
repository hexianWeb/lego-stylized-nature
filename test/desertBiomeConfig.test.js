import test from 'node:test'
import assert from 'node:assert/strict'
import desert from '../src/world/biomes/definitions/desert.js'
import DesertSurfaceFeatureGenerator from '../src/world/terrain/DesertSurfaceFeatureGenerator.js'

test('desert biome does not use water prefabs', () => {
  const forbidden = new Set(['waterBubble', 'waterDuckweed', 'phragmites'])
  const prefabIds = desert.prefabs.map((rule) => rule.id)

  assert.deepEqual(prefabIds.filter((id) => forbidden.has(id)), [])
})

test('desert surface feature generator dries water in dominant desert cells', () => {
  const generator = new DesertSurfaceFeatureGenerator({
    config: { terrain: { waterLevel: 3 } },
    biomeRegistry: {
      get(id) {
        return id === 'desert' ? desert : {}
      }
    }
  })

  const biomeCells = [[{ weights: { desert: 1 } }]]
  const surfaceCells = [[{ height: 2, isWater: true, isShore: false, isLava: false }]]

  generator.apply(biomeCells, surfaceCells)

  assert.equal(surfaceCells[0][0].isWater, false)
  assert.equal(surfaceCells[0][0].height, 4)
  assert.equal(surfaceCells[0][0].isShore, true)
})

test('desert surface feature generator leaves blended forest water untouched', () => {
  const generator = new DesertSurfaceFeatureGenerator({
    config: { terrain: { waterLevel: 3 } },
    biomeRegistry: {
      get(id) {
        return id === 'desert' ? desert : {}
      }
    }
  })

  const biomeCells = [[{ weights: { desert: 0.4, forest: 0.6 } }]]
  const surfaceCells = [[{ height: 2, isWater: true, isShore: false, isLava: false }]]

  generator.apply(biomeCells, surfaceCells)

  assert.equal(surfaceCells[0][0].isWater, true)
  assert.equal(surfaceCells[0][0].height, 2)
})
