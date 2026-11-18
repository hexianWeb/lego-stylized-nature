import { biomePrefabs } from '../../assets/manifests/biomePrefabs.js'
import { prefabBuilders } from './builders/index.js'

// Loaded assets belong to Resources; this registry owns only the builder output.
export default class PrefabRegistry {
  constructor(resources, manifest = biomePrefabs, builders = prefabBuilders) {
    this.resources = resources
    this.manifest = manifest
    this.builders = builders
    this.builtAssets = new Map()
    this.disposed = false
  }

  get(prefabId) {
    const entry = this.manifest[prefabId]
    if (!entry) {
      return null
    }
    return { id: prefabId, entry }
  }

  getVariantAsset(prefabId, variantIndex) {
    if (this.disposed) {
      return null
    }
    const entry = this.manifest[prefabId]
    const variant = entry?.variants?.[variantIndex]
    if (!variant) {
      return null
    }
    if (variant.builder) {
      return this.getBuiltAsset(`${prefabId}:${variantIndex}`, variant)
    }
    return this.resources.items[variant.source]
  }

  getBuiltAsset(key, variant) {
    if (this.disposed) {
      return null
    }
    if (!this.builtAssets.has(key)) {
      const build = Object.hasOwn(this.builders, variant.builder)
        ? this.builders[variant.builder]
        : null
      const asset = typeof build === 'function' ? { scene: build(variant.params) } : null
      this.builtAssets.set(key, asset)
    }
    return this.builtAssets.get(key)
  }

  dispose() {
    if (this.disposed) {
      return
    }
    this.disposed = true
    const geometries = new Set()
    const materials = new Set()
    for (const asset of this.builtAssets.values()) {
      asset?.scene.traverse((node) => {
        if (!node.isMesh) {
          return
        }
        if (node.geometry) {
          geometries.add(node.geometry)
        }
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          if (material) {
            materials.add(material)
          }
        }
      })
    }
    this.builtAssets.clear()
    for (const geometry of geometries) {
      geometry.dispose()
    }
    for (const material of materials) {
      material.dispose()
    }
  }
}
