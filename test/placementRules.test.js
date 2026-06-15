import test from 'node:test'
import assert from 'node:assert/strict'
import { canPlacePrefab } from '../src/world/prefabs/placementRules.js'

test('rejects ordinary prefab placement on lava cells', () => {
  const result = canPlacePrefab(
    {},
    { placement: { surface: 'land' } },
    { biomeId: 'volcano' },
    { height: 8, slope: 1, isWater: false, isShore: false, isLava: true }
  )

  assert.equal(result, false)
})
