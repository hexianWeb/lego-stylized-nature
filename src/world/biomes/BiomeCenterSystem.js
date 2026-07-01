import * as THREE from 'three/webgpu'
import { eventBus as defaultEventBus } from '../../utils/event-bus.js'

export const BIOME_CENTER_ENTERED_EVENT = 'biome-center:entered'
export const BIOME_CENTER_EXITED_EVENT = 'biome-center:exited'
export const BIOME_CENTER_ACTIVATE_EVENT = 'biome-center:activate'

const TOWER_LIGHT_CLONE_FLAG = 'isBiomeTowerLightClone'

export function matchesTowerLightMesh(meshName, lightMeshName = 'light') {
  return stripBlenderSuffix(meshName) === lightMeshName
}

export function applyTowerLightMaterial(root, { lightMeshName = 'light', light = {} } = {}) {
  const normalized = normalizeLightConfig(light)
  if (!normalized) {
    return []
  }

  const clonedMaterials = []
  root.traverse((node) => {
    if (!node.isMesh || !matchesTowerLightMesh(node.name, lightMeshName)) {
      return
    }

    node.material = cloneTowerLightMaterial(node.material, normalized, clonedMaterials)
  })

  return clonedMaterials
}

export function disposeTowerLightMaterial(material) {
  if (Array.isArray(material)) {
    material.forEach(disposeTowerLightMaterial)
    return
  }

  if (material?.userData?.[TOWER_LIGHT_CLONE_FLAG] === true) {
    material.dispose()
  }
}

export default class BiomeCenterSystem {
  constructor({
    config,
    resources,
    terrainGenerator,
    logger = (message) => console.log(message),
    eventBus = defaultEventBus,
    inputTarget = globalThis.window ?? null
  }) {
    this.config = config
    this.resources = resources
    this.terrainGenerator = terrainGenerator
    this.logger = logger
    this.eventBus = eventBus
    this.inputTarget = inputTarget
    this.group = new THREE.Group()
    this.group.name = 'BiomeCenterSystem'
    this.towers = []
    this.nearbyTowerId = null
    this.lightMaterials = []
    this._missingAssetWarned = false
    this._onKeyDown = (event) => this.handleKeyDown(event)
    this.inputTarget?.addEventListener?.('keydown', this._onKeyDown)
  }

  build() {
    this.clear()

    const centerConfig = this.config.biomeCenters ?? {}
    if (centerConfig.enabled === false) {
      return
    }

    const assetName = centerConfig.assetName ?? 'biomeTowerModel'
    const sourceScene = this.resources?.items?.[assetName]?.scene
    if (!sourceScene) {
      this.warnMissingAsset(assetName)
      return
    }

    for (const region of this.config.biomes?.regions ?? []) {
      if (!Array.isArray(region.center) || region.center.length < 2) {
        continue
      }

      const towerConfig = centerConfig.towers?.[region.id] ?? {}
      const model = sourceScene.clone(true)
      const centerX = Number(region.center[0])
      const centerZ = Number(region.center[1])
      if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) {
        continue
      }

      const lightMaterials = applyTowerLightMaterial(model, {
        lightMeshName: centerConfig.lightMeshName ?? 'light',
        light: towerConfig.light
      })
      this.lightMaterials.push(...lightMaterials)

      const position = this.createTowerPosition(centerX, centerZ)
      model.position.copy(position)
      model.name = `BiomeCenterTower:${region.id}`
      this.group.add(model)
      this.towers.push({
        id: region.id,
        towerId: region.id,
        storyId: towerConfig.storyAlias ?? region.id,
        model,
        position,
        log: towerConfig.log ?? `${region.id} validation reached`,
        triggerRadius: Number.isFinite(centerConfig.triggerRadius)
          ? centerConfig.triggerRadius
          : 3
      })
    }
  }

  createTowerPosition(centerX, centerZ) {
    const terrain = this.config.terrain ?? {}
    const cellSize = Number.isFinite(terrain.cellSize) ? terrain.cellSize : 1
    const layerHeight = Number.isFinite(terrain.layerHeight) ? terrain.layerHeight : 1
    const terrainHeight = this.sampleTerrainHeight(centerX, centerZ)

    return new THREE.Vector3(
      centerX * cellSize,
      terrainHeight * layerHeight,
      centerZ * cellSize
    )
  }

  sampleTerrainHeight(centerX, centerZ) {
    if (!this.terrainGenerator?.generateForBounds) {
      return 0
    }

    const footprintCells = this.resolveFootprintCells()
    const sampleOrigin = {
      x: centerX - Math.floor(footprintCells / 2),
      z: centerZ - Math.floor(footprintCells / 2)
    }
    const terrainMap = this.terrainGenerator.generateForBounds(
      sampleOrigin,
      footprintCells,
      footprintCells,
      {
        origin: sampleOrigin,
        visibleSize: footprintCells,
        halo: 0
      }
    )

    let maxHeight = 0
    for (let z = 0; z < footprintCells; z++) {
      for (let x = 0; x < footprintCells; x++) {
        const height = terrainMap?.getHeight?.(x, z)
        if (Number.isFinite(height)) {
          maxHeight = Math.max(maxHeight, height)
        }
      }
    }

    return maxHeight
  }

  resolveFootprintCells() {
    const footprintCells = this.config.biomeCenters?.footprintCells
    return Number.isInteger(footprintCells) && footprintCells > 0
      ? footprintCells
      : 4
  }

  update(playerPosition = null) {
    if (!playerPosition) {
      return
    }

    const nearestTower = this.findNearestTowerInRange(playerPosition)
    const nextTowerId = nearestTower?.towerId ?? null

    if (nextTowerId !== this.nearbyTowerId) {
      if (this.nearbyTowerId) {
        const previous = this.towers.find((tower) => tower.towerId === this.nearbyTowerId)
        if (previous) {
          this.emitTowerEvent(BIOME_CENTER_EXITED_EVENT, previous)
        }
      }

      if (nearestTower) {
        this.emitTowerEvent(BIOME_CENTER_ENTERED_EVENT, nearestTower)
        this.logger(`[BiomeCenter] ${nearestTower.id} entered: ${nearestTower.log}`)
      }

      this.nearbyTowerId = nextTowerId
    }
  }

  findNearestTowerInRange(playerPosition) {
    let nearest = null
    let nearestDistanceSq = Infinity

    for (const tower of this.towers) {
      const dx = playerPosition.x - tower.position.x
      const dz = playerPosition.z - tower.position.z
      const distanceSq = dx * dx + dz * dz
      if (distanceSq <= tower.triggerRadius * tower.triggerRadius && distanceSq < nearestDistanceSq) {
        nearest = tower
        nearestDistanceSq = distanceSq
      }
    }

    return nearest
  }

  handleKeyDown(event) {
    if (event.repeat === true || event.code !== 'KeyE' || !this.nearbyTowerId) {
      return
    }

    const tower = this.towers.find((entry) => entry.towerId === this.nearbyTowerId)
    if (tower) {
      this.emitTowerEvent(BIOME_CENTER_ACTIVATE_EVENT, tower)
    }
  }

  emitTowerEvent(type, tower) {
    this.eventBus.emit(type, {
      biomeId: tower.id,
      towerId: tower.towerId,
      storyId: tower.storyId
    })
  }

  clear() {
    for (const material of this.lightMaterials) {
      disposeTowerLightMaterial(material)
    }
    this.lightMaterials.length = 0
    this.towers.length = 0
    this.nearbyTowerId = null
    this.group.clear()
  }

  warnMissingAsset(assetName) {
    if (this._missingAssetWarned) {
      return
    }

    console.warn(`[BiomeCenterSystem] Missing tower asset "${assetName}"; biome center towers skipped.`)
    this._missingAssetWarned = true
  }

  dispose() {
    this.inputTarget?.removeEventListener?.('keydown', this._onKeyDown)
    this.clear()
  }
}

function stripBlenderSuffix(name) {
  return String(name ?? '').replace(/\.\d+$/, '')
}

function cloneTowerLightMaterial(material, normalized, clonedMaterials) {
  if (Array.isArray(material)) {
    return material.map((entry) => cloneSingleTowerLightMaterial(entry, normalized, clonedMaterials))
  }

  return cloneSingleTowerLightMaterial(material, normalized, clonedMaterials)
}

function cloneSingleTowerLightMaterial(material, normalized, clonedMaterials) {
  if (!material) {
    return material
  }

  const clone = material.clone()
  if (clone.color?.copy) {
    clone.color.copy(normalized.color)
  }
  if (clone.emissive?.copy) {
    clone.emissive.copy(normalized.color)
  }
  if ('emissiveIntensity' in clone) {
    clone.emissiveIntensity = normalized.emissiveIntensity
  }
  if (normalized.toneMapped === false && 'toneMapped' in clone) {
    clone.toneMapped = false
  }
  clone.userData = {
    ...clone.userData,
    [TOWER_LIGHT_CLONE_FLAG]: true
  }
  clone.needsUpdate = true
  clonedMaterials.push(clone)

  return clone
}

function normalizeLightConfig(light) {
  if (typeof light?.color !== 'string') {
    return null
  }

  const color = new THREE.Color()
  color.set(light.color)

  return {
    color,
    emissiveIntensity: Number.isFinite(light.emissiveIntensity)
      ? light.emissiveIntensity
      : 1,
    toneMapped: light.toneMapped
  }
}
