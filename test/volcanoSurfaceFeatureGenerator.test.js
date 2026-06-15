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
        crackDensity: 0,
        minVolcanoWeight: 0.65,
        poolNoiseScale: 12,
        crackNoiseScale: 6,
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
