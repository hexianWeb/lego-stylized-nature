import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { createLavaMaterial } from '../src/materials/tsl/lavaMaterial.js'
import LavaBrickRenderer from '../src/world/bricks/LavaBrickRenderer.js'

test('creates lava material with pulse uniforms', () => {
  const material = createLavaMaterial({ pulseSpeed: 2, glowStrength: 0.8, roughness: 0.25 })

  assert.equal(material.roughness, 0.25)
  assert.equal(material.metalness, 0)
  assert.ok(material.colorNode)
  assert.ok(material.emissiveNode)
  assert.ok(material.userData.uniforms.uPulseSpeed)
  assert.ok(material.userData.uniforms.uGlowStrength)
})

test('builds one overlay brick per lava surface cell', () => {
  const renderer = new LavaBrickRenderer({
    config: {
      terrain: { width: 2, depth: 2, cellSize: 0.2, layerHeight: 0.095 }
    },
    brickGeometry: new THREE.BoxGeometry(1, 1, 1),
    lavaConfig: {}
  })

  const cells = [
    [{ height: 4, isLava: true }, { height: 5, isLava: false }],
    [{ height: 6, isLava: true }, { height: 7, isLava: false }]
  ]
  const terrainMap = {
    getSurfaceCell(x, z) {
      return cells[z][x]
    }
  }

  renderer.build(terrainMap)

  assert.equal(renderer.mesh.count, 2)
  renderer.dispose()
})
