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
        waterNoiseTexture: null,
        lavaNoiseTexture: null
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
  world.terrainBrickRenderer = { updateInstanceColors() {} }
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
  assert.deepEqual(
    { x: world.terrainChunkManager.bootstrapped.x, z: world.terrainChunkManager.bootstrapped.z },
    { x: 12.8, z: 12.8 }
  )
  assert.ok(world.experience.environment.shadowConfig)
})
