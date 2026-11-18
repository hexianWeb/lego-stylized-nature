import test from 'node:test'
import assert from 'node:assert/strict'
import HeightfieldAO from '../src/world/bricks/HeightfieldAO.js'
import LayeredTerrainBuilder from '../src/world/terrain/LayeredTerrainBuilder.js'

function createConfig(overrides = {}) {
  return {
    terrain: {
      waterLevel: -1,
      cellSize: 0.2,
      layerHeight: 0.095,
      ao: {
        enabled: true,
        previewGrayscale: false,
        strength: 1.4,
        min: 0.2,
        sampleDistances: [1, 2, 4, 8],
        distanceFalloff: 0.25,
        creviceScale: 2.5,
        horizonWeight: 0.61,
        creviceWeight: 0.42,
        ...overrides
      }
    }
  }
}

function createTerrainMap(heights, halo = 0) {
  const depth = heights.length
  const width = heights[0].length
  const surfaceCells = heights.map((row) => row.map((height) => ({ height, isWater: false, isLava: false })))
  return {
    halo,
    heightField: { width, depth, get: (x, z) => heights[z][x] },
    getHeight: (x, z) => heights[z][x],
    getSurfaceCell: (x, z) => surfaceCells[z]?.[x],
    getBiomeCell: () => ({})
  }
}

// Ground at height 0 for x < 2, a plateau at height 4 for x >= 2.
const CLIFF = Array.from({ length: 5 }, () => [0, 0, 4, 4, 4])

// Wide map: ground for x < 10, tall plateau (height 9) for x >= 10. Depth padded for diagonals.
function createWideCliff(plateauHeight = 9) {
  const width = 20
  const depth = 17
  return Array.from({ length: depth }, () =>
    Array.from({ length: width }, (_, x) => (x >= 10 ? plateauHeight : 0))
  )
}

function buildFromHeights(heights, config = createConfig(), halo = 0) {
  const terrainMap = createTerrainMap(heights, halo)
  const placements = new LayeredTerrainBuilder({ config }).buildPlacements(terrainMap)
  const ao = new HeightfieldAO({ config }).build(terrainMap, placements)
  const valueAt = (x, y, z) => {
    const index = placements.findIndex((p) => p.x === x && p.y === y && p.z === z)
    assert.notEqual(index, -1, `missing placement ${x},${y},${z}`)
    return ao.get(index)
  }
  return { placements, ao, valueAt }
}

function buildCliff(config = createConfig()) {
  return buildFromHeights(CLIFF, config)
}

test('open tops and exposed plateau edges stay fully visible', () => {
  const { valueAt } = buildCliff()

  assert.equal(valueAt(4, 4, 2), 1)
  assert.equal(valueAt(2, 4, 2), 1)
  // Ground two cells from the cliff is occluded by multi-distance samples.
  assert.ok(valueAt(0, 0, 2) < 1)
})

test('cliff wall darkens toward its foot', () => {
  const { valueAt } = buildCliff()

  const foot = valueAt(2, 1, 2)
  const middle = valueAt(2, 2, 2)
  const upper = valueAt(2, 3, 2)
  assert.ok(foot < middle, `${foot} < ${middle}`)
  assert.ok(middle < upper, `${middle} < ${upper}`)
})

test('ground next to a cliff is occluded by it', () => {
  const { valueAt } = buildCliff()

  assert.ok(valueAt(1, 0, 2) < 1)
})

test('occlusion reaches beyond the adjacent cell and softens with distance', () => {
  const heights = createWideCliff(9)
  const midZ = Math.floor(heights.length / 2)
  const { valueAt } = buildFromHeights(heights)

  const near = valueAt(9, 0, midZ)
  const mid = valueAt(7, 0, midZ)
  const far = valueAt(3, 0, midZ)
  const open = valueAt(0, 0, midZ)

  assert.ok(near < 1, `near should be occluded, got ${near}`)
  assert.ok(near < mid, `${near} < ${mid}`)
  assert.ok(mid < far, `${mid} < ${far}`)
  assert.ok(far <= open, `${far} <= ${open}`)
})

test('taller cliffs occlude more than short steps at the same distance', () => {
  const midZ = 8
  const tall = buildFromHeights(createWideCliff(9))
  const short = buildFromHeights(createWideCliff(2))

  assert.ok(
    tall.valueAt(9, 0, midZ) < short.valueAt(9, 0, midZ),
    `${tall.valueAt(9, 0, midZ)} < ${short.valueAt(9, 0, midZ)}`
  )
})

test('values align with placements and stay within the visibility range', () => {
  const { placements, ao } = buildCliff()

  for (let i = 0; i < placements.length; i++) {
    const value = ao.get(i)
    assert.ok(Number.isFinite(value) && value >= 0.2 && value <= 1, `placement ${i}: ${value}`)
  }
  assert.equal(ao.get(placements.length), 1)
})

test('inactive AO returns full visibility', () => {
  const { ao } = buildCliff(createConfig({ enabled: false }))

  assert.equal(ao.get(0), 1)
})
