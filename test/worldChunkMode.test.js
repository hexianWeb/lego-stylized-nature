import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import World from '../src/world/world.js'

function createExperience() {
  return {
    scene: new THREE.Group(),
    resources: {
      items: {
        brick2x2Model: new THREE.Group(),
        waterNoiseTexture: null
      }
    },
    worldCamera: {
      instance: {
        isOrthographicCamera: true,
        left: -10,
        right: 10,
        top: 10,
        bottom: -10,
        zoom: 1,
        position: { x: 12.8, z: 12.8 }
      },
      lookAtTarget: null,
      lookAt(target) {
        this.lookAtTarget = target.clone()
      }
    },
    environment: {
      shadowConfig: null,
      configureShadows(config) {
        this.shadowConfig = config
      }
    }
  }
}

test('chunk mode regenerate skips full terrain generation', () => {
  const world = new World(createExperience())
  let generatedFullMap = false

  world.brickGeometry = new THREE.BoxGeometry(0.2, 0.095, 0.2)
  world.biomeRegistry = { get: () => ({ lava: {} }) }
  world.terrainGenerator = {
    generate() {
      generatedFullMap = true
      return {}
    },
    generateChunk({ origin, size, halo }) {
      return { origin, visibleSize: size, halo }
    }
  }
  world.layeredTerrainBuilder = {
    buildPlacements() {
      return []
    }
  }
  world.brickColorResolver = {}
  world.playerAircraft = {
    enabled: true,
    state: { position: { x: 12.8, z: 12.8 } },
    group: new THREE.Group()
  }
  world.terrainChunkManager = {
    bootstrapped: false,
    refreshed: false,
    bootstrap(x, z, camera) {
      this.bootstrapped = { x, z, camera }
    },
    refreshAOPreview() {
      this.refreshed = true
    },
    getDebugMaterials() {
      return { legoMaterial: null, waterMaterial: null }
    }
  }

  world.regenerate()

  assert.equal(generatedFullMap, false)
  assert.equal(world.terrainBrickRenderer, null)
  assert.deepEqual(
    { x: world.terrainChunkManager.bootstrapped.x, z: world.terrainChunkManager.bootstrapped.z },
    { x: 12.8, z: 12.8 }
  )
  assert.ok(world.experience.environment.shadowConfig)
})

for (const chunkMode of [true, false]) {
  test(`World.build uses one material owner in ${chunkMode ? 'chunk' : 'full map'} mode`, () => {
    const experience = createExperience()
    const sourceGeometry = new THREE.BoxGeometry(0.2, 0.095, 0.2)
    const scene = new THREE.Group()
    scene.add(new THREE.Mesh(sourceGeometry, new THREE.MeshBasicMaterial()))
    experience.resources.items.brick2x2Model = { scene }
    const world = new World(experience)
    world.config = structuredClone(world.config)
    Object.assign(world.config.terrain, { width: 8, depth: 8 })
    Object.assign(world.config.chunks, { enabled: chunkMode, size: 4 })
    world.config.player.aircraft.enabled = false
    world.build()
    if (chunkMode) {
      assert.equal(world.terrainBrickRenderer, null)
      const slots = world.terrainChunkManager.slots
      assert.equal(new Set(slots.map((slot) => slot.terrainRenderer.material)).size, 1)
      assert.ok(slots.every((slot) => slot.waterRenderer.material === world.materials.waterMaterial))
      assert.ok(slots.every((slot) => slot.lavaRenderer.material === world.materials.lavaMaterial))
    } else {
      assert.equal(world.terrainChunkManager, null)
      assert.equal(world.terrainBrickRenderer.material, world.materials.legoMaterial)
      assert.equal(world.waterBrickRenderer.material, world.materials.waterMaterial)
    }
    const childCount = world.children.length
    world.build()
    assert.equal(world.children.length, childCount)
    let clonedDisposed = 0
    let sourceDisposed = 0
    world.brickGeometry.addEventListener('dispose', () => clonedDisposed++)
    sourceGeometry.addEventListener('dispose', () => sourceDisposed++)
    world.dispose()
    world.dispose()
    assert.equal(clonedDisposed, 1)
    assert.equal(sourceDisposed, 0)
    sourceGeometry.dispose()
  })
}
