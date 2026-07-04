import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import {
  normalizeInstanceColors,
  pickInstanceColorIndex,
  matchesInstanceColorMesh,
  resolveInstanceColorMaterial,
  disposeInstanceColorMaterial
} from '../src/world/prefabs/prefabInstanceColor.js'

test('normalizes valid colors and excludes invalid entries with one warning', () => {
  const warnings = []

  const result = normalizeInstanceColors({
    meshNameSuffix: '_InstanceColor',
    palette: ['#ff0000', 'bad', '#00ff00']
  }, (message) => warnings.push(message))

  assert.equal(result.meshNameSuffix, '_InstanceColor')
  assert.deepEqual(result.palette.map((color) => color.getHexString()), ['ff0000', '00ff00'])
  assert.equal(warnings.length, 1)
})

test('returns null for a palette with no valid colors and warns once', () => {
  const warnings = []

  const result = normalizeInstanceColors({
    meshNameSuffix: '_InstanceColor',
    palette: []
  }, (message) => warnings.push(message))

  assert.equal(result, null)
  assert.equal(warnings.length, 1)
})

test('selects a stable palette index from coordinates seed and prefab id', () => {
  const first = pickInstanceColorIndex(12, 7, 42, 'landFlower', 4)
  const second = pickInstanceColorIndex(12, 7, 42, 'landFlower', 4)

  assert.equal(first, second)
  assert.equal(first >= 0 && first < 4, true)
  assert.equal(pickInstanceColorIndex(12, 7, 42, 'landFlower', 0), null)
})

test('matches exact and Blender-numbered object names', () => {
  assert.equal(matchesInstanceColorMesh('flower_InstanceColor', '_InstanceColor'), true)
  assert.equal(matchesInstanceColorMesh('flower_InstanceColor.001', '_InstanceColor'), true)
  assert.equal(matchesInstanceColorMesh('flower_InstanceColorExtra', '_InstanceColor'), false)
  assert.equal(matchesInstanceColorMesh('flower_instancecolor', '_InstanceColor'), false)
})

test('clones and whitens source material without mutating it', () => {
  const source = new THREE.MeshBasicMaterial({ color: '#cc2255' })

  const result = resolveInstanceColorMaterial(source)

  assert.notEqual(result, source)
  assert.equal(source.color.getHexString(), 'cc2255')
  assert.equal(result.color.getHexString(), 'ffffff')
  assert.equal(result.userData.isInstanceColorClone, true)
})

test('reuses instance color material clone for the same source material', () => {
  const source = new THREE.MeshBasicMaterial({ color: '#cc2255' })

  const first = resolveInstanceColorMaterial(source)
  const second = resolveInstanceColorMaterial(source)

  assert.equal(second, first)
})

test('preserves material array order', () => {
  const first = new THREE.MeshBasicMaterial({ color: '#ff0000' })
  const second = new THREE.MeshBasicMaterial({ color: '#00ff00' })

  const result = resolveInstanceColorMaterial([first, second])

  assert.equal(Array.isArray(result), true)
  assert.equal(result.length, 2)
  assert.notEqual(result[0], first)
  assert.notEqual(result[1], second)
  assert.equal(result[0].color.getHexString(), 'ffffff')
  assert.equal(result[1].color.getHexString(), 'ffffff')
})

test('disposes owned material clones without disposing shared textures', () => {
  const texture = new THREE.Texture()
  const source = new THREE.MeshBasicMaterial({ color: '#ff0000', map: texture })
  const result = resolveInstanceColorMaterial(source)
  let materialDisposed = false
  let textureDisposed = false
  result.dispose = () => {
    materialDisposed = true
  }
  texture.dispose = () => {
    textureDisposed = true
  }

  disposeInstanceColorMaterial(result)

  assert.equal(materialDisposed, true)
  assert.equal(textureDisposed, false)
})
