import assert from 'node:assert/strict'
import test from 'node:test'
import TerrainMinimap from '../src/ui/TerrainMinimap.js'
import HeightField from '../src/world/terrain/HeightField.js'
import TerrainMap from '../src/world/terrain/TerrainMap.js'

function makeCanvas() {
  const calls = []
  const context = new Proxy({}, {
    get(target, property) {
      return target[property] ?? ((...args) => calls.push([property, ...args]))
    },
  })
  return {
    calls,
    width: 0,
    height: 0,
    clientWidth: 248,
    clientHeight: 180,
    getContext: () => context,
    ownerDocument: { createElement: () => makeCanvas() },
  }
}

function makeMap(width, depth, origin = { x: 0, z: 0 }, halo = 0) {
  return new TerrainMap({
    heightField: new HeightField(width, depth),
    origin,
    halo,
    biomeCells: Array.from({ length: depth }, () => Array.from({ length: width }, () => ({ biomeId: 'forest' }))),
    surfaceCells: Array.from({ length: depth }, () => Array.from({ length: width }, () => ({ height: 12 }))),
  })
}

function makeExperience(position) {
  return {
    world: {
      playerAircraft: { state: { position, yaw: 0 } },
      config: { terrain: { cellSize: 2, maxHeight: 32 }, chunks: { size: 4 } },
      terrainGenerator: { generate: () => assert.fail('The minimap must not generate terrain') },
    },
  }
}

test('minimap samples negative chunk coordinates with halo and world cell size', () => {
  const experience = makeExperience({ x: -3, z: -1 })
  const map = makeMap(6, 6, { x: -4, z: -4 }, 1)
  map.biomeCells[4][3].biomeId = 'wetland'
  experience.world.terrainChunkManager = { activeSlots: new Map([['-1,-1', { terrainMap: map }]]) }
  const minimap = new TerrainMinimap(makeCanvas(), experience)
  assert.equal(minimap.getCurrentBiomeId(), 'wetland')
  experience.world.playerAircraft.state.position.x = 0
  assert.equal(minimap.getCurrentBiomeId(), null, 'Halo samples must not extend the loaded world')
})

test('minimap supports a rectangular full map', () => {
  const experience = makeExperience({ x: 2, z: 12 })
  const map = makeMap(4, 8)
  map.biomeCells[6][1].biomeId = 'desert'
  experience.world.terrainMap = map
  const minimap = new TerrainMinimap(makeCanvas(), experience)
  assert.equal(minimap.getCurrentBiomeId(), 'desert')
  experience.world.playerAircraft.state.position.z = 16
  assert.equal(minimap.getCurrentBiomeId(), null)
})

test('minimap caches terrain between updates while drawing current heading', () => {
  const experience = makeExperience({ x: 4, z: 4 })
  experience.world.terrainMap = makeMap(16, 16)
  const canvas = makeCanvas()
  const minimap = new TerrainMinimap(canvas, experience)
  minimap.update()
  const mapDrawCount = minimap.mapCanvas.calls.length
  experience.world.playerAircraft.state.yaw = Math.PI / 2
  minimap.update()
  assert.equal(minimap.mapCanvas.calls.length, mapDrawCount)
  assert.deepEqual(canvas.calls.filter(call => call[0] === 'rotate').at(-1), ['rotate', Math.PI / 2])
  assert.ok(canvas.calls.some(call => call[0] === 'drawImage'))
  minimap.dispose()
  const canvasDrawCount = canvas.calls.length
  minimap.update()
  assert.equal(canvas.calls.length, canvasDrawCount)
})

test('minimap follows its displayed size when expanded and collapsed', () => {
  const canvas = makeCanvas()
  const minimap = new TerrainMinimap(canvas, makeExperience({ x: 0, z: 0 }))
  assert.equal(minimap.width, 248)
  assert.equal(minimap.height, 180)

  canvas.clientWidth = 598
  canvas.clientHeight = 420
  minimap.update()
  assert.equal(minimap.width, 598)
  assert.equal(minimap.height, 420)
  assert.equal(canvas.width, Math.round(598 * minimap.dpr))
  assert.equal(canvas.height, Math.round(420 * minimap.dpr))

  canvas.clientWidth = 174
  canvas.clientHeight = 140
  minimap.update()
  assert.equal(minimap.width, 174)
  assert.equal(minimap.height, 140)
  assert.equal(canvas.width, Math.round(174 * minimap.dpr))
  assert.equal(canvas.height, Math.round(140 * minimap.dpr))
  minimap.dispose()
})
