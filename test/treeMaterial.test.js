import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import forest from '../src/world/biomes/definitions/forest.js'
import autumnForest from '../src/world/biomes/definitions/autumnForest.js'
import { random01 } from '../src/utils/random.js'
import { resolveTreeInstanceColor } from '../src/world/prefabs/treeMaterial.js'

function createPart(name) {
  const part = new THREE.Object3D()
  part.name = name
  return part
}

function legacyColor(baseHex, x, y, z, seed, salt) {
  const color = new THREE.Color(baseHex)
  const hsl = color.getHSL({ h: 0, s: 0, l: 0 })
  const hue = (random01(x, y, seed + z + salt) * 2 - 1) * 0.08
  const saturation = (random01(z, x, seed + y + salt + 17) * 2 - 1) * 0.04
  const lightness = (random01(y, z, seed + x + salt + 31) * 2 - 1) * 0.04
  return color.setHSL(
    (hsl.h + hue + 1) % 1,
    THREE.MathUtils.clamp(hsl.s + saturation, 0, 1),
    THREE.MathUtils.clamp(hsl.l + lightness, 0, 1),
  )
}

test('default tree settings preserve the previous seeded forest and autumn colors', () => {
  const coordinates = [[0, 4, 0], [71, 12, 72], [-73, 23, -1], [128, 43, 384]]
  for (const [biome, leafColor, trunkColor] of [
    [forest, '#2e8b3c', '#6e4a28'],
    [autumnForest, '#df6827', '#7a4b24'],
  ]) {
    for (const [name, baseHex, salt] of [
      ['tree_leaf', leafColor, 0],
      ['tree_root', trunkColor, 41],
    ]) {
      const mesh = createPart(name)
      for (const [x, y, z] of coordinates) {
        assert.deepEqual(
          resolveTreeInstanceColor(mesh, biome, x, y, z, 20260608).toArray(),
          legacyColor(baseHex, x, y, z, 20260608, salt).toArray(),
        )
      }
    }
  }
})

test('tree colors are independent of terrain colors and palettes', () => {
  const biome = {
    trees: { leafColor: '#557722', trunkColor: '#664422' },
    terrain: { colors: { surface: '#ff0000', subsurface: '#0000ff' } },
  }
  for (const [name, baseHex, salt] of [['leaf', '#557722', 0], ['root', '#664422', 41]]) {
    const mesh = createPart(name)
    const before = resolveTreeInstanceColor(mesh, biome, 4, 12, 8, 123).toArray()
    biome.terrain.colors.surface = '#ffffff'
    biome.terrain.colors.subsurface = '#ffffff'
    biome.terrain.palettes = { surface: [{ at: 0, color: '#ff00ff' }] }
    assert.deepEqual(before, legacyColor(baseHex, 4, 12, 8, 123, salt).toArray())
    assert.deepEqual(resolveTreeInstanceColor(mesh, biome, 4, 12, 8, 123).toArray(), before)
  }
})

test('cached base HSL refreshes after editing or replacing tree settings', () => {
  const biome = { trees: { leafColor: '#224466' } }
  const mesh = createPart('leaf')
  resolveTreeInstanceColor(mesh, biome, 3, 4, 5, 17)
  biome.trees.leafColor = '#aa6622'
  assert.deepEqual(
    resolveTreeInstanceColor(mesh, biome, 3, 4, 5, 17).toArray(),
    legacyColor('#aa6622', 3, 4, 5, 17, 0).toArray(),
  )
  biome.trees = { leafColor: '#668833' }
  assert.deepEqual(
    resolveTreeInstanceColor(mesh, biome, 3, 4, 5, 17).toArray(),
    legacyColor('#668833', 3, 4, 5, 17, 0).toArray(),
  )
})

test('tree color sampling supports a reusable output without changing deterministic results', () => {
  const mesh = createPart('leaf')
  const target = new THREE.Color()
  const first = resolveTreeInstanceColor(mesh, forest, 0, 4, 0, 1)
  const snapshot = first.toArray()
  assert.equal(resolveTreeInstanceColor(mesh, forest, 0, 4, 0, 1, target), target)
  assert.deepEqual(target.toArray(), snapshot)
  resolveTreeInstanceColor(mesh, forest, 72, 12, 8, 1, target)
  assert.deepEqual(first.toArray(), snapshot)
  assert.notEqual(resolveTreeInstanceColor(mesh, forest, 0, 4, 0, 1), first)
})

test('tree part recognition scans source ancestors only once', () => {
  let nameReads = 0
  const parent = new THREE.Object3D()
  Object.defineProperty(parent, 'name', {
    get() {
      nameReads++
      return 'Tree_LEAF'
    },
  })
  const mesh = createPart('mesh')
  parent.add(mesh)
  const target = new THREE.Color()
  for (let x = 0; x < 20; x++) {
    resolveTreeInstanceColor(mesh, forest, x, 4, 0, 1, target)
  }
  assert.equal(nameReads, 1)
})

test('missing tree colors use independent defaults rather than terrain colors', () => {
  const biome = { terrain: { colors: { surface: '#ff0000', subsurface: '#ff00ff' } } }
  for (const [name, baseHex, salt] of [['leaf', '#2e8b3c', 0], ['root', '#6e4a28', 41]]) {
    const mesh = createPart(name)
    assert.deepEqual(
      resolveTreeInstanceColor(mesh, biome, 2, 4, -7, 12).toArray(),
      legacyColor(baseHex, 2, 4, -7, 12, salt).toArray(),
    )
  }
})

test('unrecognized parts and missing biomes do not overwrite the output color', () => {
  const target = new THREE.Color('#123456')
  assert.equal(resolveTreeInstanceColor(createPart('fruit'), forest, 0, 4, 0, 1, target), null)
  assert.equal(resolveTreeInstanceColor(createPart('leaf'), null, 0, 4, 0, 1, target), null)
  assert.equal(target.getHexString(), '123456')
})
