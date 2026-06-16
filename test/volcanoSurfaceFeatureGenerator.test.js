import test from 'node:test'
import assert from 'node:assert/strict'
import VolcanoSurfaceFeatureGenerator from '../src/world/terrain/VolcanoSurfaceFeatureGenerator.js'

const makeCells = ({ width = 12, depth = 12, biomeId = 'volcano', volcanoWeight = 1 } = {}) => {
  const biomeCells = []
  const surfaceCells = []

  for (let z = 0; z < depth; z++) {
    const biomeRow = []
    const surfaceRow = []
    for (let x = 0; x < width; x++) {
      biomeRow.push({ biomeId, weights: { [biomeId]: 1, volcano: volcanoWeight } })
      surfaceRow.push({ x, z, height: 8, slope: 1, isWater: false, isShore: false })
    }
    biomeCells.push(biomeRow)
    surfaceCells.push(surfaceRow)
  }

  return { biomeCells, surfaceCells }
}

const biomeRegistry = {
  get(id) {
    assert.equal(id, 'volcano')
    return {
      lava: {
        poolDensity: 1,
        minVolcanoWeight: 0.65,
        poolCellScale: 12,
        poolEdgeWarp: 0,
        maxSlope: 4
      }
    }
  }
}

test('marks eligible volcano land cells as lava pools', () => {
  const { biomeCells, surfaceCells } = makeCells()
  const generator = new VolcanoSurfaceFeatureGenerator({
    config: { seed: 123, terrain: { width: 12, depth: 12 } },
    biomeRegistry
  })

  generator.apply(biomeCells, surfaceCells)

  const lavaCells = surfaceCells.flat().filter((cell) => cell.isLava)
  assert.equal(lavaCells.length, 144)
  assert.equal(lavaCells.every((cell) => cell.lavaType === 'pool'), true)
})

test('does not mark water cells or weak volcano transition cells as lava', () => {
  const { biomeCells, surfaceCells } = makeCells({ width: 2, depth: 1, volcanoWeight: 0.2 })
  surfaceCells[0][0].isWater = true
  const generator = new VolcanoSurfaceFeatureGenerator({
    config: { seed: 123, terrain: { width: 2, depth: 1 } },
    biomeRegistry
  })

  generator.apply(biomeCells, surfaceCells)

  assert.equal(surfaceCells[0][0].isLava, false)
  assert.equal(surfaceCells[0][0].lavaType, null)
  assert.equal(surfaceCells[0][1].isLava, false)
  assert.equal(surfaceCells[0][1].lavaType, null)
})

test('ignores legacy crack lava tuning and only emits pool lava', () => {
  const { biomeCells, surfaceCells } = makeCells({ width: 24, depth: 24 })
  const generator = new VolcanoSurfaceFeatureGenerator({
    config: { seed: 321, terrain: { width: 24, depth: 24 } },
    biomeRegistry: {
      get(id) {
        assert.equal(id, 'volcano')
        return {
          lava: {
            poolDensity: 0,
            crackDensity: 1,
            crackNoiseScale: 1,
            minVolcanoWeight: 0.65,
            poolCellScale: 12,
            poolEdgeWarp: 0,
            maxSlope: 4
          }
        }
      }
    }
  })

  generator.apply(biomeCells, surfaceCells)

  assert.equal(surfaceCells.flat().some((cell) => cell.lavaType === 'crack'), false)
  assert.equal(surfaceCells.flat().some((cell) => cell.isLava), false)
})

test('assigns each connected lava pool to its lowest covered surface height', () => {
  const { biomeCells, surfaceCells } = makeCells({ width: 3, depth: 1 })
  surfaceCells[0][0].height = 7
  surfaceCells[0][1].height = 4
  surfaceCells[0][2].height = 6

  const generator = new VolcanoSurfaceFeatureGenerator({
    config: { seed: 123, terrain: { width: 3, depth: 1 } },
    biomeRegistry
  })

  generator.apply(biomeCells, surfaceCells)

  assert.deepEqual(surfaceCells[0].map((cell) => cell.isLava), [true, true, true])
  assert.deepEqual(surfaceCells[0].map((cell) => cell.lavaHeight), [4, 4, 4])
})
