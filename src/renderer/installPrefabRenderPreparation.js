import { REVISION } from 'three/webgpu'
import { buildNodeBuilderSteps, withInstanceCapacity } from './installObjectResourceCleanup.js'

// This r185 adapter uses the actual main/shadow RenderObjects. Temporary
// InstancedMeshes cannot warm their object-specific node and binding caches.
export function installPrefabRenderPreparation(renderer, { budgetMs = 4, maxConcurrentPipelines = 8 } = {}) {
  const nodes = renderer._nodes
  const originalRender = renderer._renderObjectDirect
  budgetMs = Number.isFinite(budgetMs) && budgetMs > 0 ? budgetMs : 4
  const metrics = {
    enabled: true, queued: 0, prepared: 0, failed: 0, cancelled: 0, pending: 0, gpuPending: 0,
    buildMs: 0, maxSliceMs: 0, frameBudgetMs: budgetMs, frameMs: 0, maxFrameMs: 0,
    maxRuntimeOperation: null,
  }
  if (REVISION !== '185' || !supportsPreparation(renderer)) {
    metrics.enabled = false
    console.warn('[Prefab preparation] Unsupported Three renderer; using synchronous rendering')
    return {
      metrics, whenIdle: () => Promise.resolve(), drain: work => work(), isObjectReady: () => true,
      beginInteractivePreparation() {}, finishFrame() {}, dispose() {}, releaseGroup() {},
    }
  }
  maxConcurrentPipelines = Number.isFinite(maxConcurrentPipelines) && maxConcurrentPipelines > 0
    ? Math.max(1, Math.floor(maxConcurrentPipelines))
    : 8
  const records = new Map()
  const objects = new Map()
  const failedObjects = new WeakSet()
  const queue = []
  const idleWaiters = []
  const pipelineWaits = new Map()
  let scheduled = null
  let interactive = false
  let drainDepth = 0
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

  function trackPipeline(pipeline, promises) {
    const waiting = Promise.all(promises)
    pipelineWaits.set(pipeline, waiting)
    metrics.gpuPending = pipelineWaits.size
    const settled = () => {
      if (pipelineWaits.get(pipeline) === waiting)
        pipelineWaits.delete(pipeline)
      metrics.gpuPending = pipelineWaits.size
      if (!frameBudgeted()) scheduleSlice()
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
    if (!frameBudgeted()) scheduleSlice()
    return record
  }

  function measureRuntime(record, operation, work) {
    if (!operation || !frameBudgeted()) return work()
    const start = performance.now()
    try {
      return work()
    }
    finally {
      const ms = performance.now() - start
      if (ms > (metrics.maxRuntimeOperation?.ms ?? 0)) {
        const object = record.renderObject.object
        metrics.maxRuntimeOperation = {
          ms, operation, object: object.name || object.type,
          material: record.material.type, staged: object.userData.streamPreparationOnly === true,
        }
      }
    }
  }

  function slice(record, operation, work) {
    const start = performance.now()
    try {
      return withContext(renderer, record, () => withInstanceCapacity(record.renderObject.object,
        () => measureRuntime(record, operation, work)))
    }
    finally {
      const elapsed = performance.now() - start
      metrics.buildMs += elapsed
      metrics.maxSliceMs = Math.max(metrics.maxSliceMs, elapsed)
    }
  }

  function* prepare(record) {
    const renderObject = record.renderObject
    const key = nodes.getForRenderCacheKey(renderObject)
    const data = nodes.get(renderObject)
    let builder
    if (!data.nodeBuilderState && !nodes.nodeBuilderCache.has(key)) {
      builder = slice(record, 'create node builder', () => nodes._createNodeBuilder(renderObject, record.material))
      const steps = buildNodeBuilderSteps(builder)
      // Each recursive TSL step is indivisible. The scheduler can pause between
      // steps and reuse whatever a different record finished in the meantime.
      yield
      while (!nodes.nodeBuilderCache.has(key) && !slice(record, 'build shader node', () => steps.next().done)) yield
    }
    if (record.cancelled || disposed)
      return

    if (!isRenderable(renderObject.object)) {
      releaseRecord(record)
      return
    }

    // Publish only after the complete build and cancellation check. Three's
    // normal disposal path now owns cache reference counts and binding cleanup.
    if (!data.nodeBuilderState) {
      const state = nodes.nodeBuilderCache.get(key) ?? slice(record, 'finalize node state', () => nodes._createNodeBuilderState(builder))
      if (record.cancelled || disposed)
        return
      nodes.nodeBuilderCache.set(key, state)
      state.usedTimes++
      data.nodeBuilderState = state
    }
    yield

    const pipelinePromises = []
    let pipeline
    slice(record, null, () => {
      measureRuntime(record, 'upload geometry', () => renderer._geometries.updateForRender(renderObject))
      if (record.cancelled || disposed)
        return
      measureRuntime(record, 'update render nodes', () => nodes.updateForRender(renderObject))
      if (record.cancelled || disposed)
        return
      measureRuntime(record, 'update GPU bindings', () => renderer._bindings.updateForRender(renderObject))
      if (record.cancelled || disposed)
        return
      pipeline = measureRuntime(record, 'request GPU pipeline', () => withPipelineErrorScopes(renderer.backend, () =>
        renderer._pipelines.getForRender(renderObject, pipelinePromises)))
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

  function frameBudgeted() {
    return interactive && drainDepth === 0
  }

  function cancelSlice() {
    clearTimeout(scheduled?.timer)
    scheduled = null
  }

  function scheduleSlice() {
    if (disposed || scheduled !== null || queue.length === 0 || pipelineWaits.size >= maxConcurrentPipelines)
      return
    const task = { timer: null }
    scheduled = task
    const run = () => {
      if (scheduled !== task) return
      scheduled = null
      processSlice(frameBudgeted())
      if (!frameBudgeted()) scheduleSlice()
    }
    if (!frameBudgeted() && globalThis.scheduler?.yield) {
      // Startup can drain independently of animation frames. scheduler.yield()
      // gives each batch its own task without the nested timer clamp.
      globalThis.scheduler.yield().then(run, () => {
        if (scheduled === task) task.timer = setTimeout(run, 0)
      })
    }
    else {
      task.timer = setTimeout(run, 0)
    }
  }

  function processSlice(isFrame) {
    const start = performance.now()
    do {
      // A promoted object may already be queued from the preparation band.
      // Read its live flag so it immediately joins visible work.
      const visibleIndex = queue.findIndex(record => record.renderObject.object.userData.streamPreparationOnly !== true)
      const index = Math.max(0, visibleIndex)
      const record = queue[index]
      if (record.cancelled || !isRenderable(record.renderObject.object)) {
        queue.splice(index, 1)
        releaseRecord(record)
        continue
      }
      try {
        record.work ??= prepare(record)
        if (record.work.next().done) queue.splice(index, 1)
      }
      catch (error) {
        queue.splice(index, 1)
        fail(record, error)
      }
    } while (queue.length && !disposed && pipelineWaits.size < maxConcurrentPipelines && performance.now() - start < budgetMs)
    if (isFrame) {
      metrics.frameMs = performance.now() - start
      metrics.maxFrameMs = Math.max(metrics.maxFrameMs, metrics.frameMs)
    }
    settleIdle()
  }

  const gate = function (object, material, scene, camera, lightsNode, group, clippingContext, passId) {
    const preparationOnly = object.userData?.streamPreparationOnly === true
    const streamed = preparationOnly || object.userData?.streamingPrefab === true || object.userData?.streamingChunk === true
    if (disposed || !streamed || failedObjects.has(object)) {
      if (!preparationOnly) return originalRender.apply(this, arguments)
      return
    }
    if (!isRenderable(object))
      return
    const renderObject = this._objects.get(object, material, scene, camera, lightsNode, this._currentRenderContext, clippingContext, passId)
    renderObject.drawRange = object.geometry.drawRange
    renderObject.group = group
    const record = records.get(renderObject) ?? enqueue(renderObject)
    if (!preparationOnly && record.status === 'ready')
      return originalRender.apply(this, arguments)
  }
  renderer._renderObjectDirect = gate

  return {
    metrics,
    beginInteractivePreparation() {
      if (interactive) return
      interactive = true
      if (frameBudgeted()) cancelSlice()
    },
    finishFrame() {
      if (!frameBudgeted()) return
      metrics.frameMs = 0
      // Grant one batch after the actual frame submission, including all its
      // passes. A slow timer collapses multiple renders into a single grant.
      scheduleSlice()
    },
    async drain(work) {
      drainDepth++
      scheduleSlice()
      try {
        return await work()
      }
      finally {
        drainDepth--
        if (frameBudgeted()) cancelSlice()
      }
    },
    whenIdle() {
      if (metrics.pending === 0)
        return Promise.resolve()
      return new Promise(resolve => idleWaiters.push(resolve))
    },
    isObjectReady(object) {
      if (failedObjects.has(object)) return true
      let hasMainPass = false
      for (const record of objects.get(object)?.records ?? []) {
        if (record.material.isShadowPassMaterial) continue
        if (record.status !== 'ready') return false
        hasMainPass = true
      }
      return hasMainPass
    },
    releaseGroup(group) { group.traverse(releaseObject) },
    dispose() {
      if (disposed)
        return
      disposed = true
      cancelSlice()
      if (renderer._renderObjectDirect === gate)
        renderer._renderObjectDirect = originalRender
      for (const object of [...objects.keys()]) releaseObject(object)
      queue.length = 0
      pipelineWaits.clear()
      metrics.gpuPending = 0
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
