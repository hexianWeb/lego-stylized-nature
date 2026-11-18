import test from 'node:test'
import assert from 'node:assert/strict'
import { canPlacePrefab, createVariantEntries, pickVariantIndex } from '../src/world/prefabs/placementRules.js'
import { pickWeighted, random01 } from '../src/utils/random.js'

test('weighted selection skips zero-weight entries at the random interval endpoints', () => {
  const entries = [
    { value: 'disabled-first', weight: 0 },
    { value: 'enabled', weight: 1 },
    { value: 'disabled-last', weight: 0 },
  ]
  for (const randomValue of [0, 0.5, 1]) {
    assert.equal(pickWeighted(entries, randomValue), 'enabled')
  }
})

test('rejects ordinary prefab placement on lava cells', () => {
  const result = canPlacePrefab(
    {},
    { placement: { surface: 'land' } },
    { biomeId: 'volcano' },
    { height: 8, slope: 1, isWater: false, isShore: false, isLava: true }
  )

  assert.equal(result, false)
})

test('prepared variant weights preserve the previous coordinate-based model selection', () => {
  const entry = { variants: [{ weight: 1 }, { weight: 2 }, { weight: 1 }] }
  const entries = createVariantEntries(entry)
  const legacyEntries = entry.variants.map((variant, index) => ({ value: index, weight: variant.weight }))
  for (let x = -80; x <= 80; x++) {
    const z = x * 3
    const expected = pickWeighted(legacyEntries, random01(x, z, 20260608 + 131))
    assert.equal(pickVariantIndex(entry, x, z, 20260608, entries), expected)
    assert.equal(pickVariantIndex(entry, x, z, 20260608), expected)
  }
})

test('tree source weight overrides retain manifest variant indices and omit unselected sources', () => {
  const entry = {
    variants: [
      { source: 'treeModel', weight: 1 },
      { source: 'fruitTreeModel', weight: 1 },
      { source: 'cTreeModel', weight: 1 },
    ],
  }
  assert.deepEqual(createVariantEntries(entry, { fruitTreeModel: 4, cTreeModel: 1 }), [
    { value: 1, weight: 4 },
    { value: 2, weight: 1 },
  ])
  const entries = createVariantEntries(entry, { cTreeModel: 1 })
  for (let x = 0; x < 20; x++) {
    assert.equal(pickVariantIndex(entry, x, 0, 1, entries), 2)
  }
})

test('variant entries ignore nonpositive and invalid weights', () => {
  const entry = { variants: [{ weight: 0 }, { weight: -1 }, { weight: NaN }, { weight: Infinity }] }
  assert.deepEqual(createVariantEntries(entry), [])
  assert.equal(pickVariantIndex(entry, 0, 0, 1), undefined)
})

test('variants without explicit weights default to equal weights', () => {
  assert.deepEqual(createVariantEntries({ variants: [{ source: 'first' }, { source: 'second' }] }), [
    { value: 0, weight: 1 },
    { value: 1, weight: 1 },
  ])
})
