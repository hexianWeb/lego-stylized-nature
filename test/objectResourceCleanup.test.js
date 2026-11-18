import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { installObjectResourceCleanup } from '../src/renderer/installObjectResourceCleanup.js'

function fixture() {
  const freed = []
  const renderer = {
    _attributes: { delete: attribute => freed.push(attribute) },
    _objects: {
      createRenderObject(object, attributes) {
        const renderObject = {
          object,
          attributes,
          disposalCount: 0,
          getNodeBuilderState() { return { matrixCount: object.count } },
          getAttributes() { return this.attributes },
          onDispose() { renderObject.disposalCount++ },
          dispose() { this.onDispose() }
        }
        return renderObject
      }
    }
  }
  return { renderer, freed, cleanup: installObjectResourceCleanup(renderer) }
}

test('mesh disposal releases derived instance buffers and all passes without freeing shared geometry', () => {
  const { renderer, freed } = fixture()
  const geometry = new THREE.BoxGeometry()
  const material = new THREE.MeshBasicMaterial()
  const mesh = new THREE.InstancedMesh(geometry, material, 2048)
  mesh.setColorAt(0, new THREE.Color('white'))
  const matrix = new THREE.InterleavedBufferAttribute(new THREE.InstancedInterleavedBuffer(mesh.instanceMatrix.array, 16), 4, 0)
  const color = new THREE.InstancedBufferAttribute(mesh.instanceColor.array, 3)
  const other = new THREE.InstancedMesh(geometry, material, 2048)
  const shared = geometry.attributes.position
  let sourceDisposals = 0
  geometry.addEventListener('dispose', () => sourceDisposals++)
  material.addEventListener('dispose', () => sourceDisposals++)
  const scene = renderer._objects.createRenderObject(mesh, [shared, matrix, color])
  const shadow = renderer._objects.createRenderObject(mesh, [shared, matrix])
  const live = renderer._objects.createRenderObject(other, [shared, other.instanceMatrix])

  mesh.dispose()
  mesh.dispose()

  assert.deepEqual(new Set(freed), new Set([matrix, color]))
  assert.equal(freed.length, 2)
  assert.equal(scene.disposalCount, 1)
  assert.equal(shadow.disposalCount, 1)
  assert.equal(live.disposalCount, 0)
  assert.equal(sourceDisposals, 0)
})

test('attributes from superseded material variants are still freed when the mesh is disposed', () => {
  const { renderer, freed } = fixture()
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 2)
  const matrix = new THREE.InstancedBufferAttribute(mesh.instanceMatrix.array, 16)
  const previous = renderer._objects.createRenderObject(mesh, [matrix])
  previous.dispose()
  assert.equal(freed.length, 0)
  const current = renderer._objects.createRenderObject(mesh, [matrix])
  mesh.dispose()
  assert.deepEqual(freed, [matrix])
  assert.equal(previous.disposalCount, 1)
  assert.equal(current.disposalCount, 1)
})

test('World group cleanup releases ordinary cloned objects borrowing source materials', () => {
  const { renderer, cleanup } = fixture()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
  const group = new THREE.Group()
  group.add(mesh)
  const renderObject = renderer._objects.createRenderObject(mesh, [mesh.geometry.attributes.position])
  cleanup.releaseGroup(group)
  cleanup.releaseGroup(group)
  assert.equal(renderObject.disposalCount, 1)
})

test('matrix arrays compile for pool capacity while draw count can grow and shrink', () => {
  const { renderer } = fixture()
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 900)
  mesh.count = 12
  const renderObject = renderer._objects.createRenderObject(mesh, [])
  for (const count of [12, 800, 0, 900]) {
    mesh.count = count
    assert.equal(renderObject.getNodeBuilderState().matrixCount, 900)
    assert.equal(mesh.count, count)
  }
  mesh.dispose()
})

test('recycled instance matrices upload the hidden pose on the first main and shadow draw', () => {
  const { renderer } = fixture()
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 2048)
  const source = mesh.instanceMatrix
  const derived = new THREE.InstancedInterleavedBuffer(source.array, 16)
  const attribute = new THREE.InterleavedBufferAttribute(derived, 4, 0)
  const main = renderer._objects.createRenderObject(mesh, [attribute])
  const shadow = renderer._objects.createRenderObject(mesh, [attribute])
  const gpu = source.array.slice()
  let uploadedVersion = derived.version
  const draw = renderObject => {
    // Match Three's geometry-upload-before-node-update ordering.
    const buffer = renderObject.getAttributes()[0].data
    if (buffer.version !== uploadedVersion) {
      if (buffer.updateRanges.length) {
        for (const { start, count } of buffer.updateRanges) {
          gpu.set(buffer.array.subarray(start, start + count), start)
        }
      }
      else gpu.set(buffer.array)
      uploadedVersion = buffer.version
      buffer.clearUpdateRanges()
    }
    return gpu[13]
  }
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(0.5, -3, 0.5)
  mesh.setMatrixAt(0, hidden)
  source.addUpdateRange(0, 16)
  source.needsUpdate = true
  assert.equal(draw(shadow), -3)
  assert.equal(draw(main), -3)
  assert.equal(derived.updateRanges.length, 0)

  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0.5, -1, 0.5))
  source.needsUpdate = true
  assert.equal(draw(main), -1)
  assert.equal(draw(shadow), -1)
  source.clearUpdateRanges()
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0.5, 6, 0.5))
  source.needsUpdate = true
  assert.equal(draw(main), 6)
  mesh.dispose()
  mesh.geometry.dispose()
  mesh.material.dispose()
})

test('async compile builder stages use capacity and restore live count across yields and errors', async () => {
  const { renderer } = fixture()
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 900)
  mesh.count = 12
  const observed = []
  let resume
  const waiting = new Promise(resolve => { resume = resolve })
  renderer._nodes = {
    _createNodeBuilder() {
      return {
        prebuild() { observed.push(mesh.count) },
        flowNodeFromShaderStage() { observed.push(mesh.count) },
        flowNode() { observed.push(mesh.count); throw new Error('stage failed') },
        async buildAsync() {
          this.prebuild()
          this.flowNodeFromShaderStage()
          await waiting
          this.flowNodeFromShaderStage()
          this.flowNode()
        }
      }
    }
  }
  installObjectResourceCleanup(renderer)
  const builder = renderer._nodes._createNodeBuilder({ object: mesh })
  const build = builder.buildAsync()
  assert.equal(mesh.count, 12)
  mesh.count = 800
  resume()
  await assert.rejects(build, /stage failed/)
  assert.deepEqual(observed, [900, 900, 900, 900])
  assert.equal(mesh.count, 800)
})

test('native NodeBuilder async direct setup calls after the fragment yield compile full capacity', async () => {
  const { renderer } = fixture()
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 32)
  mesh.count = 3
  const observed = []
  renderer._nodes = {
    _createNodeBuilder() {
      const builder = new THREE.NodeBuilder(mesh, {}, {})
      builder.prebuild = () => {}
      builder.flowNodes.vertex.push({ build() { observed.push(mesh.count) } })
      builder.flowNode = node => node.build(builder)
      builder.buildCode = () => {}
      builder.buildUpdateNodes = () => {}
      return builder
    }
  }
  installObjectResourceCleanup(renderer)
  const builder = renderer._nodes._createNodeBuilder({ object: mesh })
  const build = builder.buildAsync()
  assert.equal(mesh.count, 3)
  mesh.count = 10
  await build
  assert.deepEqual(observed, [32, 32, 32])
  assert.equal(mesh.count, 10)
})

test('bundled WGSL async builder emits the full matrix capacity for a live pooled mesh', async () => {
  const renderer = new THREE.WebGPURenderer({ canvas: { addEventListener() {}, removeEventListener() {} } })
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardNodeMaterial(), 900)
  mesh.count = 12
  renderer._objects = { createRenderObject() {} }
  renderer._attributes = { delete() {} }
  renderer._nodes = {
    _createNodeBuilder({ object }, material) {
      // Use the bundled builder and TSL objects from the same public import.
      // Mixing src/ and build/ copies gives separate global TSL stack state.
      const builder = new THREE.WGSLNodeBuilder(object, renderer)
      builder.material = material
      builder.context.material = material
      builder.scene = new THREE.Scene()
      builder.camera = new THREE.PerspectiveCamera()
      builder.getUniformBufferLimit = () => 65536
      return builder
    }
  }
  installObjectResourceCleanup(renderer)
  const builder = renderer._nodes._createNodeBuilder({ object: mesh }, mesh.material)
  const build = builder.buildAsync()
  assert.equal(mesh.count, 12)
  await build
  assert.match(builder.vertexShader, /array<\s*mat4x4<f32>,\s*900\s*>/)
  assert.equal(mesh.count, 12)
})
