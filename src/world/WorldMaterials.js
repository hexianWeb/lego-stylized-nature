import * as THREE from 'three/webgpu'
import { createLegoMaterial } from '../materials/tsl/legoMaterial.js'
import { createWaterMaterial } from '../materials/tsl/waterMaterial.js'
import { createLavaMaterial } from '../materials/tsl/lavaMaterial.js'
import { resolveTreeMaterial } from './prefabs/treeMaterial.js'
import { resolvePrefabMaterial } from './prefabs/prefabMaterialTint.js'
import { resolveInstanceColorMaterial } from './prefabs/prefabInstanceColor.js'

// The World owns these materials; slots and warmup meshes only borrow them.
export default class WorldMaterials {
  constructor({ config = {}, waterNoiseTexture = null, lavaConfig = {} } = {}) {
    const waterConfig = config.water ?? {}
    this.legoMaterial = createLegoMaterial()
    this.previewMaterial = new THREE.MeshBasicNodeMaterial()
    this.waterMaterial = createWaterMaterial(waterConfig, waterNoiseTexture)
    this.lavaMaterial = createLavaMaterial({
      textureScale: waterConfig.textureScale,
      flowSpeed: waterConfig.flowSpeed,
      flowStrength: waterConfig.flowStrength,
      flowVariance: waterConfig.flowVariance,
      roughness: waterConfig.roughness,
      clearcoat: waterConfig.clearcoat,
      clearcoatRoughness: waterConfig.clearcoatRoughness,
      darkColor: lavaConfig.darkColor,
      midColor: lavaConfig.midColor,
      lightColor: lavaConfig.lightColor
    }, waterNoiseTexture, this.waterMaterial.userData.uniforms)
    this.treeMaterials = new Map()
    this.tintMaterials = new Map()
    this.instanceColorMaterials = new Map()
    this.disposed = false
  }

  resolveTreeMaterial(mesh, biomeId) {
    return resolveTreeMaterial(mesh, biomeId, this.treeMaterials)
  }

  resolvePrefabMaterial(source, tint) {
    return resolvePrefabMaterial(source, tint, this.tintMaterials)
  }

  resolveInstanceColorMaterial(source) {
    return resolveInstanceColorMaterial(source, this.instanceColorMaterials)
  }

  dispose() {
    if (this.disposed) {
      return
    }
    this.disposed = true
    const materials = new Set([
      this.legoMaterial,
      this.previewMaterial,
      this.waterMaterial,
      this.lavaMaterial,
      ...this.treeMaterials.values(),
      ...this.instanceColorMaterials.values()
    ])
    for (const sourceCache of this.tintMaterials.values()) {
      for (const material of sourceCache.values()) {
        materials.add(material)
      }
    }
    for (const material of materials) {
      material.dispose()
    }
    this.treeMaterials.clear()
    this.tintMaterials.clear()
    this.instanceColorMaterials.clear()
  }
}
