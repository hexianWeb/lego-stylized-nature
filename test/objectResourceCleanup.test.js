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
