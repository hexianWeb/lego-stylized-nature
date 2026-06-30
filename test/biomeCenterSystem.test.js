import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import sources from '../src/assets/sources.js'
import { worldConfig } from '../src/world/WorldConfig.js'
import BiomeCenterSystem, {
  applyTowerLightMaterial,
  disposeTowerLightMaterial,
  matchesTowerLightMesh
} from '../src/world/biomes/BiomeCenterSystem.js'

function createTowerAsset() {
  const scene = new THREE.Group()
  scene.name = 'root'

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#202020' })
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), bodyMaterial)
  body.name = 'tower'

  const lightMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff' })
  const light = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), lightMaterial)
  light.name = 'light'

  const lightDuplicate = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#ffffff' })
  )
  lightDuplicate.name = 'light.001'

  scene.add(body, light, lightDuplicate)

  return {
    scene,
    bodyMaterial,
    lightMaterial,
    lightDuplicateMaterial: lightDuplicate.material
  }
}

function findMesh(root, name) {
  let found = null
  root.traverse((node) => {
    if (node.name === name) {
      found = node
    }
  })
  return found
}

function createTerrainGenerator(height = 7) {
  return {
    calls: [],
    generateForBounds(origin, width, depth, meta) {
      this.calls.push({ origin, width, depth, meta })
      return {
        getHeight(x, z) {
          assert.equal(x, 0)
          assert.equal(z, 0)
          return height
        }
      }
    }
  }
}

test('registers the biome tower model source and config', () => {
  const towerSource = sources.find((source) => source.name === 'biomeTowerModel')

  assert.deepEqual(towerSource, {
    name: 'biomeTowerModel',
    type: 'gltfModel',
    path: 'model/tower/tower.glb'
  })
  assert.equal(worldConfig.biomeCenters.assetName, 'biomeTowerModel')
  assert.equal(worldConfig.biomeCenters.lightMeshName, 'light')
  assert.equal(worldConfig.biomeCenters.towers.forest.light.color, '#43ff7a')
  assert.equal(worldConfig.biomeCenters.towers.autumnForest.storyAlias, 'badlands')
})

test('matches the tower light mesh name including Blender numeric suffixes', () => {
  assert.equal(matchesTowerLightMesh('light', 'light'), true)
  assert.equal(matchesTowerLightMesh('light.001', 'light'), true)
  assert.equal(matchesTowerLightMesh('tower', 'light'), false)
  assert.equal(matchesTowerLightMesh('highlight', 'light'), false)
})

test('applies biome emission only to light mesh material clones', () => {
  const asset = createTowerAsset()
  const clone = asset.scene.clone(true)

  applyTowerLightMaterial(clone, {
    lightMeshName: 'light',
    light: {
      color: '#43ff7a',
      emissiveIntensity: 1.8
    }
  })

  const body = findMesh(clone, 'tower')
  const light = findMesh(clone, 'light')
  const lightDuplicate = findMesh(clone, 'light.001')

  assert.equal(body.material, asset.bodyMaterial)
  assert.notEqual(light.material, asset.lightMaterial)
  assert.notEqual(lightDuplicate.material, asset.lightDuplicateMaterial)
  assert.equal(light.material.color.getHexString(), '43ff7a')
  assert.equal(light.material.emissive.getHexString(), '43ff7a')
  assert.equal(light.material.emissiveIntensity, 1.8)
  assert.equal(lightDuplicate.material.emissiveIntensity, 1.8)
  assert.equal(light.material.userData.isBiomeTowerLightClone, true)
})

test('disposes only cloned tower light materials and not shared textures', () => {
  const texture = new THREE.Texture()
  const cloned = new THREE.MeshStandardMaterial({ map: texture })
  const source = new THREE.MeshStandardMaterial({ map: texture })
  let clonedDisposed = false
  let sourceDisposed = false
  let textureDisposed = false
  cloned.userData.isBiomeTowerLightClone = true
  cloned.dispose = () => {
    clonedDisposed = true
  }
  source.dispose = () => {
    sourceDisposed = true
  }
  texture.dispose = () => {
    textureDisposed = true
  }

  disposeTowerLightMaterial([cloned, source])

  assert.equal(clonedDisposed, true)
  assert.equal(sourceDisposed, false)
  assert.equal(textureDisposed, false)
})

test('builds one ground-aligned tower per biome center', () => {
  const asset = createTowerAsset()
  const terrainGenerator = createTerrainGenerator(7)
  const system = new BiomeCenterSystem({
    config: {
      terrain: {
        cellSize: 0.2,
        layerHeight: 0.095
      },
      biomes: {
        regions: [
          { id: 'forest', center: [10, 20] },
          { id: 'desert', center: [-5, 8] }
        ]
      },
      biomeCenters: {
        enabled: true,
        assetName: 'biomeTowerModel',
        triggerRadius: 3,
        lightMeshName: 'light',
        towers: {
          forest: {
            light: { color: '#43ff7a', emissiveIntensity: 1.8 },
            log: 'forest reached'
          },
          desert: {
            light: { color: '#ffd34a', emissiveIntensity: 1.5 },
            log: 'desert reached'
          }
        }
      }
    },
    resources: {
      items: {
        biomeTowerModel: asset
      }
    },
    terrainGenerator
  })

  system.build()

  assert.equal(system.group.children.length, 2)
  assert.equal(system.group.children[0].position.x, 2)
  assert.equal(system.group.children[0].position.y, 7 * 0.095)
  assert.equal(system.group.children[0].position.z, 4)
  assert.equal(system.group.children[1].position.x, -1)
  assert.equal(system.group.children[1].position.z, 1.6)
  assert.equal(terrainGenerator.calls.length, 2)
  assert.deepEqual(terrainGenerator.calls[0].origin, { x: 10, z: 20 })
})

test('logs each biome center trigger once', () => {
  const asset = createTowerAsset()
  const logs = []
  const system = new BiomeCenterSystem({
    config: {
      terrain: {
        cellSize: 1,
        layerHeight: 1
      },
      biomes: {
        regions: [
          { id: 'forest', center: [0, 0] }
        ]
      },
      biomeCenters: {
        enabled: true,
        assetName: 'biomeTowerModel',
        triggerRadius: 3,
        lightMeshName: 'light',
        towers: {
          forest: {
            light: { color: '#43ff7a', emissiveIntensity: 1.8 },
            log: 'Forest validation reached'
          }
        }
      }
    },
    resources: {
      items: {
        biomeTowerModel: asset
      }
    },
    terrainGenerator: createTerrainGenerator(0),
    logger: (message) => logs.push(message)
  })

  system.build()
  system.update(new THREE.Vector3(2, 0, 0))
  system.update(new THREE.Vector3(1, 0, 0))
  system.update(new THREE.Vector3(10, 0, 0))

  assert.deepEqual(logs, [
    '[BiomeCenter] forest reached: Forest validation reached'
  ])
})
