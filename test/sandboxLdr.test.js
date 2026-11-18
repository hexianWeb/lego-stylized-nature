import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLDR } from '../src/sandbox/parseLDR.js'
import { exportToLDR } from '../src/sandbox/exportLDR.js'

test('parses a single part line into a placement (regression: rot/yaw ReferenceError)', async () => {
  const text = [
    '0 LEGO Sandbox test model',
    '1 4 16 24 32 1 0 0 0 1 0 0 0 1 3001.dat'
  ].join('\n')

  const placements = await parseLDR(text)

  assert.equal(placements.length, 1)
  const p = placements[0]
  assert.equal(p.partNumber, '3001')
  // LDU / 8 = cells: 16/8=2, 24/8=3, 32/8=4
  assert.equal(p.x, 2)
  assert.equal(p.y, 3)
  assert.equal(p.z, 4)
  assert.equal(p.rot, 0)
  assert.equal(p.color, '#c91a09')
})

test('maps unknown color codes to light gray and skips non-part lines', async () => {
  const text = [
    '0 FILE comment-only',
    '2 0 0 0 0 1 1 1',          // line primitive — ignored
    '5 0 0 0 0 1 1 1',          // optional line — ignored
    '1 999 8 8 8 1 0 0 0 1 0 0 0 1 2357.dat'
  ].join('\n')

  const placements = await parseLDR(text)

  assert.equal(placements.length, 1)
  assert.equal(placements[0].color, '#9b9b9b')
})

test('export → parse round-trips position, color and 90° yaw', async () => {
  const input = [
    { partNumber: '3001', x: 2, y: 3, z: 4, rot: Math.PI / 2, color: '#c91a09' },
    { partNumber: '2357', x: 0, y: 0, z: 0, rot: 0, color: '#0055bf' }
  ]
  const text = exportToLDR(input)
  assert.match(text, /^0 lego-sandbox-build/)

  const placements = await parseLDR(text)
  assert.equal(placements.length, 2)

  const a = placements.find((p) => p.partNumber === '3001')
  assert.equal(a.x, 2)
  assert.equal(a.y, 3)
  assert.equal(a.z, 4)
  assert.equal(a.color, '#c91a09')
  // 90° yaw must survive the round trip exactly (was silently lost as 0°).
  assert.ok(Math.abs(a.rot - Math.PI / 2) < 1e-9, `rot was ${a.rot}`)

  const b = placements.find((p) => p.partNumber === '2357')
  assert.equal(b.x, 0)
  assert.equal(b.y, 0)
  assert.equal(b.z, 0)
  assert.equal(b.color, '#0055bf')
  assert.equal(b.rot, 0)
})

test('export → parse round-trips all four 90° yaw steps', async () => {
  for (const quarter of [0, 1, 2, 3]) {
    const yaw = (quarter * Math.PI) / 2
    const text = exportToLDR([
      { partNumber: '3001', x: 1, y: 1, z: 1, rot: yaw, color: '#237841' }
    ])
    const [p] = await parseLDR(text)
    const delta = Math.abs(p.rot - yaw)
    assert.ok(
      delta < 1e-9 || Math.abs(delta - 2 * Math.PI) < 1e-9,
      `quarter ${quarter}: rot was ${p.rot}`
    )
  }
})
