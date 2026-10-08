import * as THREE from 'three/webgpu'
import Experience from '../app/Experience.js'
import { bootstrap } from '../app/bootstrap.js'
import World from '../world/world.js'
import { worldConfig } from '../world/WorldConfig.js'
import sources from '../assets/sources.js'

// Opt-in real WebGPU checks. This page is absent from the production entry.
if (!import.meta.env.DEV) throw new Error('Rendering validation requires the development server')

const output = document.querySelector('#results')
const canvas = document.querySelector('canvas')
const records = []
function record(result) {
  records.push(result)
  output.textContent = JSON.stringify(records, null, 2)
  console.info('[RenderingValidation]', JSON.stringify(result))
}
function assert(condition, message) { if (!condition) throw new Error(message) }
function validateMatrixCapacity(e) {
  const mesh = new THREE.InstancedMesh(e.world.brickGeometry, e.world.materials.waterMaterial, 900)
  mesh.frustumCulled = false
  mesh.count = 1
  const objects = e.renderer.instance._objects
  const create = objects.createRenderObject
  let compiled
  objects.createRenderObject = function (...args) {
    const renderObject = create.apply(this, args)
    if (renderObject.object === mesh) compiled = renderObject
    return renderObject
  }
  e.scene.add(mesh)
  try {
    e.renderer.render()
    assert(compiled, 'Matrix probe did not render')
    assert(/array<\s*mat4x4<f32>\s*,\s*900\s*>/.test(compiled.getNodeBuilderState().vertexShader),
      'Matrix shader array follows the first draw count instead of the pool capacity')
    mesh.count = 800
    e.renderer.render()
    assert(mesh.count === 800, 'Shader preparation changed the draw count')
    record({ name: 'instanced-matrix-capacity', firstDrawCount: 1, nextDrawCount: 800, compiledCapacity: 900 })
  } finally {
    objects.createRenderObject = create
    e.scene.remove(mesh)
    mesh.dispose()
  }
}
async function frames(e, count = 24) {
  await new Promise((resolve, reject) => {
    e.renderer.instance.setAnimationLoop((timestamp) => {
      try {
        e.update(timestamp)
        if (--count === 0) { e.renderer.instance.setAnimationLoop(null); resolve() }
      } catch (error) { e.renderer.instance.setAnimationLoop(null); reject(error) }
    })
  })
}
async function disposeAndRecord(e, name) {
  await e.renderer.instance.resolveTimestampsAsync()
  const before = { ...e.renderer.instance.info.memory }
  let afterUsers
  const dispose = e.renderer.dispose.bind(e.renderer)
  e.renderer.dispose = () => {
    e.renderer.disposePipeline()
    afterUsers = { ...e.renderer.instance.info.memory }
    dispose()
  }
  e.dispose()
  e.dispose()
  assert(Object.keys(e.resources.items).length === 0, 'Loaded resources retained after dispose')
  record({ name, before, afterUsers, afterBackend: { ...e.renderer.instance.info.memory } })
}

document.querySelector('#run').addEventListener('click', async () => {
  const ppEnabled = worldConfig.postProcessing.enabled
  const tiltEnabled = worldConfig.postProcessing.tiltShift.enabled
  const brick = sources.find(s => s.name === 'brick2x2Model')
  const noise = sources.find(s => s.name === 'waterNoiseTexture')
  const brickPath = brick.path
  const noisePath = noise.path
  document.querySelector('#run').disabled = true
  records.length = 0
  output.textContent = 'Running'
  try {
    worldConfig.postProcessing.enabled = false
    const e = new Experience(canvas)
    try {
      await e.init()
      e.world.playerAircraft.input.dispose()
      validateMatrixCapacity(e)
      const cameraPosition = e.worldCamera.instance.position.clone()
      const cameraTarget = e.worldCamera.controls.target.clone()
      const memories = []
      const snapshots = []
      const retiredWorlds = []
      for (let cycle = 0; cycle < 5; cycle++) {
        await frames(e, 120)
        memories.push({ ...e.renderer.instance.info.memory })
        snapshots.push({ position: e.world.playerAircraft.state.position.toArray(), camera: e.worldCamera.instance.position.toArray(), target: e.worldCamera.controls.target.toArray(), chunkCenter: e.world.terrainChunkManager.centerCoord,
          slots: e.world.terrainChunkManager.slots.map(s => ({ coord: s.coord, terrainCapacity: s.terrainRenderer.mesh?.instanceMatrix.count, terrainCount: s.terrainRenderer.mesh?.count, water: s.waterRenderer.instanceCount })) })
        e.world.dispose()
        retiredWorlds.push({ ...e.renderer.instance.info.memory })
        if (cycle < 4) {
          e.worldCamera.instance.position.copy(cameraPosition)
          e.worldCamera.lookAt(cameraTarget)
          e.world = new World(e)
          e.world.build()
          e.world.playerAircraft.input.dispose()
          await e.world.warmupPrefabPipelines(e.renderer.instance, e.worldCamera.instance, () => e.renderer.render())
        }
      }
      record({ name: 'five-world-cycles', memories, snapshots, retiredWorlds })
      assert(retiredWorlds.every(m => m.geometries === retiredWorlds[0].geometries && m.textures === retiredWorlds[0].textures
        && m.renderTargets === retiredWorlds[0].renderTargets && m.attributes === retiredWorlds[0].attributes
        && m.attributesSize === retiredWorlds[0].attributesSize && m.uniformBuffers === retiredWorlds[0].uniformBuffers
        && m.programs === retiredWorlds[0].programs), 'Retired World retains GPU resources')
      await disposeAndRecord(e, 'default-experience-disposal')
    } finally { e.dispose() }

    worldConfig.postProcessing.enabled = true
    const post = new Experience(canvas)
    try {
      await post.init()
      post.world.playerAircraft.input.dispose()
      await frames(post)
      assert(post.renderer.renderPipeline.needsUpdate === false, 'Pipeline did not render')
      post.renderer.setTiltShiftEnabled(false)
      assert(post.renderer.renderPipeline.needsUpdate === true, 'Toggle did not invalidate pipeline')
      post.renderer.render()
      assert(post.renderer.renderPipeline.needsUpdate === false, 'New output graph did not render')
      const targets = new Set()
      for (const node of post.renderer.pipelineNodes) {
        if (node.renderTarget) targets.add(node.renderTarget)
        if (node._renderTargetEdges) {
          targets.add(node._renderTargetEdges); targets.add(node._renderTargetWeights); targets.add(node._renderTargetBlend)
        }
      }
      const blur = post.renderer.tiltShiftEffect.blurNode
      targets.add(blur._horizontalRT); targets.add(blur._verticalRT)
      if (blur.textureNode.isRTTNode) targets.add(blur.textureNode.renderTarget)
      let freed = 0
      targets.forEach(target => target.addEventListener('dispose', () => freed++))
      post.renderer.attachPipeline(post.scene, post.worldCamera.instance)
      assert(freed === targets.size, 'Reattach leaked render targets')
      await frames(post)
      record({ name: 'postprocessing-toggle-and-reattach', ownedTargets: targets.size, disposedTargets: freed })
      await disposeAndRecord(post, 'postprocessing-experience-disposal')
    } finally { post.dispose() }

    worldConfig.postProcessing.enabled = false
    noise.path = 'texture/validation-missing-optional.png'
    const optional = new Experience(canvas)
    try {
      await optional.init()
      optional.world.playerAircraft.input.dispose()
      await frames(optional)
      assert(optional.resources.errors.waterNoiseTexture, 'Optional failure not recorded')
      assert(optional.world.terrainChunkManager.activeSlots.size === 9, 'Optional failure blocked world')
      record({ name: 'optional-failure', worldLoaded: true, noiseFallback: !optional.world.materials.waterMaterial.userData.waterNoiseTexture })
      await disposeAndRecord(optional, 'optional-experience-disposal')
    } finally { optional.dispose(); noise.path = noisePath }

    brick.path = 'model/terrain/validation-missing-required.glb'
    const originalDispose = Experience.prototype.dispose
    let failedExperience
    Experience.prototype.dispose = function () { failedExperience = this; return originalDispose.call(this) }
    try { await bootstrap(canvas) }
    finally { Experience.prototype.dispose = originalDispose }
    assert(failedExperience?.disposed && failedExperience.resources.disposed, 'Bootstrap did not clean failed startup')
    assert(!failedExperience.world.brickGeometry && failedExperience.world.children.length === 0, 'Failed startup built a World')
    record({ name: 'required-failure-bootstrap', disposed: true, itemsRetained: Object.keys(failedExperience.resources.items).length })
    output.textContent += '\nALL CHECKS PASSED'
  } catch (error) {
    record({ name: 'failure', error: error.stack })
  } finally {
    brick.path = brickPath
    noise.path = noisePath
    worldConfig.postProcessing.enabled = ppEnabled
    worldConfig.postProcessing.tiltShift.enabled = tiltEnabled
    document.querySelector('#run').disabled = false
  }
})
