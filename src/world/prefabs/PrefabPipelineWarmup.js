import * as THREE from 'three/webgpu'
import { resolvePrefabMaterial } from './prefabMaterialTint.js'
import { resolveTreeMaterial } from './treeMaterial.js'
import {
  matchesInstanceColorMesh,
  normalizeInstanceColors,
  resolveInstanceColorMaterial
} from './prefabInstanceColor.js'

const WARMUP_GROUP_NAME = 'PrefabPipelineWarmup'

export function buildPrefabPipelineWarmupGroup({ prefabRegistry }) {
  const group = new THREE.Group()
  group.name = WARMUP_GROUP_NAME

  for (const [prefabId, prefabEntry] of Object.entries(prefabRegistry?.manifest ?? {})) {
    const variants = Array.isArray(prefabEntry.variants) ? prefabEntry.variants : []

    variants.forEach((variant, variantIndex) => {
      const sourceScene = prefabRegistry.getVariantAsset?.(prefabId, variantIndex)?.scene
      if (!sourceScene) {
        return
      }

      sourceScene.updateMatrixWorld(true)
      sourceScene.traverse((child) => {
        if (!child.isMesh) {
          return
        }

        addWarmupMesh(group, child, child.material, 'source')
        addTintWarmupMeshes(group, child, prefabEntry)
        addTreeWarmupMeshes(group, child, prefabEntry)
        addInstanceColorWarmupMesh(group, child, prefabEntry)
      })
    })
  }

  return group
}

export async function warmupPrefabPipelines({
  renderer,
  scene,
  camera,
  prefabRegistry
}) {
  if (typeof renderer?.compileAsync !== 'function' || !scene || !camera || !prefabRegistry) {
    return { compiled: false, meshCount: 0 }
  }

  const group = buildPrefabPipelineWarmupGroup({ prefabRegistry })
  const meshCount = countInstancedMeshes(group)
  if (meshCount === 0) {
    return { compiled: false, meshCount: 0 }
  }

  scene.add(group)
  try {
    await renderer.compileAsync(scene, camera)
  } finally {
    scene.remove(group)
    disposeWarmupGroup(group)
  }

  return { compiled: true, meshCount }
}

function addTintWarmupMeshes(group, child, prefabEntry) {
  for (const tint of Object.values(prefabEntry.biomeTints ?? {})) {
    addWarmupMesh(group, child, resolvePrefabMaterial(child.material, tint), 'tint')
  }
}

function addTreeWarmupMeshes(group, child, prefabEntry) {
  if (prefabEntry.category !== 'tree') {
    return
  }

  const biomeIds = getTreeWarmupBiomeIds(prefabEntry)
  for (const biomeId of biomeIds) {
    const material = resolveTreeMaterial(child, biomeId)
    if (material) {
      addWarmupMesh(group, child, material, 'tree', { useInstanceColor: true })
    }
  }
}

function addInstanceColorWarmupMesh(group, child, prefabEntry) {
  const instanceColors = normalizeInstanceColors(prefabEntry.instanceColors)
  if (!instanceColors || !matchesInstanceColorMesh(child.name, instanceColors.meshNameSuffix)) {
    return
  }

  addWarmupMesh(
    group,
    child,
    resolveInstanceColorMaterial(child.material),
    'instanceColor',
    { color: instanceColors.palette[0] }
  )
}

function addWarmupMesh(group, child, material, materialMode, { color = null, useInstanceColor = false } = {}) {
  const mesh = new THREE.InstancedMesh(child.geometry, material, 1)
  mesh.name = `PrefabPipelineWarmup:${materialMode}:${child.name || 'mesh'}`
  mesh.userData.prefabWarmupMaterialMode = materialMode
  mesh.setMatrixAt(0, new THREE.Matrix4())
  if (color || useInstanceColor) {
    mesh.setColorAt(0, color ?? new THREE.Color(0xffffff))
    mesh.instanceColor.needsUpdate = true
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.count = 1
  group.add(mesh)
}

function getTreeWarmupBiomeIds(prefabEntry) {
  const biomeIds = prefabEntry.placement?.biomes
  return Array.isArray(biomeIds) && biomeIds.length > 0
    ? biomeIds
    : ['default']
}

function countInstancedMeshes(group) {
  let count = 0
  group.traverse((node) => {
    if (node.isInstancedMesh) {
      count++
    }
  })
  return count
}

function disposeWarmupGroup(group) {
  group.traverse((node) => {
    if (node.isInstancedMesh) {
      node.dispose()
    }
  })
  group.clear()
}
