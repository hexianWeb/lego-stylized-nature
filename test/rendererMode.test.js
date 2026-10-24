import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import Renderer from '../src/renderer/Renderer.js'

test('disabled postprocessing renders the scene directly without a pipeline', () => {
  const scene = { name: 'scene' }
  const camera = { name: 'camera' }
  const calls = []
  const renderer = Object.create(Renderer.prototype)
  renderer.postProcessingEnabled = false
  renderer.instance = { render: (...args) => calls.push(args) }
  renderer.renderPipeline = null

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

test('startup drains prefab work discovered in successive main and shadow renders', async () => {
  const renderer = Object.create(Renderer.prototype)
  const metrics = { pending: 1 }
  const calls = []
  renderer.prefabPreparation = {
    metrics,
    async whenIdle() { calls.push('idle'); metrics.pending = 0 }
  }
  let renders = 0
  renderer.render = () => {
    calls.push('render')
    if (++renders === 1) metrics.pending = 1
  }
  await renderer.prepareVisiblePrefabs()
  assert.deepEqual(calls, ['idle', 'render', 'idle', 'render'])
})

test('renderer disposal cancels preparation before backend resources are released', () => {
  const renderer = Object.create(Renderer.prototype)
  const calls = []
  renderer.initialized = true
  renderer.prefabPreparation = { dispose: () => calls.push('cancel') }
  renderer.disposePipeline = () => calls.push('pipeline')
  renderer.instance = { dispose: () => calls.push('backend') }
  renderer.dispose()
  renderer.dispose()
  assert.deepEqual(calls, ['cancel', 'pipeline', 'backend'])
})

test('reattaching and disposing the pipeline releases the scene pass without SMAA', () => {
  const previousImage = globalThis.Image
  globalThis.Image = class Image {}
  const renderer = Object.create(Renderer.prototype)
  renderer.postProcessingEnabled = true
  renderer.instance = { toneMapping: THREE.ACESFilmicToneMapping }
  try {
    renderer.attachPipeline(new THREE.Scene(), new THREE.PerspectiveCamera())
    const output = renderer.renderPipeline.outputNode
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
    assert.equal(
      renderer.pipelineNodes.some(node => node._renderTargetEdges),
      false,
    )
    let vignette = null
    output.traverse((node) => {
      if (node.constructor.type === 'JoinNode' && node.nodes?.[1]?.components === 'w')
        vignette = node
    })
    assert.equal(vignette.constructor.type, 'JoinNode')
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
    assert.equal(disposals.length, 1)
    assert.equal(new Set(disposals).size, 1)
    assert.deepEqual(renderer.pipelineNodes, [])
  } finally {
    if (previousImage === undefined) delete globalThis.Image
    else globalThis.Image = previousImage
  }
})
