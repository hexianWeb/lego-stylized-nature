import test from 'node:test'
import assert from 'node:assert/strict'
import {
  coordsEqual,
  getPrefetchChunkCoord,
  getRenderChunkCoord,
  getRenderChunkKey,
  getRenderChunkOrigin,
  getWorldBlockFromPosition,
  parseRenderChunkKey,
  toLocalCell
} from '../src/world/chunks/chunkCoordinates.js'

test('maps world blocks to signed render chunk coordinates', () => {
  assert.deepEqual(getRenderChunkCoord(0, 0, 32), { x: 0, z: 0 })
  assert.deepEqual(getRenderChunkCoord(31, 31, 32), { x: 0, z: 0 })
  assert.deepEqual(getRenderChunkCoord(32, 64, 32), { x: 1, z: 2 })
  assert.deepEqual(getRenderChunkCoord(-1, -1, 32), { x: -1, z: -1 })
})

test('builds stable chunk keys and origins', () => {
  const coord = { x: 4, z: -2 }
  assert.equal(getRenderChunkKey(coord), '4:-2')
  assert.deepEqual(parseRenderChunkKey('4:-2'), coord)
  assert.deepEqual(getRenderChunkOrigin(coord, 32), { x: 128, z: -64 })
})

test('converts world position to block coordinates', () => {
  assert.deepEqual(getWorldBlockFromPosition(6.4, 3.1, 0.2), { x: 32, z: 15 })
})

test('computes local cell coordinates inside a chunk', () => {
  const origin = getRenderChunkOrigin({ x: 2, z: 1 }, 32)
  assert.deepEqual(toLocalCell(origin, 70, 40), { x: 6, z: 8 })
})

test('prefetches adjacent chunk when near boundary threshold', () => {
  const activeCoord = { x: 2, z: 2 }
  const chunkSize = 32
  const threshold = 0.2
  const edge = chunkSize * threshold

  assert.deepEqual(
    getPrefetchChunkCoord(activeCoord, { x: edge - 1, z: 16 }, chunkSize, threshold),
    { x: 1, z: 2 }
  )
  assert.deepEqual(
    getPrefetchChunkCoord(activeCoord, { x: 16, z: chunkSize - edge }, chunkSize, threshold),
    { x: 2, z: 3 }
  )
  assert.deepEqual(
    getPrefetchChunkCoord(activeCoord, { x: edge - 1, z: chunkSize - edge }, chunkSize, threshold),
    { x: 1, z: 3 }
  )
  assert.deepEqual(
    getPrefetchChunkCoord(activeCoord, { x: 16, z: 16 }, chunkSize, threshold),
    activeCoord
  )
})

test('coordsEqual compares chunk coordinates', () => {
  assert.equal(coordsEqual({ x: 1, z: 2 }, { x: 1, z: 2 }), true)
  assert.equal(coordsEqual({ x: 1, z: 2 }, { x: 1, z: 3 }), false)
})
