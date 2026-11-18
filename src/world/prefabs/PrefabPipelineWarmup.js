import * as THREE from 'three/webgpu'
import { getPrefabCapacity } from './prefabCapacity.js'
import { shouldCastPrefabShadow } from './prefabShadows.js'
import {
  matchesInstanceColorMesh,
  normalizeInstanceColors,
} from './prefabInstanceColor.js'

const WARMUP_GROUP_NAME = 'PrefabPipelineWarmup'

export function buildPrefabPipelineWarmupGroup({ prefabRegistry, materials, config }) {
  const group = new THREE.Group()
  group.name = WARMUP_GROUP_NAME

  for (const [prefabId, prefabEntry] of Object.entries(prefabRegistry?.manifest ?? {})) {
    const variants = Array.isArray(prefabEntry.variants) ? prefabEntry.variants : []
    const capacity = getPrefabCapacity(config, prefabEntry)

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

        addWarmupMesh(group, child, child.material, 'source', capacity, prefabEntry)
        addTintWarmupMeshes(group, child, prefabEntry, materials, capacity)
        addTreeWarmupMeshes(group, child, prefabEntry, materials, capacity)
        addInstanceColorWarmupMesh(group, child, prefabEntry, materials, capacity)
      })
    })
  }

  return group
}

export async function warmupPrefabPipelines({
  renderer,
  scene,
  camera,
  prefabRegistry,
  materials,
  config,
  renderFrame = null,
  retainPipelines = false,
}) {
  if (typeof renderer?.compileAsync !== 'function' || !scene || !camera || !prefabRegistry) {
    return { compiled: false, meshCount: 0 }
  }

  const group = buildPrefabPipelineWarmupGroup({ prefabRegistry, materials, config })
  const meshCount = countInstancedMeshes(group)
  if (meshCount === 0) {
    return { compiled: false, meshCount: 0 }
  }

  scene.add(group)
  let compiled = false
  try {
    await renderer.compileAsync(scene, camera)
    // Exercise the actual target and shadow passes before the animation loop.
    if (renderFrame) {
      await renderFrame()
    }
    compiled = true
  }
  finally {
    scene.remove(group)
    if (!compiled || !retainPipelines)
      disposeWarmupGroup(group)
  }

  // WebGPU releases unused pipeline cache entries with their RenderObjects.
  // Keep these objects detached, owned by World until it is disposed.
  return { compiled: true, meshCount, dispose: () => disposeWarmupGroup(group) }
}

function addTintWarmupMeshes(group, child, prefabEntry, materials, capacity) {
  for (const tint of Object.values(prefabEntry.biomeTints ?? {})) {
    addWarmupMesh(group, child, materials.resolvePrefabMaterial(child.material, tint), 'tint', capacity, prefabEntry)
  }
}

function addTreeWarmupMeshes(group, child, prefabEntry, materials, capacity) {
  if (prefabEntry.category !== 'tree') {
    return
  }

  const biomeIds = getTreeWarmupBiomeIds(prefabEntry)
  for (const biomeId of biomeIds) {
    const material = materials.resolveTreeMaterial(child, biomeId)
    if (material) {
      addWarmupMesh(group, child, material, 'tree', capacity, prefabEntry, { useInstanceColor: true })
    }
  }
}

function addInstanceColorWarmupMesh(group, child, prefabEntry, materials, capacity) {
  const instanceColors = normalizeInstanceColors(prefabEntry.instanceColors)
  if (!instanceColors || !matchesInstanceColorMesh(child.name, instanceColors.meshNameSuffix)) {
    return
  }

  addWarmupMesh(
    group,
    child,
    materials.resolveInstanceColorMaterial(child.material),
    'instanceColor',
    capacity,
    prefabEntry,
    { color: instanceColors.palette[0] },
  )
}

function addWarmupMesh(group, child, material, materialMode, capacity, prefabEntry, { color = null, useInstanceColor = false } = {}) {
  const mesh = new THREE.InstancedMesh(child.geometry, material, capacity)
  mesh.name = `PrefabPipelineWarmup:${materialMode}:${child.name || 'mesh'}`
  mesh.userData.prefabWarmupMaterialMode = materialMode
  mesh.frustumCulled = false
  mesh.castShadow = shouldCastPrefabShadow(prefabEntry)
  mesh.receiveShadow = true
  mesh.setMatrixAt(0, new THREE.Matrix4())
  if (color || useInstanceColor) {
    mesh.setColorAt(0, color ?? new THREE.Color(0xFFFFFF))
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
