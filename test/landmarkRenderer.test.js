import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as THREE from 'three/webgpu'
import LandmarkRenderer, { createLandmarkAssets } from '../src/world/landmarks/LandmarkRenderer.js'
import { LANDMARK_DEFAULTS, SUN_GATE } from '../src/world/landmarks/landmarkConfig.js'
import ChunkRenderSlot from '../src/world/chunks/ChunkRenderSlot.js'
import ChunkManager from '../src/world/chunks/ChunkManager.js'
import TerrainGenerator from '../src/world/terrain/TerrainGenerator.js'
import BiomeMaskGenerator from '../src/world/biomes/BiomeMaskGenerator.js'
import BiomeRegistry from '../src/world/biomes/BiomeRegistry.js'
import { worldConfig } from '../src/world/WorldConfig.js'

const file = await readFile(new URL('../public/model/landmarks/desert-sun-gate.glb', import.meta.url))
const gltf = await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '')
const resources = { items: { [SUN_GATE.resource]: gltf } }
const config = { terrain: { cellSize: 0.2 }, landmarks: { ...LANDMARK_DEFAULTS } }
const map = {
  origin: { x: 72, z: 360 },
  landmarks: [{ id: 'test-gate', type: SUN_GATE.id, worldX: 21.6, worldZ: 79.4, baseY: 2.02, rotation: 0, scale: 7.6 / 11.47 }],
}

test('the shipped GLB has four bounded parts and an open passage at actual flight height', () => {
  const assets = createLandmarkAssets(resources)
  assert.equal(assets.parts.length, 4)
  assert.equal(new Set(assets.parts.map(part => part.material)).size, 4)
  const renderer = new LandmarkRenderer({ config, assets })
  renderer.build(map)
  renderer.update(1, true)
  renderer.group.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(renderer.group)
  assert.ok(Math.abs(box.min.y - 2.02) < 1e-5)
  assert.ok(Math.abs(box.max.y - 9.62) < 1e-4)
  const x = map.landmarks[0].worldX - map.origin.x * 0.2
  const z = map.landmarks[0].worldZ - map.origin.z * 0.2
  for (const offset of [-0.7, 0, 0.7]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x + offset, 5.5, z + 8), new THREE.Vector3(0, 0, -1))
    assert.equal(ray.intersectObjects(renderer.meshes).length, 0)
  }
  assert.ok(assets.parts.every(part => part.material.maskNode === part.material.maskShadowNode && !part.material.transparent))
  renderer.dispose()
  assets.dispose()
})

test('landmark waits for settled terrain, rises as a whole and recycles all instance buffers', () => {
  const assets = createLandmarkAssets(resources)
  const renderer = new LandmarkRenderer({ config, assets })
  const fixed = [...renderer.meshes]
  renderer.build(map)
  const matrix = Array.from(renderer.meshes[0].instanceMatrix.array)
  renderer.update(3, false)
  assert.equal(renderer.progress, 0)
  assert.equal(renderer.group.visible, false)
  renderer.update(0.2, true)
  assert.ok(renderer.progress > 0 && renderer.progress < 1)
  assert.ok(renderer.group.position.y < 0)
  assert.deepEqual(Array.from(renderer.meshes[0].instanceMatrix.array), matrix, 'reveal translates the group without deforming the model')
  renderer.update(1, true)
  assert.equal(renderer.progress, 1)
  assert.equal(Math.abs(renderer.group.position.y), 0)
  renderer.setVisible(false)
  assert.equal(renderer.group.visible, false)
  renderer.setVisible(true)
  assert.equal(renderer.group.visible, true)
  renderer.build({ origin: map.origin, landmarks: [] })
  assert.ok(renderer.meshes.every(mesh => mesh.count === 0))
  renderer.build(map)
  assert.deepEqual(renderer.meshes, fixed)
  assert.equal(renderer.progress, 0)
  renderer.restartReveal()
  assert.equal(renderer.group.visible, false)
  renderer.dispose()
  assets.dispose()
})

test('slots keep landmark meshes out of the original column scaling and share asset ownership', () => {
  const assets = createLandmarkAssets(resources)
  const landmark = new LandmarkRenderer({ config, assets })
  const other = new LandmarkRenderer({ config, assets })
  let geometryDisposals = 0
  let materialDisposals = 0
  for (const part of assets.parts) {
    part.geometry.addEventListener('dispose', () => geometryDisposals++)
    part.material.addEventListener('dispose', () => materialDisposals++)
  }
  const slot = new ChunkRenderSlot({ index: 0, chunkSize: 72, cellSize: 0.2,
    terrainRenderer: { group: new THREE.Group(), build() {}, dispose() {} },
    heightfieldAO: { build() {} }, landmarkRenderer: landmark,
  })
  slot.populate({ coord: { x: 1, z: 5 }, terrainMap: map, placements: [] })
  const original = Array.from(landmark.meshes[0].instanceMatrix.array)
  slot.startLoading({ x: 1, z: 0 }, { columnDuration: 0.4, waveDuration: 0.65 })
  assert.equal(slot.columnTransition.meshStates.size, 0, 'landmarks use their own whole-model reveal')
  slot.updateTransition(0.5)
  assert.equal(landmark.progress, 0)
  assert.deepEqual(Array.from(landmark.meshes[0].instanceMatrix.array), original)
  slot.updateTransition(0.6)
  assert.ok(landmark.progress > 0)
  slot.dispose()
  assert.equal(geometryDisposals, 0)
  assert.equal(materialDisposals, 0)
  other.build(map)
  other.update(1, true)
  assert.equal(other.group.visible, true)
  other.dispose()
  assets.dispose()
  assert.equal(materialDisposals, 4)
  assert.equal(geometryDisposals, 0, 'loaded GLB geometry is owned by Resources')
})

test('travelling away and back restores the same seeded landmark using the original nine-slot mesh pool', () => {
  const world = structuredClone(worldConfig)
  world.chunks.placeholder.enabled = false
  const assets = createLandmarkAssets(resources)
  const registry = new BiomeRegistry()
  const generator = new TerrainGenerator({ config: world, biomeRegistry: registry, biomeMaskGenerator: new BiomeMaskGenerator(world) })
  const manager = new ChunkManager({ config: world, terrainGenerator: generator,
    layeredTerrainBuilder: { buildPlacements: () => [] }, parentGroup: new THREE.Group(),
    brickColorResolver: {}, createSlot: index => new ChunkRenderSlot({ index, chunkSize: 72, cellSize: 0.2,
      terrainRenderer: { group: new THREE.Group(), build() {}, dispose() {} }, heightfieldAO: { build() {} },
      landmarkRenderer: new LandmarkRenderer({ config: world, assets }),
    }),
  })
  const pooled = manager.slots.flatMap(slot => slot.landmarkRenderer.meshes)
  const visit = (x, z) => { for (let frame = 0; frame < 110; frame++) manager.update(x, z, null, 1 / 60) }
  visit(21.66, 79.4)
  const first = [...manager.activeSlots.values()].flatMap(slot => slot.terrainMap.landmarks ?? []).find(site => site.worldX > 20 && site.worldZ > 79)
  assert.ok(first)
  visit(-100, -100)
  assert.ok(manager.slots.every(slot => !slot.landmarkRenderer.site || slot.landmarkRenderer.site.id !== first.id))
  visit(21.66, 79.4)
  const returning = [...manager.activeSlots.values()].find(slot => slot.landmarkRenderer.site?.id === first.id)
  assert.ok(returning?.landmarkRenderer.group.visible)
  assert.deepEqual(returning.landmarkRenderer.site, first)
  assert.deepEqual(manager.slots.flatMap(slot => slot.landmarkRenderer.meshes), pooled)
  assert.equal(manager.slots.length, 9)
  manager.dispose()
  assets.dispose()
})
