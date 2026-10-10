import test from 'node:test'
import assert from 'node:assert/strict'
import { sampleHeightCurve } from '../src/world/terrain/heightShapers.js'
import HeightField from '../src/world/terrain/HeightField.js'
import SurfaceClassifier from '../src/world/terrain/SurfaceClassifier.js'

const curve = [
  { n: 0.2, h: 0 },
  { n: 0.4, h: 0 },
  { n: 0.42, h: 10 },
  { n: 0.8, h: 10 }
]

test('height curve clamps outside its range', () => {
  assert.equal(sampleHeightCurve(curve, 0), 0)
  assert.equal(sampleHeightCurve(curve, 1), 10)
})

test('height curve keeps flat segments flat and interpolates steep ones', () => {
  assert.equal(sampleHeightCurve(curve, 0.3), 0)
  assert.equal(sampleHeightCurve(curve, 0.6), 10)
  assert.ok(Math.abs(sampleHeightCurve(curve, 0.41) - 5) < 1e-9)
})

test('surface classifier matches the height field size, not the full map size', () => {
  const classifier = new SurfaceClassifier({ terrain: { width: 128, depth: 128, waterLevel: 3 } })
  const cells = classifier.classify(new HeightField(10, 6))

  assert.equal(cells.length, 6)
  assert.equal(cells[0].length, 10)
})
