import test from 'node:test'
import assert from 'node:assert/strict'
import { findStudSnap } from '../src/sandbox/tools/placeSnap.js'

const grid = { width: 32, depth: 32 }
const footprint = { x: 2, z: 2 }

test('prefers the east flush position when it is free', () => {
  const candidate = findStudSnap({
    grid,
    placements: [],
    x: 10, y: 0, z: 10,
    footprint
  })
  assert.deepEqual(candidate, { x: 12, y: 0, z: 10 })
})

test('falls back west when the east neighbor overlaps', () => {
  // Occupier covers (14..15, 10..11) — blocks the east candidate.
  const placements = [
    { x: 14, y: 0, z: 10, footprint: { x: 2, z: 2 } }
  ]
  const candidate = findStudSnap({
    grid, placements, x: 12, y: 0, z: 10, footprint
  })
  // East candidate (14,10) collides; west candidate (10,10) is free.
  assert.deepEqual(candidate, { x: 10, y: 0, z: 10 })
})

test('skips placements on a different layer', () => {
  const placements = [
    { x: 14, y: 0, z: 10, footprint: { x: 2, z: 2 } }
  ]
  const candidate = findStudSnap({
    grid, placements, x: 12, y: 3, z: 10, footprint
  })
  // The blocker lives on y=0; on y=3 the east candidate is free.
  assert.deepEqual(candidate, { x: 14, y: 3, z: 10 })
})

test('never proposes positions outside the grid', () => {
  // Corner placement: the west/north candidates fall off the plate.
  const placements = [
    { x: 0, y: 0, z: 0, footprint: { x: 2, z: 2 } }
  ]
  const candidate = findStudSnap({
    grid, placements, x: 0, y: 0, z: 0, footprint
  })
  assert.deepEqual(candidate, { x: 2, y: 0, z: 0 })
})

test('returns null when every direction collides or exits', () => {
  // A closed ring around the 2×2 slot at (10,10) on a 20×20 grid.
  const placements = [
    { x: 12, y: 0, z: 8,  footprint: { x: 4, z: 4 } }, // east  (12..15, 8..11)
    { x: 6,  y: 0, z: 8,  footprint: { x: 4, z: 4 } }, // west  ( 6..9,  8..11)
    { x: 8,  y: 0, z: 12, footprint: { x: 4, z: 4 } }, // south ( 8..11, 12..15)
    { x: 8,  y: 0, z: 6,  footprint: { x: 4, z: 4 } }, // north ( 8..11,  6..9)
    { x: 10, y: 0, z: 10, footprint: { x: 2, z: 2 } }  // original slot
  ]
  const candidate = findStudSnap({
    grid: { width: 20, depth: 20 },
    placements,
    x: 10, y: 0, z: 10,
    footprint
  })
  assert.equal(candidate, null)
})
