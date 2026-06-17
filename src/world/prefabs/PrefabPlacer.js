import * as THREE from 'three/webgpu'
import { placementRandom01 } from '../../utils/random.js'
import { canPlacePrefab, pickVariantIndex, makePrefabTransform } from './placementRules.js'
import { resolvePrefabMaterial, disposeBiomeTintMaterial } from './prefabMaterialTint.js'

export default class PrefabPlacer {
    constructor({ config, biomeRegistry, prefabRegistry }) {
        this.config = config
        this.biomeRegistry = biomeRegistry
        this.prefabRegistry = prefabRegistry
        this.group = new THREE.Group()
        this.group.name = 'BiomePrefabs'
    }

    build(terrainMap) {
        this.clearInstances()

        const buckets = this.collectTransforms(terrainMap)

        for (const bucket of buckets.values()) {
            const prefab = this.prefabRegistry.get(bucket.prefabId)
            const gltf = this.prefabRegistry.getVariantAsset(bucket.prefabId, bucket.variantIndex)
            if (!prefab || !gltf?.scene) {
                continue
            }
            this.group.add(this.buildVariantInstances(gltf.scene, bucket.transforms, prefab.entry, bucket.tint))
        }

        return this.group
    }

    collectTransforms(terrainMap) {
        const buckets = new Map()
        const { width, depth } = this.config.terrain
        const seed = this.config.seed

        for (let z = 0; z < depth; z++) {
            for (let x = 0; x < width; x++) {
                const biomeCell = terrainMap.getBiomeCell(x, z)
                const biome = this.biomeRegistry.get(biomeCell.biomeId)
                const surfaceCell = terrainMap.getSurfaceCell(x, z)

                for (const rule of biome.prefabs) {
                    const prefab = this.prefabRegistry.get(rule.id)
                    if (!prefab) {
                        continue
                    }

                    if (this.config.placement.enableTrees === false && prefab.entry.category === 'tree') {
                        continue
                    }

                    if (!canPlacePrefab(rule, prefab.entry, biomeCell, surfaceCell)) {
                        continue
                    }

                    if (placementRandom01(x, z, seed, rule.id) > rule.density) {
                        continue
                    }

                    const variantIndex = pickVariantIndex(prefab.entry, x, z, seed)
                    const placementHeight = surfaceCell.isWater
                        ? this.config.terrain.waterLevel
                        : surfaceCell.height
                    const transform = makePrefabTransform({
                        x,
                        z,
                        height: placementHeight,
                        manifestEntry: prefab.entry,
                        config: this.config,
                        seed
                    })

                    const tint = prefab.entry.biomeTints?.[biomeCell.biomeId] ?? null
                    const bucketBiomeId = tint ? biomeCell.biomeId : null
                    const key = bucketBiomeId
                        ? `${rule.id}:${variantIndex}:${bucketBiomeId}`
                        : `${rule.id}:${variantIndex}`
                    if (!buckets.has(key)) {
                        buckets.set(key, {
                            prefabId: rule.id,
                            variantIndex,
                            biomeId: bucketBiomeId,
                            tint,
                            transforms: []
                        })
                    }
                    buckets.get(key).transforms.push(transform)
                    break
                }
            }
        }

        return buckets
    }

    buildVariantInstances(sourceScene, transforms, prefabEntry, tint) {
        sourceScene.updateMatrixWorld(true)

        const variantGroup = new THREE.Group()
        const instanceMatrix = new THREE.Matrix4()
        const composed = new THREE.Matrix4()
        const position = new THREE.Vector3()
        const quaternion = new THREE.Quaternion()
        const unitScale = new THREE.Vector3(1, 1, 1)
        const yAxis = new THREE.Vector3(0, 1, 0)

        sourceScene.traverse((child) => {
            if (!child.isMesh) {
                return
            }

            const material = resolvePrefabMaterial(child.material, tint)
            const mesh = new THREE.InstancedMesh(child.geometry, material, transforms.length)
            mesh.castShadow = true
            mesh.receiveShadow = true
            transforms.forEach((t, i) => {
                position.fromArray(t.position)
                quaternion.setFromAxisAngle(yAxis, t.rotationY)
                instanceMatrix.compose(position, quaternion, unitScale)
                composed.multiplyMatrices(instanceMatrix, child.matrixWorld)
                mesh.setMatrixAt(i, composed)
            })
            mesh.instanceMatrix.needsUpdate = true
            variantGroup.add(mesh)
        })

        return variantGroup
    }

    clearInstances() {
        const children = [...this.group.children]
        for (const child of children) {
            child.traverse((node) => {
                if (node.isInstancedMesh) {
                    disposeBiomeTintMaterial(node.material)
                    node.dispose()
                }
            })
            this.group.remove(child)
        }
    }

    dispose() {
        this.clearInstances()
        this.group.parent?.remove(this.group)
    }
}
