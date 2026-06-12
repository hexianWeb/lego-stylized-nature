import { biomePrefabs } from '../../assets/manifests/biomePrefabs.js'

export default class PrefabRegistry {
    constructor(resources, manifest = biomePrefabs) {
        this.resources = resources
        this.manifest = manifest
    }

    get(prefabId) {
        const entry = this.manifest[prefabId]
        if (!entry) {
            return null
        }
        return { id: prefabId, entry }
    }

    getVariantAsset(prefabId, variantIndex) {
        const entry = this.manifest[prefabId]
        const variant = entry?.variants[variantIndex]
        if (!variant) {
            return null
        }
        return this.resources.items[variant.source]
    }
}
