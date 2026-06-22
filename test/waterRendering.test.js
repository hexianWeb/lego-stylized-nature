import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { createWaterMaterial } from '../src/materials/tsl/waterMaterial.js'
import { WATER_BUCKETS, classifyWaterDepth } from '../src/world/bricks/waterDepth.js'

test('classifies water depth using configured inclusive thresholds', () => {
  const config = { shallowMaxDepth: 1, transitionMaxDepth: 3 }

  assert.deepEqual(WATER_BUCKETS, ['shallow', 'transition', 'deep'])
  assert.equal(classifyWaterDepth(0, config), 'shallow')
  assert.equal(classifyWaterDepth(1, config), 'shallow')
  assert.equal(classifyWaterDepth(2, config), 'transition')
  assert.equal(classifyWaterDepth(3, config), 'transition')
  assert.equal(classifyWaterDepth(4, config), 'deep')
})

test('clamps transition depth to the shallow threshold', () => {
  const config = { shallowMaxDepth: 3, transitionMaxDepth: 1 }

  assert.equal(classifyWaterDepth(3, config), 'shallow')
  assert.equal(classifyWaterDepth(3.1, config), 'deep')
})

test('uses default water depth thresholds', () => {
  assert.equal(classifyWaterDepth(1), 'shallow')
  assert.equal(classifyWaterDepth(2), 'transition')
  assert.equal(classifyWaterDepth(4), 'deep')
})

test('creates animated physical water material with configurable uniforms', () => {
  const config = {
    rippleSpeed: 1.25,
    rippleScale: 9,
    rippleStrength: 0.2,
    detailScale: 24,
    detailStrength: 0.06,
    highlightStrength: 0.4,
    roughness: 0.18,
    metalness: 0.08,
    clearcoat: 0.7,
    clearcoatRoughness: 0.05,
  }

  const material = createWaterMaterial(config, '#42DDEB')

  assert.ok(material instanceof THREE.MeshPhysicalNodeMaterial)
  assert.ok(material.colorNode)
  assert.equal(material.roughness, 0.18)
  assert.equal(material.metalness, 0.08)
  assert.equal(material.clearcoat, 0.7)
  assert.equal(material.clearcoatRoughness, 0.05)
  assert.equal(material.transparent, false)
  assert.equal(material.opacity, 1)
  assert.deepEqual(
    Object.keys(material.userData.uniforms).sort(),
    [
      'uDetailScale',
      'uDetailStrength',
      'uHighlightStrength',
      'uRippleScale',
      'uRippleSpeed',
      'uRippleStrength',
    ].sort(),
  )
  assert.equal(material.userData.uniforms.uRippleSpeed.value, 1.25)
  assert.equal(material.userData.uniforms.uRippleScale.value, 9)
  assert.equal(material.userData.uniforms.uRippleStrength.value, 0.2)
  assert.equal(material.userData.uniforms.uDetailScale.value, 24)
  assert.equal(material.userData.uniforms.uDetailStrength.value, 0.06)
  assert.equal(material.userData.uniforms.uHighlightStrength.value, 0.4)
})

test('preserves explicit zero values in water material configuration', () => {
  const material = createWaterMaterial({
    rippleSpeed: 0,
    rippleStrength: 0,
    detailStrength: 0,
    highlightStrength: 0,
    roughness: 0,
    clearcoat: 0,
    clearcoatRoughness: 0,
  })

  assert.equal(material.roughness, 0)
  assert.equal(material.clearcoat, 0)
  assert.equal(material.clearcoatRoughness, 0)
  assert.equal(material.userData.uniforms.uRippleSpeed.value, 0)
  assert.equal(material.userData.uniforms.uRippleStrength.value, 0)
  assert.equal(material.userData.uniforms.uDetailStrength.value, 0)
  assert.equal(material.userData.uniforms.uHighlightStrength.value, 0)
})
