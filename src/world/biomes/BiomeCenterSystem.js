import * as THREE from 'three/webgpu'

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
    logger = (message) => console.log(message)
  }) {
    this.config = config
    this.resources = resources
    this.terrainGenerator = terrainGenerator
    this.logger = logger
    this.group = new THREE.Group()
    this.group.name = 'BiomeCenterSystem'
    this.towers = []
    this.triggeredIds = new Set()
    this.lightMaterials = []
    this._missingAssetWarned = false
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

    const terrainMap = this.terrainGenerator.generateForBounds(
      { x: centerX, z: centerZ },
      1,
      1,
      {
        origin: { x: centerX, z: centerZ },
        visibleSize: 1,
        halo: 0
      }
    )

    const height = terrainMap?.getHeight?.(0, 0)
    return Number.isFinite(height) ? height : 0
  }

  update(playerPosition = null) {
    if (!playerPosition) {
      return
    }

    for (const tower of this.towers) {
      if (this.triggeredIds.has(tower.id)) {
        continue
      }

      const dx = playerPosition.x - tower.position.x
      const dz = playerPosition.z - tower.position.z
      const distanceSq = dx * dx + dz * dz
      if (distanceSq > tower.triggerRadius * tower.triggerRadius) {
        continue
      }

      this.triggeredIds.add(tower.id)
      this.logger(`[BiomeCenter] ${tower.id} reached: ${tower.log}`)
    }
  }

  clear() {
    for (const material of this.lightMaterials) {
      disposeTowerLightMaterial(material)
    }
    this.lightMaterials.length = 0
    this.towers.length = 0
    this.triggeredIds.clear()
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
