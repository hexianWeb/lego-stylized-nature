import * as THREE from 'three/webgpu'
import { placementRandom01 } from '../../utils/random.js'
import { canPlacePrefab, pickVariantIndex, makePrefabTransform } from './placementRules.js'
import { resolvePrefabMaterial, disposeBiomeTintMaterial } from './prefabMaterialTint.js'
import {
    normalizeInstanceColors,
    pickInstanceColorIndex,
    matchesInstanceColorMesh,
    resolveInstanceColorMaterial,
    disposeInstanceColorMaterial
} from './prefabInstanceColor.js'

export default class PrefabPlacer {
    constructor({ config, biomeRegistry, prefabRegistry }) {
        this.config = config
        this.biomeRegistry = biomeRegistry
        this.prefabRegistry = prefabRegistry
        this.group = new THREE.Group()
        this.group.name = 'BiomePrefabs'
        this.instanceColorConfigCache = new WeakMap()
        this.missingInstanceColorMeshWarnings = new Set()
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
            this.group.add(
                this.buildVariantInstances(
                    gltf.scene,
                    bucket.transforms,
                    prefab.entry,
                    bucket.tint,
                    bucket.prefabId
                )
            )
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
                    const instanceColors = this.getInstanceColors(prefab.entry)
                    if (instanceColors) {
                        transform.instanceColorIndex = pickInstanceColorIndex(
                            x,
                            z,
                            seed,
                            rule.id,
                            instanceColors.palette.length
                        )
                    }

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

    buildVariantInstances(sourceScene, transforms, prefabEntry, tint, prefabId = 'unknown') {
        sourceScene.updateMatrixWorld(true)

        const variantGroup = new THREE.Group()
        const instanceColors = this.getInstanceColors(prefabEntry)
        let matchedInstanceColorMesh = false
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

            const usesInstanceColor = instanceColors
                ? matchesInstanceColorMesh(child.name, instanceColors.meshNameSuffix)
                : false
            if (usesInstanceColor) {
                matchedInstanceColorMesh = true
            }
            const material = usesInstanceColor
                ? resolveInstanceColorMaterial(child.material)
                : resolvePrefabMaterial(child.material, tint)
            const mesh = new THREE.InstancedMesh(child.geometry, material, transforms.length)
            mesh.castShadow = true
            mesh.receiveShadow = true
            transforms.forEach((t, i) => {
                position.fromArray(t.position)
                quaternion.setFromAxisAngle(yAxis, t.rotationY)
                instanceMatrix.compose(position, quaternion, unitScale)
                composed.multiplyMatrices(instanceMatrix, child.matrixWorld)
                mesh.setMatrixAt(i, composed)
                if (usesInstanceColor) {
                    const colorIndex = Number.isInteger(t.instanceColorIndex)
                        ? t.instanceColorIndex
                        : 0
                    mesh.setColorAt(i, instanceColors.palette[colorIndex] ?? instanceColors.palette[0])
                }
            })
            mesh.instanceMatrix.needsUpdate = true
            if (mesh.instanceColor) {
                mesh.instanceColor.needsUpdate = true
            }
            variantGroup.add(mesh)
        })

        if (instanceColors && !matchedInstanceColorMesh) {
            const warningKey = `${prefabId}:${instanceColors.meshNameSuffix}`
            if (!this.missingInstanceColorMeshWarnings.has(warningKey)) {
                this.missingInstanceColorMeshWarnings.add(warningKey)
                console.warn(
                    `Prefab ${prefabId} has no mesh matching instance color suffix ${instanceColors.meshNameSuffix}`
                )
            }
        }

        return variantGroup
    }

    getInstanceColors(prefabEntry) {
        if (!prefabEntry || typeof prefabEntry !== 'object') {
            return null
        }
        if (!this.instanceColorConfigCache.has(prefabEntry)) {
            this.instanceColorConfigCache.set(
                prefabEntry,
                normalizeInstanceColors(prefabEntry.instanceColors)
            )
        }
        return this.instanceColorConfigCache.get(prefabEntry)
    }

    clearInstances() {
        const children = [...this.group.children]
        for (const child of children) {
            child.traverse((node) => {
                if (node.isInstancedMesh) {
                    disposeBiomeTintMaterial(node.material)
                    disposeInstanceColorMaterial(node.material)
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
