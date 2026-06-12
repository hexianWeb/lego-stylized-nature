import * as THREE from 'three/webgpu'
import { placementRandom01 } from '../../utils/random.js'
import { canPlacePrefab, pickVariantIndex, makePrefabTransform } from './placementRules.js'

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

        for (const [key, transforms] of buckets) {
            const [prefabId, variantIndex] = key.split(':')
            const gltf = this.prefabRegistry.getVariantAsset(prefabId, Number(variantIndex))
            if (!gltf?.scene) {
                continue
            }
            this.group.add(this.buildVariantInstances(gltf.scene, transforms))
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

                    const key = `${rule.id}:${variantIndex}`
                    if (!buckets.has(key)) {
                        buckets.set(key, [])
                    }
                    buckets.get(key).push(transform)
                    break
                }
            }
        }

        return buckets
    }

    buildVariantInstances(sourceScene, transforms) {
        sourceScene.updateMatrixWorld(true)

        const variantGroup = new THREE.Group()
        const instanceMatrix = new THREE.Matrix4()
        const composed = new THREE.Matrix4()
        const position = new THREE.Vector3()
        const quaternion = new THREE.Quaternion()
        const scale = new THREE.Vector3()
        const yAxis = new THREE.Vector3(0, 1, 0)

        sourceScene.traverse((child) => {
            if (!child.isMesh) {
                return
            }

            const mesh = new THREE.InstancedMesh(child.geometry, child.material, transforms.length)
            transforms.forEach((t, i) => {
                position.fromArray(t.position)
                quaternion.setFromAxisAngle(yAxis, t.rotationY)
                scale.setScalar(t.scale)
                instanceMatrix.compose(position, quaternion, scale)
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
