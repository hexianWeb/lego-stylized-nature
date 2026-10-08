import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import Resources from '../src/utils/Resources.js'
import sources from '../src/assets/sources.js'

class ControlledResources extends Resources {
  startLoading() {}
}

test('required resource failures name the missing asset while optional failures can degrade', async () => {
  assert.equal(sources.find((source) => source.name === 'brick2x2Model').required, true)
  const resources = new ControlledResources([
    { name: 'brick', required: true },
    { name: 'hdr' }
  ])
  const failure = new Error('404')
  resources.errors.brick = failure
  resources.itemLoaded('brick', null)
  resources.itemLoaded('hdr', null)
  await resources.ready
  assert.throws(() => resources.assertRequired(), (err) => /brick/.test(err.message) && err.cause === failure)
  resources.items.brick = { scene: new THREE.Group() }
  assert.doesNotThrow(() => resources.assertRequired())
  resources.dispose()
})

test('disposing loaded assets deduplicates GLTF geometry, materials, textures and images', () => {
  const resources = new ControlledResources([])
  let closed = 0
  const texture = new THREE.Texture({ close: () => closed++ })
  const anotherTexture = new THREE.Texture(texture.image)
  const geometry = new THREE.BoxGeometry()
  const material = new THREE.MeshStandardMaterial({ map: texture, normalMap: anotherTexture })
  const scene = new THREE.Group()
  scene.add(new THREE.Mesh(geometry, [material, material]), new THREE.Mesh(geometry, material))
  resources.items = { first: { scene, scenes: [scene, scene] }, second: { scene }, noise: texture }
  const disposals = { geometry: 0, material: 0, texture: 0, anotherTexture: 0 }
  for (const [key, resource] of Object.entries({ geometry, material, texture, anotherTexture })) {
    resource.addEventListener('dispose', () => disposals[key]++)
  }
  resources.dispose()
  resources.dispose()
  assert.deepEqual(disposals, { geometry: 1, material: 1, texture: 1, anotherTexture: 1 })
  assert.equal(closed, 1)
  assert.deepEqual(resources.items, {})
})

test('releasing the source HDR removes it and prevents duplicate disposal later', () => {
  const resources = new ControlledResources([])
  const hdr = new THREE.DataTexture()
  let disposed = 0
  hdr.addEventListener('dispose', () => disposed++)
  resources.items.studioEnvMap = hdr
  resources.release('studioEnvMap')
  resources.dispose()
  assert.equal(disposed, 1)
  assert.equal('studioEnvMap' in resources.items, false)
})

test('assets arriving after disposal are released without resurrecting Resources.items', async () => {
  const resources = new ControlledResources([{ name: 'late', required: true }])
  resources.dispose()
  await resources.ready
  const texture = new THREE.Texture()
  let disposed = 0
  texture.addEventListener('dispose', () => disposed++)
  resources.itemLoaded('late', texture)
  assert.equal(disposed, 1)
  assert.deepEqual(resources.items, {})
  assert.throws(() => resources.assertRequired(), /disposed/)
})
