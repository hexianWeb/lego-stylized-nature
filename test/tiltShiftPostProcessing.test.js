import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { texture } from 'three/tsl'
import { worldConfig } from '../src/world/WorldConfig.js'
import {
  TILT_SHIFT_DEFAULTS,
  TILT_SHIFT_RANGES,
  evaluateTiltShiftMask
} from '../src/renderer/postprocessing/tiltShiftConfig.js'
import { createTiltShiftEffect } from '../src/renderer/postprocessing/createTiltShiftEffect.js'
import Renderer from '../src/renderer/Renderer.js'
import { createPostProcessingPanel } from '../src/debug/panels/PostProcessingPanel.js'

test('defines the approved tilt-shift defaults and debug ranges', () => {
  assert.deepEqual(TILT_SHIFT_DEFAULTS, {
    enabled: true,
    focusCenter: 0.5,
    focusWidth: 0.22,
    falloff: 0.28,
    blurStrength: 2.5
  })

  assert.deepEqual(TILT_SHIFT_RANGES, {
    focusCenter: { min: 0, max: 1, step: 0.01 },
    focusWidth: { min: 0.02, max: 1, step: 0.01 },
    falloff: { min: 0.01, max: 0.5, step: 0.01 },
    blurStrength: { min: 0, max: 5, step: 0.05 }
  })

  assert.deepEqual(
    worldConfig.postProcessing.tiltShift,
    TILT_SHIFT_DEFAULTS
  )
  assert.notEqual(worldConfig.postProcessing.tiltShift, TILT_SHIFT_DEFAULTS)
})

test('keeps the focus center fully sharp', () => {
  assert.equal(evaluateTiltShiftMask(0.5), 0)
})

test('reaches full blur outside the clear band and falloff', () => {
  const fullBlurY =
    TILT_SHIFT_DEFAULTS.focusCenter +
    TILT_SHIFT_DEFAULTS.focusWidth * 0.5 +
    TILT_SHIFT_DEFAULTS.falloff

  assert.equal(evaluateTiltShiftMask(fullBlurY), 1)
  assert.equal(evaluateTiltShiftMask(1), 1)
})

test('uses a symmetric smooth transition above and below the focus center', () => {
  const upper = evaluateTiltShiftMask(0.25)
  const lower = evaluateTiltShiftMask(0.75)

  assert.equal(upper, lower)
  assert.equal(upper, 0.5)
})

test('creates a quarter-resolution blur with live uniforms', () => {
  const sourceTexture = new THREE.Texture()
  const sceneColor = texture(sourceTexture)
  const effect = createTiltShiftEffect(sceneColor, {
    enabled: true,
    focusCenter: 0.4,
    focusWidth: 0.3,
    falloff: 0.2,
    blurStrength: 3
  })

  assert.equal(effect.disabledOutput, sceneColor)
  assert.notEqual(effect.enabledOutput, sceneColor)
  assert.equal(effect.blurNode.isGaussianBlurNode, true)
  assert.equal(effect.blurNode.resolutionScale, 0.25)
  assert.equal(effect.uniforms.focusCenter.value, 0.4)
  assert.equal(effect.uniforms.focusWidth.value, 0.3)
  assert.equal(effect.uniforms.falloff.value, 0.2)
  assert.equal(effect.uniforms.blurStrength.value, 3)
})

test('updates numeric uniforms without replacing output nodes', () => {
  const effect = createTiltShiftEffect(
    texture(new THREE.Texture()),
    TILT_SHIFT_DEFAULTS
  )
  const enabledOutput = effect.enabledOutput
  const blurNode = effect.blurNode

  effect.sync({
    focusCenter: 0.45,
    focusWidth: 0.18,
    falloff: 0.35,
    blurStrength: 4
  })

  assert.equal(effect.enabledOutput, enabledOutput)
  assert.equal(effect.blurNode, blurNode)
  assert.equal(effect.uniforms.focusCenter.value, 0.45)
  assert.equal(effect.uniforms.focusWidth.value, 0.18)
  assert.equal(effect.uniforms.falloff.value, 0.35)
  assert.equal(effect.uniforms.blurStrength.value, 4)
})

test('disposes the Gaussian blur node exactly once', () => {
  const effect = createTiltShiftEffect(
    texture(new THREE.Texture()),
    TILT_SHIFT_DEFAULTS
  )
  let disposeCount = 0
  effect.blurNode.dispose = () => {
    disposeCount++
  }

  effect.dispose()
  effect.dispose()

  assert.equal(disposeCount, 1)
})

function createRendererHarness() {
  const renderer = Object.create(Renderer.prototype)
  renderer.tiltShiftConfig = { ...TILT_SHIFT_DEFAULTS }
  renderer.renderPipeline = { outputNode: null }
  renderer.outputNodes = {
    tiltShiftEnabled: { name: 'enabled' },
    tiltShiftDisabled: { name: 'disabled' }
  }
  renderer.tiltShiftEffect = null
  return renderer
}

test('switches between prebuilt output chains without rebuilding them', () => {
  const renderer = createRendererHarness()
  const outputNodes = renderer.outputNodes

  renderer.setTiltShiftEnabled(true)
  assert.equal(
    renderer.renderPipeline.outputNode,
    outputNodes.tiltShiftEnabled
  )

  renderer.setTiltShiftEnabled(false)
  assert.equal(
    renderer.renderPipeline.outputNode,
    outputNodes.tiltShiftDisabled
  )
  assert.equal(renderer.outputNodes, outputNodes)
  assert.equal(renderer.tiltShiftConfig.enabled, false)
})

test('synchronizes numeric controls without changing the selected output', () => {
  const renderer = createRendererHarness()
  const selectedOutput = renderer.outputNodes.tiltShiftEnabled
  const calls = []
  renderer.renderPipeline.outputNode = selectedOutput
  renderer.tiltShiftEffect = {
    sync(config) {
      calls.push({ ...config })
    }
  }

  renderer.syncTiltShift({
    focusCenter: 0.35,
    focusWidth: 0.25,
    falloff: 0.4,
    blurStrength: 3.5
  })

  assert.equal(renderer.renderPipeline.outputNode, selectedOutput)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].blurStrength, 3.5)
  assert.equal(renderer.tiltShiftConfig.focusCenter, 0.35)
})

test('disposes renderer-owned post-processing resources', () => {
  const renderer = createRendererHarness()
  let effectDisposed = 0
  let pipelineDisposed = 0
  renderer.tiltShiftEffect = {
    dispose() {
      effectDisposed++
    }
  }
  renderer.renderPipeline = {
    outputNode: renderer.outputNodes.tiltShiftEnabled,
    dispose() {
      pipelineDisposed++
    }
  }

  renderer.dispose()
  renderer.dispose()

  assert.equal(effectDisposed, 1)
  assert.equal(pipelineDisposed, 1)
  assert.equal(renderer.tiltShiftEffect, null)
  assert.equal(renderer.renderPipeline, null)
  assert.equal(renderer.outputNodes, null)
})

function createDebugHarness() {
  const bindings = new Map()
  const folder = {
    addBinding(target, key, options) {
      const binding = {
        target,
        key,
        options,
        handler: null,
        on(event, handler) {
          assert.equal(event, 'change')
          this.handler = handler
          return this
        }
      }
      bindings.set(key, binding)
      return binding
    }
  }

  return {
    bindings,
    debug: {
      addFolder(options) {
        assert.deepEqual(options, {
          title: 'Post Processing',
          expanded: false
        })
        return folder
      }
    }
  }
}

test('binds all tilt-shift controls to the renderer controller', () => {
  const { debug, bindings } = createDebugHarness()
  const config = {
    postProcessing: {
      tiltShift: { ...TILT_SHIFT_DEFAULTS }
    }
  }
  const enabledCalls = []
  const syncCalls = []
  const controller = {
    setTiltShiftEnabled(value) {
      enabledCalls.push(value)
    },
    syncTiltShift(value) {
      syncCalls.push({ ...value })
    }
  }

  createPostProcessingPanel(debug, config, controller)

  assert.deepEqual([...bindings.keys()], [
    'enabled',
    'focusCenter',
    'focusWidth',
    'falloff',
    'blurStrength'
  ])
  assert.deepEqual(
    bindings.get('focusCenter').options,
    { ...TILT_SHIFT_RANGES.focusCenter, label: 'focusCenter' }
  )
  assert.deepEqual(
    bindings.get('blurStrength').options,
    { ...TILT_SHIFT_RANGES.blurStrength, label: 'blurStrength' }
  )

  bindings.get('enabled').handler({ value: false })
  bindings.get('focusCenter').handler({ value: 0.42 })

  assert.equal(config.postProcessing.tiltShift.enabled, false)
  assert.equal(config.postProcessing.tiltShift.focusCenter, 0.42)
  assert.deepEqual(enabledCalls, [false])
  assert.equal(syncCalls.length, 1)
  assert.equal(syncCalls[0].focusCenter, 0.42)
})
