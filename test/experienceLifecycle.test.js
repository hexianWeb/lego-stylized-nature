import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import Experience from '../src/app/Experience.js'
import Resources from '../src/utils/Resources.js'
import Renderer from '../src/renderer/Renderer.js'
import Environment from '../src/world/environment.js'
import World from '../src/world/world.js'
import WorldMaterials from '../src/world/WorldMaterials.js'

function createHarness(resources) {
  const calls = []
  const experience = Object.create(Experience.prototype)
  Object.assign(experience, {
    disposed: false,
    scene: {},
    initTimings: {},
    resources,
    renderer: {
      initialized: false,
      instance: { setAnimationLoop: () => calls.push('stop'), setClearColor() {} },
      attachPipeline() {},
      async init() { this.initialized = true },
      render: () => calls.push('render'),
      dispose: () => calls.push('renderer')
    },
    environment: { applyEnvironmentMap: () => calls.push('environmentMap'), dispose: () => calls.push('environment') },
    world: { build: () => calls.push('build'), warmupPrefabPipelines: async (r, c, render) => render(), dispose: () => calls.push('world') },
    worldCamera: { instance: {}, dispose: () => calls.push('camera') },
    debug: { active: false, dispose: () => calls.push('debug') },
    sizes: { onResize: () => () => calls.push('resizeListener'), dispose: () => calls.push('sizes') },
    time: { connectDocument() {}, dispose: () => calls.push('time') },
    _unsubscribeResize: null,
    resize() {}
  })
  return { experience, calls }
}

test('missing required assets stop initialization before World.build and allow complete cleanup', async () => {
  class MissingResources extends Resources { startLoading() { this.itemLoaded('brick', null) } }
  const resources = new MissingResources([{ name: 'brick', required: true }])
  const { experience, calls } = createHarness(resources)
  await assert.rejects(() => experience.init(), /brick/)
  experience.dispose()
  experience.dispose()
  assert.deepEqual(calls, ['stop', 'world', 'environment', 'camera', 'debug', 'sizes', 'time', 'renderer'])
  assert.equal(resources.disposed, true)
})

test('Experience releases the HDR after PMREM and renders warmup before startup completes', async () => {
  const resources = new Resources([])
  const hdr = new THREE.Texture()
  const { experience, calls } = createHarness(resources)
  hdr.addEventListener('dispose', () => calls.push('hdrDisposed'))
  resources.items.studioEnvMap = hdr
  const previousDocument = globalThis.document
  globalThis.document = {}
  try {
    await experience.init()
  } finally {
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  }
  assert.deepEqual(calls, ['environmentMap', 'hdrDisposed', 'build', 'render'])
  assert.equal(resources.items.studioEnvMap, undefined)
  assert.ok(experience.initTimings.totalMs >= 0)
  experience.dispose()
})

test('failed renderer initialization cleans consumers without retrying the renderer', async () => {
  const { experience, calls } = createHarness(new Resources([]))
  experience.renderer.init = async () => { throw new Error('No GPU') }
  await assert.rejects(() => experience.init(), /No GPU/)
  experience.dispose()
  assert.equal(calls.includes('stop'), false)
  assert.equal(experience.resources.disposed, true)
  const renderer = Object.create(Renderer.prototype)
  renderer.initialized = false
  renderer.instance = { dispose: () => assert.fail('uninitialized dispose would retry init') }
  renderer.dispose()
  renderer.dispose()
})

test('World releases borrowers before shared materials and cloned geometry exactly once', () => {
  const world = new World({ scene: new THREE.Scene() })
  const calls = []
  world.children = [{ dispose: () => calls.push('child') }]
  world.terrainChunkManager = { dispose: () => calls.push('slots') }
  world.materials = { dispose: () => calls.push('materials') }
  world.brickGeometry = { dispose: () => calls.push('geometry') }
  world.dispose()
  world.dispose()
  assert.deepEqual(calls, ['child', 'slots', 'materials', 'geometry'])
})

test('World disposed during asynchronous warmup releases the late result', async () => {
  const scene = new THREE.Scene()
  const world = new World({ scene })
  world.materials = new WorldMaterials()
  const source = new THREE.Scene()
  source.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()))
  world.prefabRegistry = {
    manifest: { rock: { variants: [{}] } },
    getVariantAsset: () => ({ scene: source })
  }
  let finishCompile
  let meshDisposals = 0
  const renderer = {
    compileAsync(compileScene) {
      compileScene.getObjectByName('PrefabPipelineWarmup').traverse(mesh => {
        if (mesh.isInstancedMesh) mesh.addEventListener('dispose', () => meshDisposals++)
      })
      return new Promise(resolve => { finishCompile = resolve })
    }
  }
  const pending = world.warmupPrefabPipelines(renderer, new THREE.PerspectiveCamera())
  world.dispose()
  finishCompile()
  await pending
  assert.equal(meshDisposals, 1)
  assert.equal(world.prefabWarmup, null)
  assert.equal(scene.children.length, 0)
})

test('Environment releases the complete PMREM target and shadow map exactly once', () => {
  const environment = new Environment(new THREE.Scene())
  const target = new THREE.RenderTarget(2, 2)
  const shadow = new THREE.RenderTarget(2, 2)
  let targetsDisposed = 0
  target.addEventListener('dispose', () => targetsDisposed++)
  shadow.addEventListener('dispose', () => targetsDisposed++)
  environment.envMapRenderTarget = target
  environment.envMap = target.texture
  environment.directionalLight.shadow.map = shadow
  environment.scene.environment = target.texture
  environment.scene.background = target.texture
  environment.dispose()
  environment.dispose()
  assert.equal(targetsDisposed, 2)
  assert.equal(environment.scene.environment, null)
  assert.equal(environment.envMapRenderTarget, null)
})
