import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three/webgpu'
import { worldConfig } from '../src/world/WorldConfig.js'
import ChunkColumnTransition from '../src/world/chunks/ChunkColumnTransition.js'
import VoxelClouds from '../src/world/chunks/VoxelClouds.js'
import VoxelTerrainPlaceholder from '../src/world/chunks/VoxelTerrainPlaceholder.js'
import { getChunkWindowCoords, getRenderChunkKey } from '../src/world/chunks/chunkCoordinates.js'
import { createCloudLayerGeometry } from '../src/world/chunks/cloudLayerGeometry.js'

function fixture(t) {
  const config = structuredClone(worldConfig)
  // Both LODs have clipped edge tiles, and some fine tiles straddle coarse boundaries.
  config.chunks.size = 13
  config.chunks.placeholder.cellSpan = 4
  const p = new VoxelTerrainPlaceholder({ config, parentGroup: new THREE.Group() })
  t.after(() => p.dispose())
  p.sampleHeight = x => THREE.MathUtils.euclideanModulo(x, 13) < 6 ? 5 : 1
  const center = { x: 0, z: 0 }
  const slots = new Map(getChunkWindowCoords(center, 1).map(c => [getRenderChunkKey(c), {}]))
  const fill = () => {
    for (let i = 0; i < 16; i++) p.update(center, slots)
  }
  return { p, config, center, slots, fill }
}

test('stepped midground seals the perimeter, emits only exposed internal walls and covers clipped negative chunks', (t) => {
  const { p, config, fill } = fixture(t)
  fill()
  const patch = p.midground.patches.get('-2:0')
  const { geometry } = patch.mesh
  const pos = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const { cellSize } = config.terrain
  assert.equal(patch.mesh.position.x, -26 * cellSize)
  assert.equal(geometry.index.count / 6, 9 + 12 + 3, 'nine tops, twelve perimeter skirts and three cliffs')
  let area = 0, cliffs = 0
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3()
  for (let i = 0; i < geometry.index.count; i += 3) {
    const index = geometry.index.getX(i)
    a.fromBufferAttribute(pos, index)
    b.fromBufferAttribute(pos, geometry.index.getX(i + 1)).sub(a)
    c.fromBufferAttribute(pos, geometry.index.getX(i + 2)).sub(a)
    b.cross(c)
    n.fromBufferAttribute(normal, index)
    assert.ok(n.dot(b) > 0, 'triangles face outward with backface culling')
    if (n.y === 1) area += b.y / 2
    if (n.x === 1 && Math.abs(a.x - 6 * cellSize) < 1e-6) cliffs++
  }
  assert.ok(Math.abs(area - (13 * cellSize) ** 2) < 1e-5)
  assert.equal(cliffs, 6)
  const colors = patch.palette.slice()
  config.chunks.placeholder.midground.mode = 'boxes'
  fill()
  const control = p.midground.patches.get('-2:0')
  assert.ok(control.mesh.isInstancedMesh)
  assert.deepEqual(control.tiles, patch.tiles, 'changing geometry does not change the sampled relief')
  assert.deepEqual(control.palette, colors)
})

test('budgeted replacements keep coarse cover, follow the trailing detailed columns and survive reversals', (t) => {
  const { p, config, center, slots, fill } = fixture(t)
  const tilesPerCoarseChunk = 16
  p.update(center, slots, -1)
  assert.equal(p.midground.patches.size, 0)
  assert.equal(p.mesh.count, 40 * tilesPerCoarseChunk, 'all unprepared terrain still has a visible fallback')
  p.update(center, slots)
  assert.equal(p.midground.patches.size, 1)
  fill()
  assert.equal(p.mesh.count, 24 * tilesPerCoarseChunk, 'no hidden middle-ring boxes submitted in steady state')
  const patch = p.midground.patches.get('2:0')
  const version = patch.cover.version
  p.update(center, slots)
  assert.equal(patch.cover.version, version, 'stationary patches do not upload reveal data')
  const transition = new ChunkColumnTransition({ chunkSize: 13, cellSize: config.terrain.cellSize })
  transition.start(1, { x: 1, z: 0 })
  slots.set('2:0', { columnTransition: transition })
  const next = { x: 1, z: 0 }
  p.update(next, slots)
  assert.equal(p.midground.patches.get('2:0'), patch)
  transition.update(0.48)
  p.update(next, slots)
  assert.ok(patch.cover.array.some(v => v < 1))
  assert.ok(patch.cover.array.some(v => v === 1), 'trailing columns are still covered')
  transition.update(1)
  p.update(next, slots)
  assert.equal(patch.mesh.visible, false)
  slots.delete('2:0')
  p.update(center, slots)
  assert.ok(patch.mesh.visible && patch.cover.array.every(v => v === 1), 'turning back restores the full mesh')
  let disposed = false
  patch.mesh.geometry.addEventListener('dispose', () => { disposed = true })
  config.chunks.placeholder.midground.mode = 'coarse'
  p.update(center, slots)
  assert.ok(disposed && !patch.mesh.parent)
  assert.equal(p.mesh.count, p.capacity, 'original-box comparison restores the entire legacy batch')
})

test('a rectangular cloud mask generates one merged quad for each exposed side', (t) => {
  const mask = new Uint8Array(12).fill(1)
  const geometry = createCloudLayerGeometry({ mask, width: 4, depth: 3, cellSize: 0.5, thickness: 0.75 })
  t.after(() => geometry.dispose())
  assert.equal(geometry.index.count, 36)
  geometry.computeBoundingBox()
  assert.deepEqual(geometry.boundingBox.min.toArray(), [0, 0, 0])
  assert.deepEqual(geometry.boundingBox.max.toArray(), [2, 0.75, 1.5])
  assert.ok(mask.every(cell => cell === 1), 'meshing preserves the cached occupancy')
})

test('cloud geometry stays cached until the window moves and retains world-aligned masks', (t) => {
  const { p, config, center } = fixture(t)
  const clouds = new VoxelClouds({ config, parentGroup: p.parentGroup, placeholder: p })
  t.after(() => clouds.dispose())
  clouds.update(center)
  assert.equal(clouds.chunkMasks.size, 40)
  assert.equal(clouds.chunkMasks.has('0:0'), false, 'detailed terrain has a clear opening')
  const geometry = clouds.mesh.geometry
  const retained = clouds.chunkMasks.get('2:2')
  clouds.update(center)
  assert.equal(clouds.mesh.geometry, geometry)

  let disposed = false
  geometry.addEventListener('dispose', () => { disposed = true })
  clouds.update({ x: 1, z: 0 })
  assert.equal(clouds.chunkMasks.size, 40)
  assert.equal(clouds.chunkMasks.get('2:2'), retained)
  assert.ok(disposed)
  assert.equal(clouds.mesh.position.x, -2 * clouds.chunkSpan)
  assert.equal(clouds.mesh.position.y, config.chunks.clouds.baseHeight)
})

test('low cloud cells clear high terrain in pending and rendered midground', (t) => {
  const { p, config, center, slots, fill } = fixture(t)
  config.chunks.clouds.baseHeight = 0.9
  p.sampleHeight = x => THREE.MathUtils.euclideanModulo(x, 13) < 6 ? 8 : 1
  p.update(center, slots, -1)
  const clouds = new VoxelClouds({ config, parentGroup: p.parentGroup, placeholder: p })
  t.after(() => clouds.dispose())
  clouds.seed = config.seed
  clouds.noise2D = () => 1
  clouds.update(center)
  const pending = clouds.chunkMasks.get('-2:0').slice()
  assert.deepEqual([...pending], [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1])

  fill()
  assert.ok(p.midground.patches.has('-2:0'))
  clouds.reset()
  clouds.update(center)
  assert.deepEqual(clouds.chunkMasks.get('-2:0'), pending)
})
