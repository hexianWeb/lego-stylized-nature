import * as THREE from 'three/webgpu'
import Experience from '../app/Experience.js'
import Renderer from '../renderer/Renderer.js'

// This entry is opt-in and is never imported by the application.
if (!import.meta.env.DEV)
  throw new Error('Prefab validation requires the development server')

const button = document.querySelector('#run')
const worldButton = document.querySelector('#run-world')
const output = document.querySelector('#results')
const summary = document.querySelector('#summary')
const saveLink = document.querySelector('#save-results')
const canvas = document.querySelector('canvas')
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve))
let displayedResult

function displayResult(result) {
  displayedResult = result
  output.textContent = JSON.stringify(result, null, 2)
  const latest = [...result.records].reverse()
  const preparation = result.preparation ?? latest.find(record => record.preparation)?.preparation
  const missValue = latest.find(record => record.synchronousTslMisses !== undefined)?.synchronousTslMisses
  const misses = Array.isArray(missValue) ? missValue.length : missValue
  const visited = latest.find(record => record.visitedBiomes)?.visitedBiomes
    ?? [...new Set(result.records.filter(record => record.name === 'world-route-point').map(record => record.point.biome))]
  const parts = [result.status.toUpperCase()]
  if (result.kind === 'world-route')
    parts.push(`Biomes: ${visited.join(', ') || 'pending'}`)
  parts.push(`Sync TSL misses: ${misses ?? 'pending'}`)
  if (preparation)
    parts.push(`Prep max slice: ${Number(preparation.maxSliceMs).toFixed(2)} ms`)
  summary.textContent = parts.join(' · ')
  summary.dataset.status = result.status
  saveLink.setAttribute('aria-disabled', 'false')
}

saveLink.addEventListener('click', (event) => {
  if (!displayedResult) {
    event.preventDefault()
    return
  }
  const url = URL.createObjectURL(new Blob([output.textContent], { type: 'application/json' }))
  saveLink.href = url
  saveLink.download = displayedResult.kind === 'world-route' ? 'world-route-validation.json' : 'prefab-validation.json'
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})

function assert(condition, message) {
  if (!condition)
    throw new Error(message)
}

async function waitForPreparation(preparation) {
  let timer
  try {
    await Promise.race([
      preparation.whenIdle(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Prefab preparation did not become idle in 30 seconds')), 30000)
      }),
    ])
  }
  finally {
    clearTimeout(timer)
  }
}

function createPrefab(geometry, material, capacity = 32) {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity)
  mesh.userData.streamingPrefab = true
  mesh.name = 'ValidationPrefab'
  mesh.count = 1
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  const matrix = new THREE.Matrix4()
  for (let index = 0; index < capacity; index++) {
    matrix.makeTranslation((index % 8 - 3.5) * 0.55, 0.3, (Math.floor(index / 8) - 1.5) * 0.55)
    mesh.setMatrixAt(index, matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

function createScene() {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#263640')
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 40)
  camera.position.set(5, 4, 7)
  camera.lookAt(0, 0, 0)
  const light = new THREE.DirectionalLight(0xFFFFFF, 3)
  light.position.set(3, 7, 4)
  light.castShadow = true
  light.shadow.mapSize.set(256, 256)
  Object.assign(light.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.1, far: 20 })
  light.shadow.camera.updateProjectionMatrix()
  scene.add(light, new THREE.AmbientLight(0xFFFFFF, 0.8))
  const floorGeometry = new THREE.PlaneGeometry(12, 12)
  const floorMaterial = new THREE.MeshStandardNodeMaterial({ color: '#7d8790', roughness: 1 })
  const floor = new THREE.Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
  return { scene, camera, light, floorGeometry, floorMaterial }
}

async function runValidation() {
  const result = { status: 'running', records: [] }
  window.__prefabValidation = result
  window.__prefabValidationResult = result
  const record = (value) => {
    result.records.push(value)
    displayResult(result)
    console.info('[PrefabPreparationValidation]', JSON.stringify(value))
  }
  displayResult(result)
  const renderer = new Renderer({ canvas, postProcessing: { enabled: false } })
  const { scene, camera, light, floorGeometry, floorMaterial } = createScene()
  const geometry = new THREE.BoxGeometry(0.4, 0.6, 0.4)
  const material = new THREE.MeshStandardNodeMaterial({ color: '#91b878', roughness: 0.8 })
  const prefab = createPrefab(geometry, material)
  scene.add(prefab)
  let stopMonitoring = false
  let monitorPromise
  let restoreProbes = () => {}
  let device
  let errorScopeOpen = false
  const gpuErrors = []
  const onGpuError = event => gpuErrors.push(event.error?.message ?? String(event.error))
  try {
    await renderer.init()
    assert(renderer.instance.backend.isWebGPUBackend === true, 'The validation requires a real WebGPU backend')
    const preparation = renderer.prefabPreparation
    assert(preparation?.whenIdle, 'Renderer.prefabPreparation is not installed')
    assert(preparation.metrics.enabled === true, 'The Three renderer preparation adapter is disabled')
    renderer.attachPipeline(scene, camera)
    const width = Math.max(320, canvas.clientWidth)
    const height = Math.max(240, canvas.clientHeight)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSizeFromSizes({ width, height })
    const raw = renderer.instance
    device = raw.backend.device
    device?.addEventListener('uncapturederror', onGpuError)
    if (device?.pushErrorScope) {
      device.pushErrorScope('validation')
      errorScopeOpen = true
    }
    const nodes = raw._nodes
    const objects = raw._objects
    const originalCreate = objects.createRenderObject
    const originalGet = nodes.getForRender
    const originalDraw = raw.backend.draw
    const observed = new Map()
    const syncMisses = []
    const draws = []
    const renderTimes = []
    objects.createRenderObject = function (...args) {
      const renderObject = originalCreate.apply(this, args)
      if (renderObject.object.userData.streamingPrefab === true) {
        observed.set(renderObject, {
          object: renderObject.object,
          pass: renderObject.material.isShadowPassMaterial === true ? 'shadow' : 'main',
          contextId: renderObject.context.id,
          cacheKey: nodes.getForRenderCacheKey(renderObject),
        })
      }
      return renderObject
    }
    nodes.getForRender = function (renderObject, useAsync = false) {
      if (renderObject.object.userData.streamingPrefab === true && !useAsync) {
        const state = this.get(renderObject).nodeBuilderState
        const key = this.getForRenderCacheKey(renderObject)
        if (state === undefined && !this.nodeBuilderCache.has(key)) {
          syncMisses.push({ object: renderObject.object.name, id: renderObject.id, contextId: renderObject.context.id })
        }
      }
      return originalGet.call(this, renderObject, useAsync)
    }
    raw.backend.draw = function (renderObject, info) {
      if (renderObject.object.userData.streamingPrefab === true) {
        draws.push({ object: renderObject.object, renderObject, count: renderObject.object.count })
      }
      return originalDraw.call(this, renderObject, info)
    }
    restoreProbes = () => {
      objects.createRenderObject = originalCreate
      nodes.getForRender = originalGet
      raw.backend.draw = originalDraw
    }
    const render = () => {
      const started = performance.now()
      renderer.render()
      renderTimes.push(performance.now() - started)
    }
    let observedWaitFrames = 0
    let liveStateViolation = null
    monitorPromise = (async () => {
      while (!stopMonitoring) {
        await nextFrame()
        if (stopMonitoring)
          break
        observedWaitFrames++
        if (prefab.count !== 1)
          liveStateViolation = `Draw count changed across an asynchronous yield: ${prefab.count}`
        if (raw.getRenderTarget() !== null)
          liveStateViolation = 'A shadow render target escaped an asynchronous build slice'
      }
    })()
    let rounds = 0
    let stable = false
    for (; rounds < 12; rounds++) {
      const previousPrepared = preparation.metrics.prepared
      render()
      await waitForPreparation(preparation)
      await nextFrame()
      const actualObjects = [...observed.entries()].filter(([, value]) => value.object === prefab)
      const mainReady = actualObjects.some(([renderObject, value]) => value.pass === 'main' && nodes.get(renderObject).nodeBuilderState)
      const shadowReady = actualObjects.some(([renderObject, value]) => value.pass === 'shadow' && nodes.get(renderObject).nodeBuilderState)
      if (mainReady && shadowReady && preparation.metrics.pending === 0 && preparation.metrics.prepared === previousPrepared) {
        stable = true
        break
      }
    }
    stopMonitoring = true
    await monitorPromise
    assert(stable, 'Main and shadow preparation did not stabilize after 12 renders')
    assert(!liveStateViolation, liveStateViolation)
    assert(prefab.count === 1, 'Preparation changed the live draw count')
    assert(syncMisses.length === 0, `Tagged prefab incurred synchronous TSL builds: ${JSON.stringify(syncMisses)}`)
    assert(preparation.metrics.failed === 0, 'The preparation queue reported a failed build')
    const passes = [...observed.entries()]
      .filter(([, value]) => value.object === prefab)
      .map(([renderObject, value]) => {
        const state = nodes.get(renderObject).nodeBuilderState
        assert(state, `${value.pass} render object is missing its prepared node state`)
        assert(/array<\s*mat4x4<f32>\s*,\s*32\s*>/.test(state.vertexShader), `${value.pass} WGSL matrix array does not cover the 32-instance pool`)
        return { pass: value.pass, contextId: value.contextId, compiledCapacity: 32 }
      })
    assert(new Set(passes.map(value => value.contextId)).size >= 2, 'Main and shadow render objects did not use distinct real contexts')
    assert(draws.some(value => value.object === prefab && observed.get(value.renderObject)?.pass === 'main'), 'The prepared prefab was never drawn in the main pass')
    assert(draws.some(value => value.object === prefab && observed.get(value.renderObject)?.pass === 'shadow'), 'The prepared prefab was never drawn in the shadow pass')
    record({
      name: 'cold-prefab-main-and-shadow',
      passes,
      stableAfterRenders: rounds + 1,
      synchronousTslMisses: syncMisses.length,
      liveCount: prefab.count,
      observedWaitFrames,
      renderCpuMs: renderTimes.map(value => Number(value.toFixed(3))),
      preparation: { ...preparation.metrics },
    })
    const queuedBeforeGrowth = preparation.metrics.queued
    prefab.count = 32
    render()
    await waitForPreparation(preparation)
    assert(prefab.count === 32, 'Growing a pool changed its live count during rendering')
    assert(syncMisses.length === 0, 'Growing an existing pool rebuilt TSL synchronously')
    assert(preparation.metrics.queued === queuedBeforeGrowth, 'Growing a prepared pool queued another shader build')
    assert(draws.some(value => value.object === prefab && value.count === 32), 'The grown instance pool did not reach the real draw path')
    record({ name: 'grow-existing-pool', drawCount: prefab.count, synchronousTslMisses: syncMisses.length })

    const compileProbe = createPrefab(geometry, material)
    compileProbe.name = 'PublicCompileAsyncPrefab'
    compileProbe.castShadow = false
    compileProbe.receiveShadow = false
    scene.add(compileProbe)
    try {
      await raw.compileAsync(compileProbe, camera, scene)
      const compiledObjects = [...observed.entries()].filter(([, value]) => value.object === compileProbe)
      assert(compiledObjects.length > 0, 'Public compileAsync did not create a real render object')
      for (const [renderObject] of compiledObjects) {
        const state = nodes.get(renderObject).nodeBuilderState
        assert(state && /array<\s*mat4x4<f32>\s*,\s*32\s*>/.test(state.vertexShader), 'Public compileAsync did not preserve the 32-instance matrix capacity')
      }
      assert(compileProbe.count === 1, 'Public compileAsync changed the live draw count')
      record({ name: 'public-compile-async-capacity', compiledCapacity: 32, liveCount: compileProbe.count })
    }
    finally {
      scene.remove(compileProbe)
      renderer.releaseSceneObjects(compileProbe)
      compileProbe.dispose()
    }

    const cancelled = createPrefab(geometry, material)
    cancelled.name = 'ReleasedPrefab'
    scene.add(cancelled)
    render()
    const cancelledObjects = [...observed.entries()].filter(([, value]) => value.object === cancelled)
    assert(cancelledObjects.length > 0, 'Cancellation probe never reached the render preparation gate')
    scene.remove(cancelled)
    renderer.releaseSceneObjects(cancelled)
    cancelled.dispose()
    await waitForPreparation(preparation)
    await nextFrame()
    await nextFrame()
    for (const [, value] of cancelledObjects) {
      assert(!nodes.nodeBuilderCache.has(value.cacheKey), 'A released prefab published a node state after cancellation')
    }
    assert(!draws.some(value => value.object === cancelled), 'A cancelled prefab reached the draw path')
    record({ name: 'release-pending-prefab', cancelledRenderObjects: cancelledObjects.length, pending: preparation.metrics.pending })

    const disposed = createPrefab(geometry, material)
    disposed.name = 'DisposedRendererPrefab'
    scene.add(disposed)
    render()
    renderer.dispose()
    await waitForPreparation(preparation)
    await nextFrame()
    await nextFrame()
    disposed.dispose()
    assert(preparation.metrics.pending === 0, 'Renderer disposal retained pending preparation jobs')
    assert(syncMisses.length === 0, `A lifecycle probe rebuilt a tagged prefab synchronously: ${JSON.stringify(syncMisses)}`)
    if (errorScopeOpen) {
      const error = await device.popErrorScope()
      errorScopeOpen = false
      if (error)
        gpuErrors.push(error.message)
    }
    assert(gpuErrors.length === 0, `WebGPU validation errors: ${gpuErrors.join('; ')}`)
    record({ name: 'dispose-pending-renderer', pending: preparation.metrics.pending, webGpuErrors: gpuErrors })
    result.status = 'passed'
  }
  catch (error) {
    result.status = 'failed'
    result.error = { message: error.message, stack: error.stack }
    result.preparation = { ...renderer.prefabPreparation?.metrics }
    console.error('[PrefabPreparationValidation]', error)
  }
  finally {
    stopMonitoring = true
    await monitorPromise
    restoreProbes()
    renderer.releaseSceneObjects(scene)
    renderer.dispose()
    scene.traverse((object) => {
      if (object.isInstancedMesh)
        object.dispose()
    })
    geometry.dispose()
    material.dispose()
    floorGeometry.dispose()
    floorMaterial.dispose()
    light.shadow.dispose()
    if (errorScopeOpen)
      await device.popErrorScope()
    device?.removeEventListener('uncapturederror', onGpuError)
    displayResult(result)
  }
  return result
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const at = fraction => Number((sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0).toFixed(3))
  return { samples: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: at(1) }
}

function chooseWorldRoute(world) {
  const config = world.config
  const mask = world.biomeMaskGenerator
  const context = mask.createSamplingContext()
  const cellSize = config.terrain.cellSize
  const chunkSize = config.chunks.size
  const initial = world.playerAircraft.state.position
  const startX = Math.floor(initial.x / cellSize)
  const startZ = Math.floor(initial.z / cellSize)
  const sample = (x, z) => ({ blockX: x, blockZ: z, biome: mask.getCellBiome(x, z, context).biomeId })
  const start = sample(startX, startZ)
  const expectedBiomes = config.biomes.table.filter(entry => entry.weight > 0).map(entry => entry.id)
  const byBiome = new Map()
  // Search the deterministic biome mask instead of generating throwaway terrain.
  for (let radius = 0; radius <= 6 && byBiome.size < expectedBiomes.length; radius++) {
    for (let gz = -radius; gz <= radius; gz++) {
      for (let gx = -radius; gx <= radius; gx++) {
        if (Math.max(Math.abs(gx), Math.abs(gz)) !== radius)
          continue
        const x = Math.floor((gx + 0.5) * config.biomes.cellSize / chunkSize) * chunkSize + Math.floor(chunkSize / 2)
        const z = Math.floor((gz + 0.5) * config.biomes.cellSize / chunkSize) * chunkSize + Math.floor(chunkSize / 2)
        const point = sample(x, z)
        if (!byBiome.has(point.biome))
          byBiome.set(point.biome, point)
      }
    }
  }
  const distinct = [start, ...expectedBiomes.filter(id => id !== start.biome && byBiome.has(id)).map(id => byBiome.get(id))]
  assert(new Set(distinct.map(point => point.biome)).size >= 3, 'Route selection could not find at least three biomes')
  // Include a neighboring chunk for each biome to exercise slot reuse and growth.
  const route = distinct.slice(0, 4).flatMap(point => [point, sample(point.blockX + chunkSize, point.blockZ)])
  return { route, startBiome: start.biome, cellSize, chunkSize }
}

async function runWorldRoute() {
  const result = { status: 'running', kind: 'world-route', records: [] }
  window.__worldRouteValidation = result
  window.__worldRouteValidationResult = result
  const record = (value) => {
    result.records.push(value)
    displayResult(result)
    console.info('[WorldRouteValidation]', JSON.stringify(value))
  }
  displayResult(result)
  const experience = new Experience(canvas)
  let restoreProbes = () => {}
  let device
  let errorScopeOpen = false
  const gpuErrors = []
  const onGpuError = event => gpuErrors.push(event.error?.message ?? String(event.error))
  const frameRecords = []
  window.__worldRouteFrames = frameRecords
  try {
    const initStarted = performance.now()
    await experience.init()
    const raw = experience.renderer.instance
    assert(raw.backend.isWebGPUBackend === true, 'The route requires a real WebGPU backend')
    const preparation = experience.renderer.prefabPreparation
    assert(preparation?.metrics.enabled, 'Prefab preparation is not installed for the world route')
    const world = experience.world
    const player = world.playerAircraft
    const manager = world.terrainChunkManager
    assert(player?.enabled && manager, 'World route requires the enabled player and chunk terrain')
    player.input.dispose()
    player.cameraFollow.enabled = false
    experience.worldCamera.controls.enabled = false
    experience.worldCamera.trackballControls.enabled = false
    device = raw.backend.device
    device?.addEventListener('uncapturederror', onGpuError)
    if (device?.pushErrorScope) {
      device.pushErrorScope('validation')
      errorScopeOpen = true
    }
    const { route, startBiome, cellSize, chunkSize } = chooseWorldRoute(world)
    record({
      name: 'world-route-initialized',
      initializationMs: Number((performance.now() - initStarted).toFixed(3)),
      init: { ...experience.initTimings },
      route,
      preparation: { ...preparation.metrics },
      note: 'Frame times include real terrain generation and uploads. This check has no absolute FPS threshold.',
    })
    const nodes = raw._nodes
    const originalGet = nodes.getForRender
    const originalRender = experience.renderer.render
    const originalWorldUpdate = experience.world.update
    const syncMisses = []
    let currentRenderMs = 0
    let currentWorldUpdateMs = 0
    nodes.getForRender = function (renderObject, useAsync = false) {
      if (renderObject.object.userData.streamingPrefab === true && !useAsync) {
        const state = this.get(renderObject).nodeBuilderState
        const key = this.getForRenderCacheKey(renderObject)
        if (state === undefined && !this.nodeBuilderCache.has(key)) {
          syncMisses.push({
            bucket: renderObject.object.userData.prefabBucketKey,
            id: renderObject.id,
            contextId: renderObject.context.id,
            shadow: renderObject.material.isShadowPassMaterial === true,
          })
        }
      }
      return originalGet.call(this, renderObject, useAsync)
    }
    experience.renderer.render = function (...args) {
      const started = performance.now()
      try {
        return originalRender.apply(this, args)
      }
      finally {
        currentRenderMs = performance.now() - started
      }
    }
    experience.world.update = function (...args) {
      const started = performance.now()
      try {
        return originalWorldUpdate.apply(this, args)
      }
      finally {
        currentWorldUpdateMs = performance.now() - started
      }
    }
    restoreProbes = () => {
      nodes.getForRender = originalGet
      experience.renderer.render = originalRender
      experience.world.update = originalWorldUpdate
    }
    let previousTimestamp
    let currentPoint
    const runFrame = async (point, drift = 0) => {
      currentPoint = point
      const timestamp = await new Promise(resolve => requestAnimationFrame(resolve))
      const x = (point.blockX + drift) * cellSize
      const z = point.blockZ * cellSize
      player.state.position.set(x, player.motionConfig.height, z)
      player.state.velocity.set(0, 0, 0)
      player.state.angularVelocity = 0
      experience.worldCamera.followTarget(new THREE.Vector3(x, 0, z), 0, 0)
      const started = performance.now()
      experience.update(timestamp)
      const cpuMs = performance.now() - started
      frameRecords.push({
        biome: point.biome,
        intervalMs: previousTimestamp === undefined ? null : timestamp - previousTimestamp,
        cpuMs,
        worldUpdateMs: currentWorldUpdateMs,
        renderMs: currentRenderMs,
        pendingPreparation: preparation.metrics.pending,
        chunkBuilds: manager.buildTimings.builds,
        chunkBuildMs: manager.buildTimings.totalMs,
      })
      previousTimestamp = timestamp
    }
    const routeStarted = performance.now()
    const preparedBeforeRoute = preparation.metrics.prepared
    const visitedBiomes = new Set()
    for (const [index, point] of route.entries()) {
      const firstFrame = frameRecords.length
      const preparedBefore = preparation.metrics.prepared
      const chunksBefore = manager.buildTimings.builds
      for (let frame = 0; frame < 30; frame++) await runFrame(point, frame / 29 * chunkSize * 0.2)
      visitedBiomes.add(point.biome)
      const frames = frameRecords.slice(firstFrame)
      record({
        name: 'world-route-point',
        index,
        point,
        newChunkBuilds: manager.buildTimings.builds - chunksBefore,
        newlyPrepared: preparation.metrics.prepared - preparedBefore,
        pendingPreparation: preparation.metrics.pending,
        cpuMs: summarize(frames.map(frame => frame.cpuMs)),
        worldUpdateMs: summarize(frames.map(frame => frame.worldUpdateMs)),
        renderMs: summarize(frames.map(frame => frame.renderMs)),
        rafIntervalMs: summarize(frames.flatMap(frame => frame.intervalMs === null ? [] : [frame.intervalMs])),
      })
    }
    let stableFrames = 0
    let drainFrames = 0
    const drainStarted = performance.now()
    while (stableFrames < 3) {
      const preparedBefore = preparation.metrics.prepared
      await runFrame(currentPoint)
      drainFrames++
      const idle = manager.pendingQueue.length === 0
        && manager.pendingPrefabBuildQueue.length === 0
        && preparation.metrics.pending === 0
        && preparation.metrics.prepared === preparedBefore
      stableFrames = idle ? stableFrames + 1 : 0
      assert(drainFrames <= 1200 && performance.now() - drainStarted < 30000, `World route did not drain its queues: ${JSON.stringify({ terrain: manager.pendingQueue.length, prefab: manager.pendingPrefabBuildQueue.length, preparation: preparation.metrics.pending })}`)
    }
    await waitForPreparation(preparation)
    if (errorScopeOpen) {
      const error = await device.popErrorScope()
      errorScopeOpen = false
      if (error)
        gpuErrors.push(error.message)
    }
    record({
      name: 'world-route-complete',
      durationMs: Number((performance.now() - routeStarted).toFixed(3)),
      visitedBiomes: [...visitedBiomes],
      newBiomes: [...visitedBiomes].filter(id => id !== startBiome),
      frames: frameRecords.length,
      drainFrames,
      newlyPrepared: preparation.metrics.prepared - preparedBeforeRoute,
      synchronousTslMisses: syncMisses,
      preparation: { ...preparation.metrics },
      cpuMs: summarize(frameRecords.map(frame => frame.cpuMs)),
      worldUpdateMs: summarize(frameRecords.map(frame => frame.worldUpdateMs)),
      renderMs: summarize(frameRecords.map(frame => frame.renderMs)),
      rafIntervalMs: summarize(frameRecords.flatMap(frame => frame.intervalMs === null ? [] : [frame.intervalMs])),
      terrainBuild: { ...manager.buildTimings },
      queues: { terrain: manager.pendingQueue.length, prefab: manager.pendingPrefabBuildQueue.length, preparation: preparation.metrics.pending },
      webGpuErrors: gpuErrors,
    })
    assert(visitedBiomes.size >= 3, 'The world route did not visit three distinct biomes')
    assert(syncMisses.length === 0, `World prefabs incurred synchronous TSL builds: ${JSON.stringify(syncMisses)}`)
    assert(preparation.metrics.failed === 0, 'World prefab preparation reported a failed build')
    assert(preparation.metrics.pending === 0, 'World prefab preparation retained pending jobs')
    assert(preparation.metrics.prepared > preparedBeforeRoute, 'The route did not exercise cold prefab preparation')
    assert(gpuErrors.length === 0, `World route WebGPU validation errors: ${gpuErrors.join('; ')}`)
    result.status = 'passed'
  }
  catch (error) {
    result.status = 'failed'
    result.error = { message: error.message, stack: error.stack }
    result.preparation = { ...experience.renderer.prefabPreparation?.metrics }
    console.error('[WorldRouteValidation]', error)
  }
  finally {
    restoreProbes()
    if (errorScopeOpen)
      await device.popErrorScope()
    device?.removeEventListener('uncapturederror', onGpuError)
    experience.dispose()
    displayResult(result)
  }
  return result
}

let activeValidationPromise
function launchValidation(run) {
  if (activeValidationPromise)
    return activeValidationPromise
  button.disabled = true
  worldButton.disabled = true
  activeValidationPromise = run().finally(() => {
    activeValidationPromise = null
    button.disabled = false
    worldButton.disabled = false
  })
  return activeValidationPromise
}
window.runPrefabPreparationValidation = () => (window.__prefabValidationPromise = launchValidation(runValidation))
window.runWorldRouteValidation = () => (window.__worldRouteValidationPromise = launchValidation(runWorldRoute))
button.addEventListener('click', window.runPrefabPreparationValidation)
worldButton.addEventListener('click', window.runWorldRouteValidation)
