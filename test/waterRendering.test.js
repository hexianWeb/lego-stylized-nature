import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { createWaterMaterial } from '../src/materials/tsl/waterMaterial.js'

test('creates static noise-mixed water material with a plain-color fallback', () => {
  const noiseTexture = new THREE.Texture()
  const config = {
    darkColor: '#0757A6',
    midColor: '#168FD2',
    lightColor: '#42DDEB',
    textureScale: 0.45,
    roughness: 0.3,
    clearcoat: 0.45,
    clearcoatRoughness: 0.2
  }

  const texturedMaterial = createWaterMaterial(config, noiseTexture)
  const fallbackMaterial = createWaterMaterial(config)

  assert.ok(texturedMaterial instanceof THREE.MeshPhysicalNodeMaterial)
  assert.equal(noiseTexture.wrapS, THREE.RepeatWrapping)
  assert.equal(noiseTexture.wrapT, THREE.RepeatWrapping)
  assert.equal(noiseTexture.colorSpace, THREE.NoColorSpace)
  assert.ok(noiseTexture.version > 0)
  assert.ok(texturedMaterial.colorNode)
  assert.equal(texturedMaterial.userData.uniforms.uTextureScale.value, 0.45)
  assert.equal(texturedMaterial.userData.waterNoiseTexture, noiseTexture)
  assert.ok(fallbackMaterial.colorNode)
  assert.deepEqual(fallbackMaterial.userData.uniforms, {})
  assert.equal(texturedMaterial.transparent, false)
  assert.equal(texturedMaterial.opacity, 1)
  assert.equal(texturedMaterial.metalness, 0)
})
