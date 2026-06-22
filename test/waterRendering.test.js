import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { createWaterMaterial } from '../src/materials/tsl/waterMaterial.js'
import WaterBrickRenderer from '../src/world/bricks/WaterBrickRenderer.js'
import { WATER_BUCKETS, classifyWaterDepth } from '../src/world/bricks/waterDepth.js'

test('classifies water depth using configured inclusive thresholds', () => {
  const config = { shallowMaxDepth: 1, transitionMaxDepth: 3 }

  assert.deepEqual(WATER_BUCKETS, ['shallow', 'transition', 'deep'])
  assert.equal(classifyWaterDepth(0, config), 'shallow')
  assert.equal(classifyWaterDepth(1, config), 'shallow')
  assert.equal(classifyWaterDepth(2, config), 'transition')
  assert.equal(classifyWaterDepth(3, config), 'transition')
  assert.equal(classifyWaterDepth(4, config), 'deep')
})

test('clamps transition depth to the shallow threshold', () => {
  const config = { shallowMaxDepth: 3, transitionMaxDepth: 1 }

  assert.equal(classifyWaterDepth(3, config), 'shallow')
  assert.equal(classifyWaterDepth(3.1, config), 'deep')
})

test('uses default water depth thresholds', () => {
  assert.equal(classifyWaterDepth(1), 'shallow')
  assert.equal(classifyWaterDepth(2), 'transition')
  assert.equal(classifyWaterDepth(4), 'deep')
})

test('creates animated physical water material with configurable uniforms', () => {
  const config = {
    rippleSpeed: 1.25,
    rippleScale: 9,
    rippleStrength: 0.2,
    detailScale: 24,
    detailStrength: 0.06,
    highlightStrength: 0.4,
    roughness: 0.18,
    clearcoat: 0.7,
    clearcoatRoughness: 0.05,
  }

  const material = createWaterMaterial(config, '#42DDEB')

  assert.ok(material instanceof THREE.MeshPhysicalNodeMaterial)
  assert.ok(material.colorNode)
  assert.equal(material.roughness, 0.18)
  assert.equal(material.metalness, 0)
  assert.equal(material.clearcoat, 0.7)
  assert.equal(material.clearcoatRoughness, 0.05)
  assert.equal(material.transparent, false)
  assert.equal(material.opacity, 1)
  assert.deepEqual(
    Object.keys(material.userData.uniforms).sort(),
    [
      'uDetailScale',
      'uDetailStrength',
      'uHighlightStrength',
      'uRippleScale',
      'uRippleSpeed',
      'uRippleStrength',
    ].sort(),
  )
  assert.equal(material.userData.uniforms.uRippleSpeed.value, 1.25)
  assert.equal(material.userData.uniforms.uRippleScale.value, 9)
  assert.equal(material.userData.uniforms.uRippleStrength.value, 0.2)
  assert.equal(material.userData.uniforms.uDetailScale.value, 24)
  assert.equal(material.userData.uniforms.uDetailStrength.value, 0.06)
  assert.equal(material.userData.uniforms.uHighlightStrength.value, 0.4)
})

test('preserves explicit zero values in water material configuration', () => {
  const material = createWaterMaterial({
    rippleSpeed: 0,
    rippleStrength: 0,
    detailStrength: 0,
    highlightStrength: 0,
    roughness: 0,
    clearcoat: 0,
    clearcoatRoughness: 0,
  })

  assert.equal(material.roughness, 0)
  assert.equal(material.clearcoat, 0)
  assert.equal(material.clearcoatRoughness, 0)
  assert.equal(material.userData.uniforms.uRippleSpeed.value, 0)
  assert.equal(material.userData.uniforms.uRippleStrength.value, 0)
  assert.equal(material.userData.uniforms.uDetailStrength.value, 0)
  assert.equal(material.userData.uniforms.uHighlightStrength.value, 0)
})

test('keeps water nonmetallic and in the opaque render path', () => {
  const material = createWaterMaterial({
    metalness: 1,
    opacity: 0.2,
    transparent: true,
  })

  assert.equal(material.metalness, 0)
  assert.equal(material.opacity, 1)
  assert.equal(material.transparent, false)
})

function createWaterRenderer() {
  return new WaterBrickRenderer({
    config: {
      terrain: {
        width: 4,
        depth: 1,
        cellSize: 0.2,
        layerHeight: 1,
        waterLevel: 4,
      },
      water: {
        shallowMaxDepth: 1,
        transitionMaxDepth: 3,
        shallowColor: '#42DDEB',
        transitionColor: '#168FD2',
        deepColor: '#0757A6',
      },
    },
    brickGeometry: new THREE.BoxGeometry(1, 1, 1),
  })
}

test('builds water cells into shallow transition and deep buckets', () => {
  const renderer = createWaterRenderer()
  const cells = [
    { height: 3, isWater: true },
    { height: 2, isWater: true },
    { height: 0, isWater: true },
    { height: 4, isWater: false },
  ]
  const terrainMap = {
    getSurfaceCell(x) {
      return cells[x]
    },
  }

  renderer.build(terrainMap)

  assert.equal(renderer.buckets.shallow.mesh.count, 1)
  assert.equal(renderer.buckets.transition.mesh.count, 1)
  assert.equal(renderer.buckets.deep.mesh.count, 1)
  assert.equal(renderer.group.children.length, 3)

  renderer.dispose()
})

test('reuses bucket meshes and hides buckets emptied by rebuild', () => {
  const renderer = createWaterRenderer()
  let cells = [
    { height: 3, isWater: true },
    { height: 2, isWater: true },
    { height: 0, isWater: true },
    { height: 4, isWater: false },
  ]
  const terrainMap = {
    getSurfaceCell(x) {
      return cells[x]
    },
  }

  renderer.build(terrainMap)
  const shallowMesh = renderer.buckets.shallow.mesh
  const transitionMesh = renderer.buckets.transition.mesh

  cells = [
    { height: 3, isWater: true },
    { height: 4, isWater: false },
    { height: 4, isWater: false },
    { height: 4, isWater: false },
  ]
  renderer.build(terrainMap)

  assert.equal(renderer.buckets.shallow.mesh, shallowMesh)
  assert.equal(renderer.buckets.transition.mesh, transitionMesh)
  assert.equal(renderer.buckets.shallow.mesh.count, 1)
  assert.equal(renderer.buckets.transition.mesh.count, 0)
  assert.equal(renderer.buckets.deep.mesh.count, 0)

  renderer.dispose()
})

test('disposes all water bucket materials and clears owned meshes', () => {
  const renderer = createWaterRenderer()
  const disposed = []
  for (const [name, bucket] of Object.entries(renderer.buckets)) {
    bucket.material.dispose = () => disposed.push(name)
  }
  const terrainMap = {
    getSurfaceCell(x) {
      return { height: 3 - x, isWater: x < 3 }
    },
  }

  renderer.build(terrainMap)
  renderer.dispose()

  assert.deepEqual(disposed.sort(), ['deep', 'shallow', 'transition'])
  assert.equal(renderer.group.children.length, 0)
  for (const bucket of Object.values(renderer.buckets)) {
    assert.equal(bucket.mesh, null)
    assert.equal(bucket.capacity, 0)
  }
})
