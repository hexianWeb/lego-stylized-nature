import * as THREE from 'three/webgpu'
import { placementRandom01 } from '../../utils/random.js'
import { canPlacePrefab, pickVariantIndex, makePrefabTransform } from './placementRules.js'
import { resolvePrefabMaterial, disposeBiomeTintMaterial } from './prefabMaterialTint.js'
import { resolveTreeMaterial, resolveTreeInstanceColor, disposeTreeMaterials } from './treeMaterial.js'
import {
    normalizeInstanceColors,
    pickInstanceColorIndex,
    matchesInstanceColorMesh,
    resolveInstanceColorMaterial,
    disposeInstanceColorMaterial
} from './prefabInstanceColor.js'
import { getTerrainIterationBounds } from '../terrain/terrainMapBounds.js'

const DEFAULT_PREFAB_CAPACITY = 512

export default class PrefabPlacer {
    constructor({ config, biomeRegistry, prefabRegistry }) {
        this.config = config
        this.biomeRegistry = biomeRegistry
        this.prefabRegistry = prefabRegistry
        this.group = new THREE.Group()
        this.group.name = 'BiomePrefabs'
        this.instanceColorConfigCache = new WeakMap()
        this.missingInstanceColorMeshWarnings = new Set()
        this.overflowWarnings = new Set()
        this.meshBuckets = new Map()
        this.variantGroups = new Map()
        this._instanceMatrix = new THREE.Matrix4()
        this._composed = new THREE.Matrix4()
        this._position = new THREE.Vector3()
        this._quaternion = new THREE.Quaternion()
        this._unitScale = new THREE.Vector3(1, 1, 1)
        this._yAxis = new THREE.Vector3(0, 1, 0)
    }

    build(terrainMap) {
        this.resetBucketCounts()

        const buckets = this.collectTransforms(terrainMap)
        const activeTransformKeys = new Set()

        for (const bucket of buckets.values()) {
            const prefab = this.prefabRegistry.get(bucket.prefabId)
            const gltf = this.prefabRegistry.getVariantAsset(bucket.prefabId, bucket.variantIndex)
            if (!prefab || !gltf?.scene) {
                continue
            }

            const transformKey = this.getTransformBucketKey(bucket)
            activeTransformKeys.add(transformKey)
            this.fillTransformBucket(
                transformKey,
                gltf.scene,
                bucket.transforms,
                prefab.entry,
                bucket.tint,
                bucket.prefabId,
                bucket.biomeId
            )
        }

        this.syncVariantGroupVisibility(activeTransformKeys)

        return this.group
    }

    collectTransforms(terrainMap) {
        const buckets = new Map()
        const seed = this.config.seed
        const bounds = getTerrainIterationBounds(terrainMap, this.config)

        for (let localZ = 0; localZ < bounds.visibleDepth; localZ++) {
            for (let localX = 0; localX < bounds.visibleWidth; localX++) {
                const sampleX = bounds.halo + localX
                const sampleZ = bounds.halo + localZ
                const worldX = bounds.origin.x + localX
                const worldZ = bounds.origin.z + localZ
                const biomeCell = terrainMap.getBiomeCell(sampleX, sampleZ)
                const biome = this.biomeRegistry.get(biomeCell.biomeId)
                const surfaceCell = terrainMap.getSurfaceCell(sampleX, sampleZ)

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

                    if (placementRandom01(worldX, worldZ, seed, rule.id) > rule.density) {
                        continue
                    }

                    const variantIndex = pickVariantIndex(prefab.entry, worldX, worldZ, seed)
                    const placementHeight = surfaceCell.isWater
                        ? this.config.terrain.waterLevel
                        : surfaceCell.height
                    const transform = makePrefabTransform({
                        x: localX,
                        z: localZ,
                        height: placementHeight,
                        manifestEntry: prefab.entry,
                        config: this.config,
                        seed,
                        worldX,
                        worldZ
                    })
                    const instanceColors = this.getInstanceColors(prefab.entry)
                    if (instanceColors) {
                        transform.instanceColorIndex = pickInstanceColorIndex(
                            worldX,
                            worldZ,
                            seed,
                            rule.id,
                            instanceColors.palette.length
                        )
                    }

                    const tint = prefab.entry.biomeTints?.[biomeCell.biomeId] ?? null
                    const isTree = prefab.entry.category === 'tree'
                    const bucketBiomeId = tint || isTree ? biomeCell.biomeId : null
                    const key = this.getTransformBucketKey({
                        prefabId: rule.id,
                        variantIndex,
                        biomeId: bucketBiomeId
                    })
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

    buildVariantInstances(sourceScene, transforms, prefabEntry, tint, prefabId = 'unknown', biomeId = null) {
        sourceScene.updateMatrixWorld(true)

        const variantGroup = new THREE.Group()
        const instanceColors = this.getInstanceColors(prefabEntry)
        let matchedInstanceColorMesh = false

        sourceScene.traverse((child) => {
            if (!child.isMesh) {
                return
            }

            const meshContext = this.resolveMeshContext(child, prefabEntry, tint, biomeId, instanceColors)
            if (meshContext.usesInstanceColor) {
                matchedInstanceColorMesh = true
            }

            const mesh = new THREE.InstancedMesh(child.geometry, meshContext.material, transforms.length)
            mesh.castShadow = true
            mesh.receiveShadow = true
            this.populateInstancedMesh(
                mesh,
                child,
                transforms,
                prefabEntry,
                biomeId,
                meshContext.biome,
                instanceColors
            )
            variantGroup.add(mesh)
        })

        this.warnMissingInstanceColorMesh(instanceColors, matchedInstanceColorMesh, prefabId)

        return variantGroup
    }

    getTransformBucketKey({ prefabId, variantIndex, biomeId }) {
        return biomeId
            ? `${prefabId}:${variantIndex}:${biomeId}`
            : `${prefabId}:${variantIndex}`
    }

    getMeshBucketKey(transformKey, meshName, materialMode) {
        return `${transformKey}:${meshName}:${materialMode}`
    }

    getPrefabCapacity(prefabEntry) {
        const caps = this.config.placement?.prefabCapacity ?? {}
        const category = prefabEntry?.category ?? 'default'
        return caps[category] ?? caps.default ?? DEFAULT_PREFAB_CAPACITY
    }

    resetBucketCounts() {
        for (const bucket of this.meshBuckets.values()) {
            bucket.mesh.count = 0
        }
    }

    syncVariantGroupVisibility(activeTransformKeys) {
        for (const [key, group] of this.variantGroups.entries()) {
            group.visible = activeTransformKeys.has(key)
        }
    }

    fillTransformBucket(transformKey, sourceScene, transforms, prefabEntry, tint, prefabId, biomeId) {
        sourceScene.updateMatrixWorld(true)

        const variantGroup = this.getOrCreateVariantGroup(transformKey)
        const instanceColors = this.getInstanceColors(prefabEntry)
        let matchedInstanceColorMesh = false
        const capacity = this.getPrefabCapacity(prefabEntry)
        const instanceCount = Math.min(transforms.length, capacity)

        if (transforms.length > capacity) {
            const warningKey = `${transformKey}:${prefabId}`
            if (!this.overflowWarnings.has(warningKey)) {
                this.overflowWarnings.add(warningKey)
                console.warn(
                    `Prefab ${prefabId} exceeded capacity ${capacity}; skipped ${transforms.length - capacity} instances`
                )
            }
        }

        sourceScene.traverse((child) => {
            if (!child.isMesh) {
                return
            }

            const meshContext = this.resolveMeshContext(child, prefabEntry, tint, biomeId, instanceColors)
            if (meshContext.usesInstanceColor) {
                matchedInstanceColorMesh = true
            }

            const meshBucketKey = this.getMeshBucketKey(
                transformKey,
                child.name || 'mesh',
                meshContext.materialMode
            )
            const mesh = this.getOrCreateMeshBucket(
                meshBucketKey,
                variantGroup,
                child.geometry,
                meshContext.material,
                capacity
            )

            this.populateInstancedMesh(
                mesh,
                child,
                transforms.slice(0, instanceCount),
                prefabEntry,
                biomeId,
                meshContext.biome,
                instanceColors
            )
        })

        this.warnMissingInstanceColorMesh(instanceColors, matchedInstanceColorMesh, prefabId)
    }

    getOrCreateVariantGroup(transformKey) {
        if (!this.variantGroups.has(transformKey)) {
            const group = new THREE.Group()
            group.name = `PrefabVariant:${transformKey}`
            this.variantGroups.set(transformKey, group)
            this.group.add(group)
        }

        const group = this.variantGroups.get(transformKey)
        group.visible = true
        return group
    }

    getOrCreateMeshBucket(bucketKey, variantGroup, geometry, material, capacity) {
        const existing = this.meshBuckets.get(bucketKey)
        if (existing) {
            return existing.mesh
        }

        const mesh = new THREE.InstancedMesh(geometry, material, capacity)
        mesh.castShadow = true
        mesh.receiveShadow = true
        variantGroup.add(mesh)
        this.meshBuckets.set(bucketKey, { mesh, capacity })
        return mesh
    }

    resolveMeshContext(child, prefabEntry, tint, biomeId, instanceColors) {
        const usesInstanceColor = instanceColors
            ? matchesInstanceColorMesh(child.name, instanceColors.meshNameSuffix)
            : false
        const biome = biomeId ? this.biomeRegistry.get(biomeId) : null
        const isTree = prefabEntry.category === 'tree'
        const treeMaterial = isTree ? resolveTreeMaterial(child, biomeId) : null
        const material = isTree
            ? treeMaterial ?? resolvePrefabMaterial(child.material, tint)
            : usesInstanceColor
                ? resolveInstanceColorMaterial(child.material)
                : resolvePrefabMaterial(child.material, tint)

        let materialMode = 'source'
        if (isTree && treeMaterial) {
            materialMode = 'tree'
        } else if (usesInstanceColor) {
            materialMode = 'instanceColor'
        } else if (tint) {
            materialMode = 'tint'
        }

        return {
            material,
            biome,
            usesInstanceColor,
            isTree,
            materialMode
        }
    }

    populateInstancedMesh(mesh, child, transforms, prefabEntry, biomeId, biome, instanceColors) {
        const isTree = prefabEntry.category === 'tree'
        const usesInstanceColor = instanceColors
            ? matchesInstanceColorMesh(child.name, instanceColors.meshNameSuffix)
            : false

        transforms.forEach((t, i) => {
            this._position.fromArray(t.position)
            this._quaternion.setFromAxisAngle(this._yAxis, t.rotationY)
            this._instanceMatrix.compose(this._position, this._quaternion, this._unitScale)
            this._composed.multiplyMatrices(this._instanceMatrix, child.matrixWorld)
            mesh.setMatrixAt(i, this._composed)

            if (isTree && biome) {
                const treeColor = resolveTreeInstanceColor(
                    child,
                    biome,
                    t.x ?? 0,
                    t.y ?? 0,
                    t.z ?? 0,
                    this.config.seed
                )
                if (treeColor) {
                    mesh.setColorAt(i, treeColor)
                }
            } else if (usesInstanceColor) {
                const colorIndex = Number.isInteger(t.instanceColorIndex)
                    ? t.instanceColorIndex
                    : 0
                mesh.setColorAt(i, instanceColors.palette[colorIndex] ?? instanceColors.palette[0])
            }
        })

        mesh.count = transforms.length
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) {
            mesh.instanceColor.needsUpdate = true
        }
    }

    warnMissingInstanceColorMesh(instanceColors, matchedInstanceColorMesh, prefabId) {
        if (instanceColors && !matchedInstanceColorMesh) {
            const warningKey = `${prefabId}:${instanceColors.meshNameSuffix}`
            if (!this.missingInstanceColorMeshWarnings.has(warningKey)) {
                this.missingInstanceColorMeshWarnings.add(warningKey)
                console.warn(
                    `Prefab ${prefabId} has no mesh matching instance color suffix ${instanceColors.meshNameSuffix}`
                )
            }
        }
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
        const disposedMeshes = new Set()

        for (const { mesh } of this.meshBuckets.values()) {
            disposeBiomeTintMaterial(mesh.material)
            disposeInstanceColorMaterial(mesh.material)
            mesh.dispose()
            disposedMeshes.add(mesh)
        }
        this.meshBuckets.clear()
        this.variantGroups.clear()
        this.overflowWarnings.clear()

        const children = [...this.group.children]
        for (const child of children) {
            child.traverse((node) => {
                if (node.isInstancedMesh && !disposedMeshes.has(node)) {
                    disposeBiomeTintMaterial(node.material)
                    disposeInstanceColorMaterial(node.material)
                    node.dispose()
                }
            })
            this.group.remove(child)
        }

        disposeTreeMaterials()
    }

    dispose() {
        this.clearInstances()
        this.group.parent?.remove(this.group)
    }
}
