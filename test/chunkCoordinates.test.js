import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import {
  boundsIntersect,
  coordsEqual,
  getCameraWorldBounds,
  getChunkBounds,
  getChunkWindowCoords,
  getPlayerPrefabWindowCoords,
  getPrefetchChunkCoord,
  getRenderChunkCoord,
  getRenderChunkKey,
  getRenderChunkOrigin,
  getRenderChunkWorldPosition,
  getWorldBlockFromPosition,
  parseRenderChunkKey,
  toLocalCell
} from '../src/world/chunks/chunkCoordinates.js'

function assertClose(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be close to ${expected}`)
}

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

test('offsets render chunk world position for debug spacing', () => {
  const chunkSize = 64
  const cellSize = 0.2
  const pitch = chunkSize * cellSize

  assert.deepEqual(
    getRenderChunkWorldPosition({ x: 0, z: 0 }, chunkSize, cellSize, 0),
    { x: 0, z: 0 }
  )
  assert.deepEqual(
    getRenderChunkWorldPosition({ x: 1, z: 0 }, chunkSize, cellSize, 2),
    { x: pitch + 2, z: 0 }
  )
  assert.deepEqual(
    getRenderChunkWorldPosition({ x: -1, z: 2 }, chunkSize, cellSize, 4),
    { x: -(pitch + 4), z: (pitch + 4) * 2 }
  )
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

test('builds stable chunk window coords with cardinal neighbors before diagonals', () => {
  assert.deepEqual(getChunkWindowCoords({ x: 0, z: 0 }, 1), [
    { x: 0, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: -1 },
    { x: 0, z: 1 },
    { x: 1, z: 0 },
    { x: -1, z: -1 },
    { x: -1, z: 1 },
    { x: 1, z: -1 },
    { x: 1, z: 1 }
  ])

  assert.deepEqual(getChunkWindowCoords({ x: -2, z: 3 }, 1)[0], { x: -2, z: 3 })
  assert.equal(getChunkWindowCoords({ x: -2, z: 3 }, 1).length, 9)
})

test('builds player prefab 2x2 window from local chunk half', () => {
  assert.deepEqual(getPlayerPrefabWindowCoords({ x: 32, z: 32 }, 32), [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: 1, z: 1 }
  ])

  assert.deepEqual(getPlayerPrefabWindowCoords({ x: 48, z: 48 }, 32), [
    { x: 1, z: 1 },
    { x: 2, z: 1 },
    { x: 1, z: 2 },
    { x: 2, z: 2 }
  ])

  assert.deepEqual(getPlayerPrefabWindowCoords({ x: -1, z: -17 }, 32), [
    { x: -1, z: -2 },
    { x: 0, z: -2 },
    { x: -1, z: -1 },
    { x: 0, z: -1 }
  ])
})

test('computes padded chunk world bounds', () => {
  const bounds = getChunkBounds({ x: 2, z: -1 }, 64, 0.2, 0.4)
  assertClose(bounds.minX, 25.2)
  assertClose(bounds.maxX, 38.8)
  assertClose(bounds.minZ, -13.2)
  assertClose(bounds.maxZ, 0.4)
})

test('detects xz bounds intersections', () => {
  const chunk = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }
  assert.equal(boundsIntersect(chunk, { minX: 9, maxX: 12, minZ: 2, maxZ: 4 }), true)
  assert.equal(boundsIntersect(chunk, { minX: 11, maxX: 12, minZ: 2, maxZ: 4 }), false)
  assert.equal(boundsIntersect(chunk, { minX: 2, maxX: 4, minZ: -4, maxZ: -1 }), false)
})

test('bounds intersection tolerates floating point edge contact', () => {
  const bounds = getChunkBounds({ x: 2, z: -1 }, 64, 0.2, 0.4)
  assert.equal(
    boundsIntersect(bounds, { minX: 0, maxX: 100, minZ: 0.4, maxZ: 1 }),
    true
  )
})

test('computes conservative orthographic camera xz bounds', () => {
  const camera = {
    isOrthographicCamera: true,
    left: -4,
    right: 4,
    top: 3,
    bottom: -3,
    zoom: 2,
    position: { x: 10, z: 20 }
  }

  assert.deepEqual(getCameraWorldBounds(camera, 1), {
    minX: 5,
    maxX: 15,
    minZ: 16,
    maxZ: 24
  })
})

test('expands orthographic camera bounds when zoomed out', () => {
  const camera = {
    isOrthographicCamera: true,
    left: -4,
    right: 4,
    top: 3,
    bottom: -3,
    zoom: 0.5,
    position: { x: 10, z: 20 }
  }

  assert.deepEqual(getCameraWorldBounds(camera, 1), {
    minX: 1,
    maxX: 19,
    minZ: 13,
    maxZ: 27
  })
})

test('projects angled orthographic camera bounds onto the ground plane', () => {
  const camera = new THREE.OrthographicCamera(-7.5, 7.5, 7.5, -7.5, 0.1, 200)
  camera.position.set(40, 40, 40)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)

  const bounds = getCameraWorldBounds(camera, 0)

  assert.equal(bounds.minX <= 0 && bounds.maxX >= 0, true)
  assert.equal(bounds.minZ <= 0 && bounds.maxZ >= 0, true)
})
