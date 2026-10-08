import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
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

test('reattaching and disposing the pipeline releases ScenePass, blur and both SMAA targets', () => {
  const previousImage = globalThis.Image
  globalThis.Image = class Image {}
  const renderer = Object.create(Renderer.prototype)
  renderer.postProcessingEnabled = true
  renderer.tiltShiftConfig = { ...worldConfig.postProcessing.tiltShift }
  renderer.speedLinesConfig = structuredClone(worldConfig.postProcessing.speedLines)
  renderer.instance = { toneMapping: THREE.ACESFilmicToneMapping }
  try {
    renderer.attachPipeline(new THREE.Scene(), new THREE.PerspectiveCamera())
    const output = renderer.outputNodes.tiltShiftEnabled
    assert.equal(output.isRenderOutputNode, true)
    assert.equal(output.outputColorSpace, THREE.SRGBColorSpace)
    assert.equal(output.getToneMapping(), THREE.NoToneMapping)
    const conversions = []
    output.traverse((node) => {
      if (node.isRenderOutputNode) conversions.push(node)
    })
    assert.equal(new Set(conversions).size, 2)
    assert.ok(conversions.some((node) => node.outputColorSpace === THREE.LinearSRGBColorSpace
      && node.getToneMapping() === THREE.ACESFilmicToneMapping))
    const aa = renderer.pipelineNodes.find(node => node._renderTargetEdges)
    let vignette = aa.textureNode.node
    while (vignette.isVarNode) vignette = vignette.node
    assert.equal(vignette.constructor.type, 'JoinNode')
    assert.equal(vignette.nodes[1].components, 'w')
    assert.equal(vignette.nodes[1].node.outputColorSpace, THREE.LinearSRGBColorSpace)

    const disposals = []
    const nodes = [...renderer.pipelineNodes]
    for (const node of nodes) {
      const dispose = node.dispose.bind(node)
      node.dispose = () => { disposals.push(node); dispose() }
    }
    renderer.postProcessingEnabled = false
    renderer.attachPipeline(new THREE.Scene(), new THREE.PerspectiveCamera())
    renderer.dispose()
    renderer.dispose()
    assert.equal(disposals.length, 6)
    assert.equal(new Set(disposals).size, 6)
    assert.deepEqual(renderer.pipelineNodes, [])
  } finally {
    if (previousImage === undefined) delete globalThis.Image
    else globalThis.Image = previousImage
  }
})
