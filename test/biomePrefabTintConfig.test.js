import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { biomePrefabs } from '../src/assets/manifests/biomePrefabs.js'
import { resolvePrefabMaterial } from '../src/world/prefabs/prefabMaterialTint.js'

const expectedTintedPrefabs = new Set(['commonRock', 'landGrass'])

test('commonRock defines biome tint config for all current land biomes', () => {
  assert.deepEqual(Object.keys(biomePrefabs.commonRock.biomeTints).sort(), [
    'autumnForest',
    'desert',
    'forest',
    'volcano'
  ])
})

test('landGrass defines biome tint config for grass-hosting land biomes', () => {
  assert.deepEqual(Object.keys(biomePrefabs.landGrass.biomeTints).sort(), [
    'autumnForest',
    'desert',
    'forest'
  ])
})

test('biome tint entries use color and normalized strength', () => {
  for (const prefabId of expectedTintedPrefabs) {
    for (const tint of Object.values(biomePrefabs[prefabId].biomeTints)) {
      assert.equal(typeof tint.color, 'string')
      assert.equal(typeof tint.strength, 'number')
      assert.equal(tint.strength >= 0, true)
      assert.equal(tint.strength <= 1, true)
    }
  }
})

test('landGrass desert tint shifts green grass to a warm color', () => {
  const source = new THREE.MeshBasicMaterial({ color: '#41a451' })

  const result = resolvePrefabMaterial(source, biomePrefabs.landGrass.biomeTints.desert)

  assert.equal(result.color.r > result.color.g, true)
})

test('unrelated prefabs do not opt into biome tinting', () => {
  const tintedPrefabIds = Object.entries(biomePrefabs)
    .filter(([, entry]) => entry.biomeTints)
    .map(([prefabId]) => prefabId)
    .sort()

  assert.deepEqual(tintedPrefabIds, [...expectedTintedPrefabs].sort())
})
