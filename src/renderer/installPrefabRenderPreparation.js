import { REVISION } from 'three/webgpu'
import { buildNodeBuilderSteps, withInstanceCapacity } from './installObjectResourceCleanup.js'

// This r185 adapter uses the actual main/shadow RenderObjects. Temporary
// InstancedMeshes cannot warm their object-specific node and binding caches.
export function installPrefabRenderPreparation(renderer, { budgetMs = 4, maxConcurrentPipelines = 8 } = {}) {
  const nodes = renderer._nodes
  const originalRender = renderer._renderObjectDirect
  const metrics = { enabled: true, queued: 0, prepared: 0, failed: 0, cancelled: 0, pending: 0, gpuPending: 0, buildMs: 0, maxSliceMs: 0 }
  if (REVISION !== '185' || !supportsPreparation(renderer)) {
    metrics.enabled = false
    console.warn('[Prefab preparation] Unsupported Three renderer; using synchronous rendering')
    return { metrics, whenIdle: () => Promise.resolve(), dispose() {}, releaseGroup() {} }
  }
  budgetMs = Number.isFinite(budgetMs) && budgetMs > 0 ? budgetMs : 4
  maxConcurrentPipelines = Number.isFinite(maxConcurrentPipelines) && maxConcurrentPipelines > 0
    ? Math.max(1, Math.floor(maxConcurrentPipelines))
    : 8
  const records = new Map()
  const objects = new Map()
  const failedObjects = new WeakSet()
  const queue = []
  const idleWaiters = []
  const pipelineWaits = new Map()
  const capacityWaiters = []
  let running = false
  let disposed = false

  function settleIdle() {
    if (metrics.pending > 0)
      return
    for (const resolve of idleWaiters.splice(0)) resolve()
  }

  function finish(record, status) {
    if (record.status !== 'pending')
      return
    record.status = status
    metrics.pending--
    if (status === 'ready')
      metrics.prepared++
    if (status === 'failed')
      metrics.failed++
    if (status === 'cancelled')
      metrics.cancelled++
    settleIdle()
  }

  function cancel(record) {
    record.cancelled = true
    finish(record, 'cancelled')
  }

  function releaseRecord(record) {
    cancel(record)
    records.delete(record.renderObject)
    if (!record.released) {
      record.released = true
      record.renderObject.dispose()
    }
  }

  function fail(record, error) {
    if (record.cancelled || disposed)
      return
    finish(record, 'failed')
    failedObjects.add(record.renderObject.object)
    console.error('[Prefab preparation] Could not prepare render object', error)
    // Release partial resources; the mesh can use Three's normal fallback path.
    try {
      releaseRecord(record)
    }
    catch (cleanupError) {
      console.error('[Prefab preparation] Could not release failed render object', cleanupError)
    }
  }

  function wakeCapacityWaiters() {
    for (const resolve of capacityWaiters.splice(0)) resolve()
  }

  function trackPipeline(pipeline, promises) {
    const waiting = Promise.all(promises)
    pipelineWaits.set(pipeline, waiting)
    metrics.gpuPending = pipelineWaits.size
    const settled = () => {
      if (pipelineWaits.get(pipeline) === waiting)
        pipelineWaits.delete(pipeline)
      metrics.gpuPending = pipelineWaits.size
      wakeCapacityWaiters()
    }
    // Both fulfillment and rejection release the concurrency slot. Attach the
    // rejection handler immediately; a discarded/cancelled job must stay handled.
    waiting.then(settled, settled)
    return waiting
  }

  function completePipeline(record) {
    if (record.cancelled || disposed)
      return
    if (!renderer._pipelines.isReady(record.renderObject)) {
      fail(record, new Error('Prefab render pipeline did not become ready'))
      return
    }
    finish(record, 'ready')
  }

  function releaseObject(object) {
    const owned = objects.get(object)
    if (!owned)
      return
    object.removeEventListener('dispose', owned.onDispose)
    objects.delete(object)
    for (const record of owned.records) {
      releaseRecord(record)
    }
  }

  function enqueue(renderObject) {
    const object = renderObject.object
    let owned = objects.get(object)
    if (!owned) {
      owned = { records: new Set(), onDispose: () => releaseObject(object) }
      objects.set(object, owned)
      object.addEventListener('dispose', owned.onDispose)
    }
    const record = {
      renderObject,
      status: 'pending',
      cancelled: false,
      released: false,
      // Shadow's shared override material is restored as soon as renderObject()
      // returns. A build must retain the nodes/side chosen for this source mesh.
      material: snapshotMaterial(renderObject.material),
      context: captureContext(renderer),
    }
    records.set(renderObject, record)
    owned.records.add(record)
    const onDispose = renderObject.onDispose
    renderObject.onDispose = () => {
      record.released = true
      cancel(record)
      records.delete(renderObject)
      owned.records.delete(record)
      onDispose()
    }
    queue.push(record)
    metrics.queued++
    metrics.pending++
    processQueue()
    return record
  }

  function slice(record, work) {
    const start = performance.now()
    try {
      return withContext(renderer, record, () => withInstanceCapacity(record.renderObject.object, work))
    }
    finally {
      const elapsed = performance.now() - start
      metrics.buildMs += elapsed
      metrics.maxSliceMs = Math.max(metrics.maxSliceMs, elapsed)
    }
  }

  async function prepare(record) {
    const renderObject = record.renderObject
    const key = nodes.getForRenderCacheKey(renderObject)
    let state = nodes.get(renderObject).nodeBuilderState ?? nodes.nodeBuilderCache.get(key)
    if (!state) {
      const builder = slice(record, () => nodes._createNodeBuilder(renderObject, record.material))
      const steps = buildNodeBuilderSteps(builder)
      let done = false
      while (!done && !record.cancelled && !disposed) {
        if (!isRenderable(renderObject.object)) {
          releaseRecord(record)
          return
        }
        const started = performance.now()
        // The budget bounds batches. One recursive TSL node build is indivisible;
        // maxSliceMs records those overruns instead of pretending they are bounded.
        do {
          done = slice(record, () => steps.next().done)
        } while (!done && !record.cancelled && !disposed && performance.now() - started < budgetMs)
        metrics.maxSliceMs = Math.max(metrics.maxSliceMs, performance.now() - started)
        if (!done)
          await yieldToBrowser()
      }
      if (record.cancelled || disposed)
        return
      state = nodes.nodeBuilderCache.get(key) ?? slice(record, () => nodes._createNodeBuilderState(builder))
    }
    if (record.cancelled || disposed)
      return

    if (!isRenderable(renderObject.object)) {
      releaseRecord(record)
      return
    }

    // Publish only after the complete build and cancellation check. Three's
    // normal disposal path now owns cache reference counts and binding cleanup.
    const data = nodes.get(renderObject)
    if (!data.nodeBuilderState) {
      nodes.nodeBuilderCache.set(key, state)
      state.usedTimes++
      data.nodeBuilderState = state
    }
    const pipelinePromises = []
    let pipeline
    slice(record, () => {
      renderer._geometries.updateForRender(renderObject)
      if (record.cancelled || disposed)
        return
      nodes.updateForRender(renderObject)
      if (record.cancelled || disposed)
        return
      renderer._bindings.updateForRender(renderObject)
      if (record.cancelled || disposed)
        return
      pipeline = withPipelineErrorScopes(renderer.backend, () =>
        renderer._pipelines.getForRender(renderObject, pipelinePromises))
    })
    // updateBefore intentionally runs in the next real render, where shadow
    // draws pass through this same gate with their genuine nested context.
    if (record.cancelled || disposed)
      return
    const waiting = pipelinePromises.length
      ? trackPipeline(pipeline, pipelinePromises)
      : pipelineWaits.get(pipeline)
    if (waiting) {
      // CPU node construction continues while the GPU compiles this pipeline.
      // Cache-hit RenderObjects also await a shared pipeline's existing promise.
      waiting.then(() => completePipeline(record), error => fail(record, error))
        .catch(error => fail(record, error))
    }
    else {
      completePipeline(record)
    }
  }

  async function processQueue() {
    if (running || disposed)
      return
    running = true
    await yieldToBrowser()
    try {
      while (queue.length && !disposed) {
        const next = queue[0]
        if (next.cancelled || !isRenderable(next.renderObject.object)) {
          queue.shift()
          releaseRecord(next)
          continue
        }
        if (pipelineWaits.size >= maxConcurrentPipelines) {
          await new Promise(resolve => capacityWaiters.push(resolve))
          continue
        }
        const record = queue.shift()
        if (record.cancelled)
          continue
        try {
          await prepare(record)
        }
        catch (error) {
          fail(record, error)
        }
        if (queue.length)
          await yieldToBrowser()
      }
    }
    finally {
      running = false
      settleIdle()
    }
  }

  const gate = function (object, material, scene, camera, lightsNode, group, clippingContext, passId) {
    const streamed = object.userData?.streamingPrefab === true || object.userData?.streamingChunk === true
    if (disposed || !streamed || failedObjects.has(object)) {
      return originalRender.apply(this, arguments)
    }
    if (!isRenderable(object))
      return
    const renderObject = this._objects.get(object, material, scene, camera, lightsNode, this._currentRenderContext, clippingContext, passId)
    renderObject.drawRange = object.geometry.drawRange
    renderObject.group = group
    const record = records.get(renderObject) ?? enqueue(renderObject)
    if (record.status === 'ready')
      return originalRender.apply(this, arguments)
  }
  renderer._renderObjectDirect = gate

  return {
    metrics,
    whenIdle() {
      if (metrics.pending === 0)
        return Promise.resolve()
      return new Promise(resolve => idleWaiters.push(resolve))
    },
    releaseGroup(group) { group.traverse(releaseObject) },
    dispose() {
      if (disposed)
        return
      disposed = true
      if (renderer._renderObjectDirect === gate)
        renderer._renderObjectDirect = originalRender
      for (const object of [...objects.keys()]) releaseObject(object)
      queue.length = 0
      pipelineWaits.clear()
      metrics.gpuPending = 0
      wakeCapacityWaiters()
      settleIdle()
    },
  }
}

function isRenderable(object) {
  if (object.isInstancedMesh && object.count === 0)
    return false
  for (let ancestor = object; ancestor; ancestor = ancestor.parent) {
    if (ancestor.visible === false)
      return false
  }
  return true
}

function supportsPreparation(renderer) {
  return typeof renderer._renderObjectDirect === 'function'
    && typeof renderer._objects?.get === 'function'
    && typeof renderer._nodes?._createNodeBuilder === 'function'
    && typeof renderer._nodes?._createNodeBuilderState === 'function'
    && typeof renderer._nodes?.getForRenderCacheKey === 'function'
    && typeof renderer._nodes?.get === 'function'
    && typeof renderer._nodes?.updateForRender === 'function'
    && renderer._nodes?.nodeBuilderCache instanceof Map
    && typeof renderer._geometries?.updateForRender === 'function'
    && typeof renderer._bindings?.updateForRender === 'function'
    && typeof renderer._pipelines?.getForRender === 'function'
    && typeof renderer._pipelines?.isReady === 'function'
    && ['getRenderTarget', 'getActiveCubeFace', 'getActiveMipmapLevel', 'getMRT', 'setRenderTarget', 'setMRT']
      .every(name => typeof renderer[name] === 'function')
}

function snapshotMaterial(material) {
  const snapshot = material.clone()
  // A custom r185 flag on the shared shadow override material is not copied by
  // NodeMaterial.copy(), but controls its environment cache and output path.
  if (material.isShadowPassMaterial)
    snapshot.isShadowPassMaterial = true
  return snapshot
}

function captureContext(renderer) {
  return {
    target: renderer.getRenderTarget(),
    cubeFace: renderer.getActiveCubeFace(),
    mipmapLevel: renderer.getActiveMipmapLevel(),
    mrt: renderer.getMRT(),
    depth: renderer.depth,
    stencil: renderer.stencil,
    renderContext: renderer._currentRenderContext,
    sourceMaterial: renderer._currentSourceMaterial,
  }
}

function withContext(renderer, record, work) {
  const previous = captureContext(renderer)
  const previousMaterial = record.renderObject.material
  const apply = (context) => {
    renderer.setRenderTarget(context.target, context.cubeFace, context.mipmapLevel)
    renderer.setMRT(context.mrt)
    renderer.depth = context.depth
    renderer.stencil = context.stencil
    renderer._currentRenderContext = context.renderContext
    renderer._currentSourceMaterial = context.sourceMaterial
  }
  try {
    apply(record.context)
    record.renderObject.material = record.material
    return work()
  }
  finally {
    record.renderObject.material = previousMaterial
    apply(previous)
  }
}

function yieldToBrowser() {
  if (globalThis.scheduler?.yield)
    return globalThis.scheduler.yield()
  return new Promise(resolve => setTimeout(resolve, 0))
}

// r185 pops its validation scope after awaiting GPU compilation. Parallel
// compiles can finish out of order and pop another pipeline's scope. Close each
// real scope synchronously; the captured device supplies its own result later.
// The backend sees its normal device again before any asynchronous yield.
export function withPipelineErrorScopes(backend, work) {
  const device = backend?.device
  if (!backend?.isWebGPUBackend || typeof device?.createRenderPipelineAsync !== 'function')
    return work()
  const scopes = []
  const scopedDevice = new Proxy(device, {
    get(target, property) {
      if (property === 'pushErrorScope') {
        return (filter) => {
          target.pushErrorScope(filter)
          scopes.push({ result: null })
        }
      }
      if (property === 'popErrorScope') {
        return () => {
          const scope = scopes.pop()
          return scope?.result ?? target.popErrorScope()
        }
      }
      if (property === 'createRenderPipelineAsync') {
        return (descriptor) => {
          try {
            return target.createRenderPipelineAsync(descriptor)
          }
          finally {
            const scope = scopes.at(-1)
            if (scope && !scope.result) {
            // popErrorScope can reject when a device is lost. Preserve the
            // pipeline's diagnostic path without an unhandled rejected wait.
              scope.result = target.popErrorScope().catch(error => ({ message: String(error?.message ?? error) }))
            }
          }
        }
      }
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  backend.device = scopedDevice
  try {
    return work()
  }
  finally {
    backend.device = device
  }
}
