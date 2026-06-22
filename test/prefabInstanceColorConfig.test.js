import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { biomePrefabs } from '../src/assets/manifests/biomePrefabs.js'
import sources from '../src/assets/sources.js'

test('flower and mushroom define instance color palettes', () => {
  assert.deepEqual(biomePrefabs.landMushroom.instanceColors, {
    meshNameSuffix: '_InstanceColor',
    palette: ['#c9110e', '#0158b8', '#ea9202', '#03b1a0']
  })
  assert.deepEqual(biomePrefabs.landFlower.instanceColors, {
    meshNameSuffix: '_InstanceColor',
    palette: ['#f97ba8', '#f695b5', '#ed4e90']
  })
})

test('mushroom uses only its first model', () => {
  assert.deepEqual(biomePrefabs.landMushroom.variants, [
    { source: 'landMushroom1Model', weight: 1 }
  ])
})

test('redundant mushroom sources and files are removed', () => {
  const sourceNames = new Set(sources.map((source) => source.name))

  for (const index of [2, 3, 4]) {
    assert.equal(sourceNames.has(`landMushroom${index}Model`), false)
    assert.equal(existsSync(`public/model/prefab/mushroom_${index}.glb`), false)
  }
})
