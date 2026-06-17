import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import {
  resolvePrefabMaterial,
  disposeBiomeTintMaterial
} from '../src/world/prefabs/prefabMaterialTint.js'

test('returns source material when tint is null', () => {
  const source = new THREE.MeshBasicMaterial({ color: '#808080' })

  const result = resolvePrefabMaterial(source, null)

  assert.equal(result, source)
})

test('returns source material array when tint is null', () => {
  const source = [new THREE.MeshBasicMaterial({ color: '#808080' })]

  const result = resolvePrefabMaterial(source, null)

  assert.equal(result, source)
})

test('clones and strength-tints material color without mutating source', () => {
  const source = new THREE.MeshBasicMaterial({ color: '#ffffff' })

  const result = resolvePrefabMaterial(source, { color: '#000000', strength: 0.5 })

  assert.notEqual(result, source)
  assert.equal(result.userData.isBiomeTintClone, true)
  assert.equal(source.color.getHexString(), 'ffffff')
  assert.equal(result.color.getHexString(), 'bcbcbc')
  assert.equal(result.version > 0, true)
})

test('clamps tint strength to the 0 to 1 range', () => {
  const source = new THREE.MeshBasicMaterial({ color: '#ffffff' })

  const overStrength = resolvePrefabMaterial(source, { color: '#000000', strength: 2 })
  const underStrength = resolvePrefabMaterial(source, { color: '#000000', strength: -1 })

  assert.equal(overStrength.color.getHexString(), '000000')
  assert.equal(underStrength.color.getHexString(), 'ffffff')
})

test('returns source material and warns when tint color is not usable', () => {
  const source = new THREE.MeshBasicMaterial({ color: '#808080' })
  const originalWarn = console.warn
  const warnings = []
  console.warn = (message) => warnings.push(message)

  try {
    const result = resolvePrefabMaterial(source, { color: null, strength: 0.5 })

    assert.equal(result, source)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /Invalid prefab biome tint color/)
  } finally {
    console.warn = originalWarn
  }
})

test('returns source material and warns when tint color string is invalid', () => {
  const source = new THREE.MeshBasicMaterial({ color: '#808080' })
  const originalWarn = console.warn
  const warnings = []
  console.warn = (message) => warnings.push(message)

  try {
    const result = resolvePrefabMaterial(source, { color: 'not-a-color', strength: 0.5 })

    assert.equal(result, source)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /Invalid prefab biome tint color/)
  } finally {
    console.warn = originalWarn
  }
})

test('returns source material array and warns once when tint color string is invalid', () => {
  const first = new THREE.MeshBasicMaterial({ color: '#808080' })
  const second = new THREE.MeshBasicMaterial({ color: '#404040' })
  const source = [first, second]
  const originalWarn = console.warn
  const warnings = []
  console.warn = (message) => warnings.push(message)

  try {
    const result = resolvePrefabMaterial(source, { color: 'not-a-color', strength: 0.5 })

    assert.equal(result, source)
    assert.equal(result[0], first)
    assert.equal(result[1], second)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /Invalid prefab biome tint color/)
  } finally {
    console.warn = originalWarn
  }
})

test('accepts valid CSS tint color strings', () => {
  const source = new THREE.MeshBasicMaterial({ color: '#ffffff' })

  const result = resolvePrefabMaterial(source, { color: 'rgb(0, 0, 0)', strength: 1 })

  assert.notEqual(result, source)
  assert.equal(result.color.getHexString(), '000000')
})

test('preserves material array order when tinting', () => {
  const first = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  const second = new THREE.MeshBasicMaterial({ color: '#808080' })

  const result = resolvePrefabMaterial([first, second], { color: '#000000', strength: 1 })

  assert.equal(Array.isArray(result), true)
  assert.equal(result.length, 2)
  assert.notEqual(result[0], first)
  assert.notEqual(result[1], second)
  assert.equal(result[0].color.getHexString(), '000000')
  assert.equal(result[1].color.getHexString(), '000000')
})

test('disposes only cloned tinted materials and not shared textures', () => {
  const texture = new THREE.Texture()
  const material = new THREE.MeshBasicMaterial({ map: texture })
  let materialDisposed = false
  let textureDisposed = false
  material.userData.isBiomeTintClone = true
  material.dispose = () => {
    materialDisposed = true
  }
  texture.dispose = () => {
    textureDisposed = true
  }

  disposeBiomeTintMaterial(material)

  assert.equal(materialDisposed, true)
  assert.equal(textureDisposed, false)
})

test('disposes marked entries inside material arrays only', () => {
  const tinted = new THREE.MeshBasicMaterial()
  const source = new THREE.MeshBasicMaterial()
  let tintedDisposed = false
  let sourceDisposed = false
  tinted.userData.isBiomeTintClone = true
  tinted.dispose = () => {
    tintedDisposed = true
  }
  source.dispose = () => {
    sourceDisposed = true
  }

  disposeBiomeTintMaterial([tinted, source])

  assert.equal(tintedDisposed, true)
  assert.equal(sourceDisposed, false)
})
