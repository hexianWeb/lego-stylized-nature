import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three/webgpu'
import { worldConfig } from '../src/world/WorldConfig.js'
import ChunkColumnTransition from '../src/world/chunks/ChunkColumnTransition.js'
import VoxelTerrainPlaceholder from '../src/world/chunks/VoxelTerrainPlaceholder.js'
import { getChunkWindowCoords, getRenderChunkKey } from '../src/world/chunks/chunkCoordinates.js'

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
  const { cellSize, layerHeight } = config.terrain
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
  assert.ok(Math.abs(patch.cloudTops[1] - 6 * layerHeight) < 1e-6, 'cloud clearance includes both fine tiles under one coarse tile')
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
