import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { texture } from 'three/tsl'
import { worldConfig } from '../src/world/WorldConfig.js'
import {
  SPEED_LINES_DEFAULTS,
  SPEED_LINES_RANGES,
  normalizeSpeedLinesConfig
} from '../src/renderer/postprocessing/speedLinesConfig.js'
import { createSpeedLinesEffect } from '../src/renderer/postprocessing/createSpeedLinesEffect.js'
import Renderer from '../src/renderer/Renderer.js'

test('defines speed lines defaults and debug ranges', () => {
  assert.deepEqual(SPEED_LINES_DEFAULTS, {
    enabled: true,
    color: { r: 255, g: 255, b: 255 },
    density: 66,
    speed: 6,
    thickness: 0.24,
    minRadius: 0.4,
    maxRadius: 1.3,
    randomness: 0.5,
    opacity: 0
  })

  assert.deepEqual(SPEED_LINES_RANGES.density, { min: 8, max: 160, step: 1 })
  assert.deepEqual(SPEED_LINES_RANGES.opacity, { min: 0, max: 1, step: 0.01 })

  assert.deepEqual(
    worldConfig.postProcessing.speedLines,
    {
      ...SPEED_LINES_DEFAULTS,
      color: { ...SPEED_LINES_DEFAULTS.color }
    }
  )
  assert.notEqual(
    worldConfig.postProcessing.speedLines,
    SPEED_LINES_DEFAULTS
  )
})

test('normalizes speed lines config and clamps opacity', () => {
  assert.deepEqual(
    normalizeSpeedLinesConfig({
      opacity: 1.5,
      color: { r: 128 }
    }),
    {
      ...SPEED_LINES_DEFAULTS,
      opacity: 1,
      color: { r: 128, g: 255, b: 255 }
    }
  )
})

test('creates a speed lines output node with live uniforms', () => {
  const sceneColor = texture(new THREE.Texture())
  const effect = createSpeedLinesEffect(sceneColor, {
    enabled: true,
    density: 80,
    speed: 8,
    thickness: 0.3,
    minRadius: 0.35,
    maxRadius: 1.4,
    randomness: 0.6,
    opacity: 0.5,
    color: { r: 200, g: 220, b: 255 }
  })

  assert.notEqual(effect.outputNode, sceneColor)
  assert.equal(effect.uniforms.uDensity.value, 80)
  assert.equal(effect.uniforms.uSpeed.value, 8)
  assert.equal(effect.uniforms.uOpacity.value, 0.5)
  assert.equal(effect.uniforms.uEnabled.value, 1)
  assert.equal(effect.uniforms.uColor.value.r, 200 / 255)
})

test('updates speed lines uniforms without replacing output nodes', () => {
  const effect = createSpeedLinesEffect(
    texture(new THREE.Texture()),
    SPEED_LINES_DEFAULTS
  )
  const outputNode = effect.outputNode

  effect.setOpacity(0.75)
  effect.setEnabled(false)
  effect.sync({
    ...SPEED_LINES_DEFAULTS,
    density: 48,
    speed: 4,
    thickness: 0.18,
    randomness: 0.45,
    opacity: 0.75,
    enabled: false
  })

  assert.equal(effect.outputNode, outputNode)
  assert.equal(effect.uniforms.uOpacity.value, 0.75)
  assert.equal(effect.uniforms.uEnabled.value, 0)
  assert.equal(effect.uniforms.uDensity.value, 48)
  assert.equal(effect.uniforms.uSpeed.value, 4)
})

function createRendererHarness() {
  const renderer = Object.create(Renderer.prototype)
  renderer.tiltShiftConfig = { enabled: true }
  renderer.speedLinesConfig = normalizeSpeedLinesConfig(SPEED_LINES_DEFAULTS)
  renderer.renderPipeline = { outputNode: null }
  renderer.outputNodes = {
    tiltShiftEnabled: { name: 'enabled' },
    tiltShiftDisabled: { name: 'disabled' }
  }
  renderer.tiltShiftEffect = null
  renderer.speedLinesEffect = {
    setEnabled(value) {
      this.enabled = value
    },
    setOpacity(value) {
      this.opacity = value
    },
    sync(config) {
      this.synced = { ...config }
    },
    uniforms: { uTime: { value: 0 } },
    enabled: true,
    opacity: 0
  }
  return renderer
}

test('updates speed line opacity through renderer API', () => {
  const renderer = createRendererHarness()

  renderer.setSpeedLineOpacity(0.62)

  assert.equal(renderer.speedLinesConfig.opacity, 0.62)
  assert.equal(renderer.speedLinesEffect.opacity, 0.62)
})

test('clamps speed line opacity in renderer API', () => {
  const renderer = createRendererHarness()

  renderer.setSpeedLineOpacity(2)

  assert.equal(renderer.speedLinesConfig.opacity, 1)
  assert.equal(renderer.speedLinesEffect.opacity, 1)
})

test('syncs speed lines config through renderer API', () => {
  const renderer = createRendererHarness()

  renderer.syncSpeedLines({
    density: 96,
    speed: 9,
    color: { r: 230, g: 240, b: 255 }
  })

  assert.equal(renderer.speedLinesConfig.density, 96)
  assert.equal(renderer.speedLinesConfig.speed, 9)
  assert.equal(renderer.speedLinesConfig.color.r, 230)
  assert.equal(renderer.speedLinesEffect.synced.density, 96)
})

test('updates speed lines time uniform from renderer', () => {
  const renderer = createRendererHarness()

  renderer.updatePostProcessingTime(12.5)

  assert.equal(renderer.speedLinesEffect.uniforms.uTime.value, 12.5)
})

test('clears speed lines effect on renderer dispose', () => {
  const renderer = createRendererHarness()
  renderer.renderPipeline = {
    dispose() {}
  }

  renderer.dispose()

  assert.equal(renderer.speedLinesEffect, null)
})
