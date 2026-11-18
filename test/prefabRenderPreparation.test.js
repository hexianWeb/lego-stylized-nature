import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import test from 'node:test'
import { installObjectResourceCleanup } from '../src/renderer/installObjectResourceCleanup.js'
import { installPrefabRenderPreparation, withPipelineErrorScopes } from '../src/renderer/installPrefabRenderPreparation.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function fixture({ pipelineWait = null, failBuild = false, synchronousFallback = false, adapterOptions = {} } = {}) {
  const nodeData = new WeakMap()
  const pipelines = new WeakMap()
  const renderObjects = new Map()
  const builds = []
  const draws = []
  const bindingObjects = new Set()
  const pipelineStarted = deferred()
  const mainContext = { id: 'main' }
  const shadowContext = { id: 'shadow' }
  const mainTarget = { name: 'main' }
  const shadowTarget = { name: 'shadow' }
  const lights = {}
  let target = mainTarget
  let mrt = null
  const renderer = {
    depth: true,
    stencil: false,
    _currentRenderContext: mainContext,
    _currentSourceMaterial: null,
    getRenderTarget: () => target,
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    getMRT: () => mrt,
    setRenderTarget(value) { target = value },
    setMRT(value) { mrt = value },
    _attributes: { delete() {} },
    _nodes: {
      nodeBuilderCache: new Map(),
      get(renderObject) {
        if (!nodeData.has(renderObject))
          nodeData.set(renderObject, {})
        return nodeData.get(renderObject)
      },
      getForRenderCacheKey: renderObject => renderObject.initialCacheKey,
      _createNodeBuilder(renderObject, material) {
        const result = { renderObject, material, count: null, side: null, context: null, target: null, shadow: null }
        builds.push(result)
        const observe = () => {
          assert.equal(renderObject.object.count, renderObject.object.instanceMatrix.count)
          assert.equal(renderer._currentRenderContext, renderObject.context)
          result.count = renderObject.object.count
          result.side = material.side
          result.context = renderer._currentRenderContext
          result.target = renderer.getRenderTarget()
          result.shadow = material.isShadowPassMaterial === true
        }
        return {
          context: { position: { isNode: true } },
          flowNodes: { vertex: [{ build: observe }], fragment: [{ build: observe }], compute: [] },
          prebuild() {
            observe(); if (failBuild)
              throw new Error('broken shader')
          },
          setBuildStage() {},
          setShaderStage() {},
          flowNodeFromShaderStage: observe,
          flowNode: observe,
          buildCode: observe,
          buildUpdateNodes: observe,
          result,
        }
      },
      _createNodeBuilderState(builder) { return { usedTimes: 0, createBindings: () => [], ...builder.result } },
      updateForRender(renderObject) { assert.ok(this.get(renderObject).nodeBuilderState) },
      delete(renderObject) {
        const state = nodeData.get(renderObject)?.nodeBuilderState
        if (state && --state.usedTimes === 0)
          this.nodeBuilderCache.delete(renderObject.initialCacheKey)
        nodeData.delete(renderObject)
      },
    },
    _objects: {
      createRenderObject(object, material, context) {
        const renderObject = {
          object,
          material,
          context,
          initialCacheKey: `${object.uuid}:${material.uuid}:${context.id}`,
          getNodeBuilderState() {
            const state = nodeData.get(this)?.nodeBuilderState
            assert.ok(state, 'original draw must never synchronously build a missing state')
            return state
          },
          getBindings() {
            return this._bindings || (this._bindings = this.getNodeBuilderState().createBindings())
          },
          onDispose() {
            // Match r185's bindings destructor, including its lazy-state trap.
            renderObject.getBindings()
            renderer._nodes.delete(renderObject)
            bindingObjects.delete(renderObject)
            pipelines.delete(renderObject)
            renderObjects.delete(renderObject.initialCacheKey)
          },
          dispose() { this.onDispose() },
        }
        return renderObject
      },
      get(object, material, scene, camera, lightsNode, context) {
        const key = `${object.uuid}:${material.uuid}:${context.id}`
        if (!renderObjects.has(key))
          renderObjects.set(key, this.createRenderObject(object, material, context))
        return renderObjects.get(key)
      },
    },
    _geometries: { updateForRender(renderObject) { renderObject.getNodeBuilderState() } },
    _bindings: { updateForRender(renderObject) { bindingObjects.add(renderObject) } },
    _pipelines: {
      getForRender(renderObject, promises) {
        pipelines.set(renderObject, false)
        pipelineStarted.resolve()
        if (pipelineWait)
          promises.push(pipelineWait.promise.then(() => pipelines.set(renderObject, true)))
        else pipelines.set(renderObject, true)
        return renderObject
      },
      isReady: renderObject => pipelines.get(renderObject) === true,
    },
    _renderObjectDirect(object, material, scene, camera, lightsNode, group, clippingContext, passId) {
      const renderObject = this._objects.get(object, material, scene, camera, lightsNode, this._currentRenderContext)
      if (synchronousFallback && !this._nodes.get(renderObject).nodeBuilderState) {
        this._nodes.get(renderObject).nodeBuilderState = { usedTimes: 1, createBindings: () => [] }
      }
      renderObject.getNodeBuilderState()
      draws.push(renderObject)
    },
  }
  installObjectResourceCleanup(renderer)
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardNodeMaterial(), 32)
  mesh.userData.streamingPrefab = true
  mesh.count = 3
  const adapter = installPrefabRenderPreparation(renderer, { budgetMs: 0.001, ...adapterOptions })
  const submitObject = (object, material = object.material, context = mainContext, renderTarget = mainTarget) => {
    renderer._currentRenderContext = context
    renderer.setRenderTarget(renderTarget)
    renderer._renderObjectDirect(object, material, {}, {}, lights, null, null, null)
  }
  const submit = (...args) => submitObject(mesh, ...args)
  return { renderer, mesh, adapter, submit, submitObject, builds, draws, mainContext, shadowContext, mainTarget, shadowTarget, nodeData, renderObjects, bindingObjects, pipelineStarted: pipelineStarted.promise }
}

test('real main and shadow identities prepare independently and skip draws until GPU pipelines finish', async () => {
  const wait = deferred()
  const f = fixture({ pipelineWait: wait })
  const shadowMaterial = new THREE.NodeMaterial()
  shadowMaterial.isShadowPassMaterial = true
  shadowMaterial.side = THREE.BackSide
  f.submit()
  f.submit(shadowMaterial, f.shadowContext, f.shadowTarget)
  shadowMaterial.side = THREE.FrontSide
  f.renderer._currentRenderContext = f.mainContext
  f.renderer.setRenderTarget(f.mainTarget)
  assert.equal(f.adapter.metrics.pending, 2)
  assert.equal(f.draws.length, 0)
  await f.pipelineStarted
  assert.equal(f.mesh.count, 3)
  assert.equal(f.renderer.getRenderTarget(), f.mainTarget)
  assert.equal(f.renderer._currentRenderContext, f.mainContext)
  f.submit()
  assert.equal(f.draws.length, 0)
  wait.resolve()
  await f.adapter.whenIdle()
  assert.equal(f.adapter.metrics.prepared, 2)
  assert.equal(f.builds[0].renderObject.object, f.mesh)
  assert.equal(f.builds[0].count, 32)
  assert.equal(f.builds[1].count, 32)
  assert.equal(f.builds[1].side, THREE.BackSide)
  assert.equal(f.builds[1].shadow, true)
  assert.equal(f.builds[1].target, f.shadowTarget)
  assert.equal(shadowMaterial.side, THREE.FrontSide)
  f.submit()
  shadowMaterial.side = THREE.BackSide
  f.submit(shadowMaterial, f.shadowContext, f.shadowTarget)
  assert.equal(f.draws.length, 2)
  assert.notEqual(f.draws[0], f.draws[1])
  assert.equal(f.mesh.count, 3)
  f.adapter.dispose()
})

test('mesh disposal while queued prevents node publication and resolves whenIdle', async () => {
  const f = fixture()
  f.submit()
  const idle = f.adapter.whenIdle()
  f.mesh.dispose()
  await idle
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(f.adapter.metrics.pending, 0)
  assert.equal(f.adapter.metrics.prepared, 0)
  assert.equal(f.renderer._nodes.nodeBuilderCache.size, 0)
  assert.equal(f.renderObjects.size, 0)
  f.adapter.dispose()
})

test('streamed terrain and liquid meshes defer cold main and shadow draws until prepared', async () => {
  const f = fixture()
  delete f.mesh.userData.streamingPrefab
  f.mesh.userData.streamingChunk = true
  const shadowMaterial = new THREE.NodeMaterial()
  shadowMaterial.isShadowPassMaterial = true
  f.submit()
  f.submit(shadowMaterial, f.shadowContext, f.shadowTarget)
  assert.equal(f.draws.length, 0)
  assert.equal(f.builds.length, 0)
  await f.adapter.whenIdle()
  f.submit()
  f.submit(shadowMaterial, f.shadowContext, f.shadowTarget)
  assert.equal(f.adapter.metrics.failed, 0)
  assert.equal(f.draws.length, 2)
  assert.equal(f.mesh.count, 3)
  f.adapter.dispose()
})

test('adapter disposal during pipeline wait frees published states and bindings without late cache publication', async () => {
  const wait = deferred()
  const f = fixture({ pipelineWait: wait })
  f.submit()
  await f.pipelineStarted
  assert.equal(f.renderer._nodes.nodeBuilderCache.size, 1)
  assert.equal(f.bindingObjects.size, 1)
  const idle = f.adapter.whenIdle()
  f.adapter.dispose()
  await idle
  wait.resolve()
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(f.renderer._nodes.nodeBuilderCache.size, 0)
  assert.equal(f.bindingObjects.size, 0)
  assert.equal(f.adapter.metrics.prepared, 0)
  assert.equal(f.adapter.metrics.pending, 0)
})

test('build errors restore renderer context and live count and release partial resources', async () => {
  const f = fixture({ failBuild: true })
  const originalError = console.error
  console.error = () => {}
  try {
    f.submit(f.mesh.material, f.shadowContext, f.shadowTarget)
    f.renderer._currentRenderContext = f.mainContext
    f.renderer.setRenderTarget(f.mainTarget)
    await f.adapter.whenIdle()
    assert.equal(f.adapter.metrics.failed, 1)
    assert.equal(f.adapter.metrics.pending, 0)
    assert.equal(f.mesh.count, 3)
    assert.equal(f.renderer.getRenderTarget(), f.mainTarget)
    assert.equal(f.renderer._currentRenderContext, f.mainContext)
    assert.equal(f.renderer._nodes.nodeBuilderCache.size, 0)
    assert.equal(f.renderObjects.size, 0)
  }
  finally {
    console.error = originalError
    f.adapter.dispose()
  }
})

test('untagged meshes continue through the existing synchronous renderer', () => {
  const f = fixture()
  f.mesh.userData.streamingPrefab = false
  const renderObject = f.renderer._objects.get(f.mesh, f.mesh.material, {}, {}, {}, f.mainContext)
  f.renderer._nodes.get(renderObject).nodeBuilderState = { usedTimes: 1 }
  f.submit()
  assert.equal(f.draws.length, 1)
  assert.equal(f.adapter.metrics.queued, 0)
  f.adapter.dispose()
})

test('disposal from a node update cannot recreate bindings or publish a pipeline afterwards', async () => {
  const f = fixture()
  f.renderer._nodes.updateForRender = () => f.mesh.dispose()
  f.submit()
  await f.adapter.whenIdle()
  assert.equal(f.adapter.metrics.pending, 0)
  assert.equal(f.adapter.metrics.prepared, 0)
  assert.equal(f.renderer._nodes.nodeBuilderCache.size, 0)
  assert.equal(f.bindingObjects.size, 0)
  assert.equal(f.renderObjects.size, 0)
  f.adapter.dispose()
})

test('unsupported renderer internals preserve synchronous drawing', () => {
  const f = fixture()
  f.adapter.dispose()
  const originalDraw = f.renderer._renderObjectDirect
  delete f.renderer._nodes._createNodeBuilder
  const originalWarn = console.warn
  console.warn = () => {}
  try {
    const adapter = installPrefabRenderPreparation(f.renderer)
    const renderObject = f.renderer._objects.get(f.mesh, f.mesh.material, {}, {}, {}, f.mainContext)
    f.renderer._nodes.get(renderObject).nodeBuilderState = { usedTimes: 1 }
    assert.equal(adapter.metrics.enabled, false)
    f.submit()
    assert.equal(f.draws.length, 1)
    adapter.dispose()
    assert.equal(f.renderer._renderObjectDirect, originalDraw)
  }
  finally {
    console.warn = originalWarn
  }
})

test('failed preparation draws through the synchronous fallback on the next submit', async () => {
  const f = fixture({ failBuild: true, synchronousFallback: true })
  const originalError = console.error
  console.error = () => {}
  try {
    f.submit()
    await f.adapter.whenIdle()
    assert.equal(f.adapter.metrics.failed, 1)
    f.submit()
    assert.equal(f.draws.length, 1)
  }
  finally {
    console.error = originalError
    f.adapter.dispose()
  }
})

test('CPU preparation advances up to the GPU concurrency limit without waiting for the first pipeline', async () => {
  const waits = Array.from({ length: 3 }, deferred)
  const starts = Array.from({ length: 3 }, deferred)
  const f = fixture({ adapterOptions: { budgetMs: 100, maxConcurrentPipelines: 2 } })
  let requested = 0
  const ready = new WeakSet()
  f.renderer._pipelines.getForRender = (renderObject, promises) => {
    const index = requested++
    promises.push(waits[index].promise.then(() => ready.add(renderObject)))
    starts[index].resolve()
    return renderObject
  }
  f.renderer._pipelines.isReady = renderObject => ready.has(renderObject)
  const meshes = [f.mesh, f.mesh.clone(), f.mesh.clone()]
  for (const mesh of meshes) f.submitObject(mesh)
  await starts[1].promise
  assert.equal(requested, 2)
  assert.equal(f.adapter.metrics.gpuPending, 2)
  assert.equal(f.adapter.metrics.pending, 3)
  assert.equal(f.builds.length, 2)
  let idle = false
  const idlePromise = f.adapter.whenIdle().then(() => { idle = true })
  assert.equal(idle, false)
  waits[1].resolve()
  await starts[2].promise
  assert.equal(requested, 3)
  assert.equal(f.adapter.metrics.gpuPending, 2)
  assert.equal(f.adapter.metrics.prepared, 1)
  waits[0].resolve()
  waits[2].resolve()
  await idlePromise
  assert.equal(f.adapter.metrics.prepared, 3)
  assert.equal(f.adapter.metrics.gpuPending, 0)
  f.adapter.dispose()
})

test('empty or hidden queued prefab objects are discarded and can prepare when they return', async () => {
  for (const mode of ['empty', 'hidden']) {
    const f = fixture({ adapterOptions: { budgetMs: 100 } })
    const group = new THREE.Group()
    group.add(f.mesh)
    f.submit()
    if (mode === 'empty')
      f.mesh.count = 0
    else group.visible = false
    await f.adapter.whenIdle()
    assert.equal(f.builds.length, 0)
    assert.equal(f.adapter.metrics.cancelled, 1)
    assert.equal(f.renderObjects.size, 0)
    assert.equal(f.renderer._nodes.nodeBuilderCache.size, 0)
    f.mesh.count = 3
    group.visible = true
    f.submit()
    await f.adapter.whenIdle()
    f.submit()
    assert.equal(f.adapter.metrics.prepared, 1)
    assert.equal(f.draws.length, 1)
    f.adapter.dispose()
  }
})

test('background GPU rejection settles idle and does not stall the following CPU work', async () => {
  const wait = deferred()
  const f = fixture({ pipelineWait: wait, adapterOptions: { budgetMs: 100 } })
  const errorLogged = console.error
  console.error = () => {}
  try {
    f.submit()
    await f.pipelineStarted
    wait.reject(new Error('GPU compilation failed'))
    await f.adapter.whenIdle()
    assert.equal(f.adapter.metrics.failed, 1)
    assert.equal(f.adapter.metrics.pending, 0)
    assert.equal(f.adapter.metrics.gpuPending, 0)
    assert.equal(f.renderer._nodes.nodeBuilderCache.size, 0)
    assert.equal(f.bindingObjects.size, 0)
  }
  finally {
    console.error = errorLogged
    f.adapter.dispose()
  }
})

test('disposing while the CPU queue waits for GPU capacity wakes the wait and cancels all pending records', async () => {
  const wait = deferred()
  const f = fixture({ pipelineWait: wait, adapterOptions: { budgetMs: 100, maxConcurrentPipelines: 1 } })
  f.submit()
  f.submitObject(f.mesh.clone())
  await f.pipelineStarted
  const idle = f.adapter.whenIdle()
  f.adapter.dispose()
  await idle
  wait.reject(new Error('GPU compilation ended after disposal'))
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(f.adapter.metrics.pending, 0)
  assert.equal(f.adapter.metrics.gpuPending, 0)
  assert.equal(f.adapter.metrics.prepared, 0)
  assert.equal(f.builds.length, 1)
  assert.equal(f.renderObjects.size, 0)
})

test('shared pipeline cache hits await the existing GPU job and share its failure', async () => {
  const wait = deferred()
  const secondStarted = deferred()
  const sharedPipeline = {}
  const f = fixture({ adapterOptions: { budgetMs: 100, maxConcurrentPipelines: 2 } })
  let requested = 0
  f.renderer._pipelines.getForRender = (renderObject, promises) => {
    if (requested++ === 0)
      promises.push(wait.promise)
    else secondStarted.resolve()
    return sharedPipeline
  }
  f.renderer._pipelines.isReady = () => false
  const originalError = console.error
  console.error = () => {}
  try {
    f.submit()
    f.submitObject(f.mesh.clone())
    await secondStarted.promise
    assert.equal(f.adapter.metrics.gpuPending, 1)
    assert.equal(f.adapter.metrics.pending, 2)
    assert.equal(f.adapter.metrics.prepared, 0)
    assert.equal(f.adapter.metrics.failed, 0)
    wait.reject(new Error('Shared GPU pipeline failed'))
    await f.adapter.whenIdle()
    assert.equal(f.adapter.metrics.failed, 2)
    assert.equal(f.adapter.metrics.pending, 0)
    assert.equal(f.adapter.metrics.gpuPending, 0)
    assert.equal(f.renderer._nodes.nodeBuilderCache.size, 0)
  }
  finally {
    console.error = originalError
    f.adapter.dispose()
  }
})

test('parallel r185 pipeline compiles retain their own validation scopes when completion is out of order', async () => {
  const scopes = []
  const jobs = new Map()
  const device = {
    pushErrorScope() { assert.equal(this, device); scopes.push({ error: null }) },
    popErrorScope() { assert.equal(this, device); return Promise.resolve(scopes.pop().error) },
    createRenderPipelineAsync(descriptor) {
      assert.equal(this, device)
      if (descriptor.invalid)
        scopes.at(-1).error = { message: descriptor.name }
      const job = deferred()
      jobs.set(descriptor.name, job)
      return job.promise
    },
    createShaderModule() { assert.equal(this, device); return 'module' },
  }
  const backend = { isWebGPUBackend: true, device }
  const compile = descriptor => withPipelineErrorScopes(backend, () => {
    const capturedDevice = backend.device
    assert.equal(capturedDevice.createShaderModule(), 'module')
    capturedDevice.pushErrorScope('validation')
    const job = capturedDevice.createRenderPipelineAsync(descriptor)
    // This is r185's original ordering: GPU await, then pop its error scope.
    return job.then(async () => capturedDevice.popErrorScope())
  })
  const invalid = compile({ name: 'invalid-a', invalid: true })
  const valid = compile({ name: 'valid-b' })
  assert.equal(backend.device, device)
  assert.equal(scopes.length, 0, 'A validation scope must never span a GPU wait')
  jobs.get('invalid-a').resolve()
  assert.deepEqual(await invalid, { message: 'invalid-a' })
  jobs.get('valid-b').resolve()
  assert.equal(await valid, null)
  assert.equal(backend.device, device)
})

test('pipeline scope adapter restores the device and closes a synchronously failed GPU request', () => {
  let scopeDepth = 0
  const device = {
    pushErrorScope() { scopeDepth++ },
    popErrorScope() { scopeDepth--; return Promise.resolve(null) },
    createRenderPipelineAsync() { throw new Error('lost device') },
  }
  const backend = { isWebGPUBackend: true, device }
  assert.throws(() => withPipelineErrorScopes(backend, () => {
    backend.device.pushErrorScope('validation')
    backend.device.createRenderPipelineAsync({})
  }), /lost device/)
  assert.equal(backend.device, device)
  assert.equal(scopeDepth, 0)
})
