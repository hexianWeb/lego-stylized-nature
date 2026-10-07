import test from 'node:test'
import assert from 'node:assert/strict'
import Renderer from '../src/renderer/Renderer.js'
import { worldConfig } from '../src/world/WorldConfig.js'

test('disabled postprocessing renders the scene directly without a pipeline', () => {
  const scene = { name: 'scene' }
  const camera = { name: 'camera' }
  const calls = []
  const renderer = Object.create(Renderer.prototype)
  renderer.postProcessingEnabled = worldConfig.postProcessing.enabled !== false
  renderer.instance = { render: (...args) => calls.push(args) }
  renderer.renderPipeline = null
  renderer.tiltShiftEffect = null

  assert.equal(renderer.postProcessingEnabled, false)
  renderer.attachPipeline(scene, camera)
  renderer.render()

  assert.equal(renderer.renderPipeline, null)
  assert.deepEqual(calls, [[scene, camera]])
})

test('enabled postprocessing renders through the pipeline', () => {
  const calls = []
  const renderer = Object.create(Renderer.prototype)
  renderer.postProcessingEnabled = true
  renderer.instance = { render: () => calls.push('scene') }
  renderer.renderPipeline = { render: () => calls.push('pipeline') }

  renderer.render()

  assert.deepEqual(calls, ['pipeline'])
})
