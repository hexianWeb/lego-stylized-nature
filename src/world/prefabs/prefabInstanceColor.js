import * as THREE from 'three/webgpu'
import { random01, hashString } from '../../utils/random.js'

const INSTANCE_COLOR_CLONE_FLAG = 'isInstanceColorClone'
const instanceColorMaterialCache = new WeakMap()
const instanceColorCloneSources = new WeakMap()

export function normalizeInstanceColors(config, warn = console.warn) {
  if (!config || typeof config.meshNameSuffix !== 'string' || config.meshNameSuffix.length === 0) {
    return null
  }

  const palette = []
  let warned = false
  const warnOnce = (message) => {
    if (!warned) {
      warn(message)
      warned = true
    }
  }

  for (const value of Array.isArray(config.palette) ? config.palette : []) {
    if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value.trim())) {
      warnOnce('Invalid prefab instance color palette entry')
      continue
    }
    palette.push(new THREE.Color(value.trim()))
  }

  if (palette.length === 0) {
    warnOnce('Prefab instance color palette has no valid colors')
    return null
  }

  return {
    meshNameSuffix: config.meshNameSuffix,
    palette
  }
}

export function pickInstanceColorIndex(x, z, seed, prefabId, paletteLength) {
  if (paletteLength <= 0) {
    return null
  }

  const value = random01(x, z, seed + hashString(`${prefabId}:instanceColor`))
  return Math.min(paletteLength - 1, Math.floor(value * paletteLength))
}

export function matchesInstanceColorMesh(name, suffix) {
  if (typeof name !== 'string' || typeof suffix !== 'string') {
    return false
  }

  const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escapedSuffix}(?:\\.\\d{3})?$`).test(name)
}

export function resolveInstanceColorMaterial(sourceMaterial) {
  if (Array.isArray(sourceMaterial)) {
    return sourceMaterial.map(resolveSingleInstanceColorMaterial)
  }

  return resolveSingleInstanceColorMaterial(sourceMaterial)
}

export function disposeInstanceColorMaterial(material) {
  if (Array.isArray(material)) {
    material.forEach(disposeInstanceColorMaterial)
    return
  }

  if (material?.userData?.[INSTANCE_COLOR_CLONE_FLAG] === true) {
    const sourceMaterial = instanceColorCloneSources.get(material)
    if (sourceMaterial) {
      instanceColorMaterialCache.delete(sourceMaterial)
      instanceColorCloneSources.delete(material)
    }
    material.dispose()
  }
}

function resolveSingleInstanceColorMaterial(sourceMaterial) {
  if (!sourceMaterial) {
    return sourceMaterial
  }

  if (instanceColorMaterialCache.has(sourceMaterial)) {
    return instanceColorMaterialCache.get(sourceMaterial)
  }

  const clone = sourceMaterial.clone()
  clone.color?.set?.(0xffffff)
  clone.userData = {
    ...clone.userData,
    [INSTANCE_COLOR_CLONE_FLAG]: true
  }
  clone.needsUpdate = true

  instanceColorMaterialCache.set(sourceMaterial, clone)
  instanceColorCloneSources.set(clone, sourceMaterial)

  return clone
}
