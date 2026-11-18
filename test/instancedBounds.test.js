import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import WorldMaterials from '../src/world/WorldMaterials.js'
import TerrainBrickRenderer from '../src/world/bricks/TerrainBrickRenderer.js'
import LavaBrickRenderer from '../src/world/bricks/LavaBrickRenderer.js'

const config = { terrain: { width: 2, depth: 1, cellSize: 1, layerHeight: 1 }, water: {} }

test('terrain bounds move with reused instances and handle an empty rebuild', () => {
  const materials = new WorldMaterials()
  const geometry = new THREE.BoxGeometry()
  const renderer = new TerrainBrickRenderer({ config, materials, brickGeometry: geometry })
  const colorResolver = { resolve: () => '#ffffff' }
  renderer.build([{ x: 0, y: 0, z: 0 }], colorResolver)
  const mesh = renderer.mesh
  mesh.computeBoundingBox()
  const firstCenter = mesh.boundingSphere.center.clone()
  const firstColorVersion = mesh.instanceColor.version

  renderer.build([{ x: 20, y: 40, z: 0 }], colorResolver)
  assert.equal(renderer.mesh, mesh)
  assert.notDeepEqual(mesh.boundingSphere.center, firstCenter)
  assert.ok(mesh.boundingSphere.containsPoint(new THREE.Vector3(20.5, 40, 0.5)))
  assert.ok(mesh.boundingBox.containsPoint(new THREE.Vector3(20.5, 40, 0.5)))
  assert.ok(mesh.instanceColor.version > firstColorVersion)
  renderer.build([], colorResolver)
  assert.equal(mesh.count, 0)
  assert.ok(mesh.boundingSphere.isEmpty())
  assert.ok(mesh.boundingBox.isEmpty())
  renderer.dispose()
  materials.dispose()
  geometry.dispose()
})

test('lava bounds update when a reused pool expands and changes height', () => {
  const materials = new WorldMaterials()
  const geometry = new THREE.BoxGeometry()
  const renderer = new LavaBrickRenderer({ config, materials, brickGeometry: geometry })
  let height = 1
  let lavaCount = 1
  const map = { getSurfaceCell: (x) => ({ isLava: x < lavaCount, lavaHeight: height }) }
  renderer.build(map)
  const mesh = renderer.mesh
  mesh.computeBoundingBox()
  height = 30
  lavaCount = 2
  renderer.build(map)
  assert.equal(renderer.mesh, mesh)
  assert.equal(mesh.count, 2)
  assert.ok(mesh.boundingSphere.containsPoint(new THREE.Vector3(1.5, 30, 0.5)))
  assert.ok(mesh.boundingBox.containsPoint(new THREE.Vector3(1.5, 30, 0.5)))
  renderer.dispose()
  materials.dispose()
  geometry.dispose()
})
