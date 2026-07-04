import * as THREE from 'three/webgpu'

const TINT_CLONE_FLAG = 'isBiomeTintClone'
const tintMaterialCache = new WeakMap()
const tintCloneCacheKeys = new WeakMap()

export function resolvePrefabMaterial(sourceMaterial, tint) {
  if (!tint) {
    return sourceMaterial
  }

  const normalized = normalizeTint(tint)
  if (!normalized) {
    return sourceMaterial
  }

  if (Array.isArray(sourceMaterial)) {
    return sourceMaterial.map((material) => resolveSinglePrefabMaterial(material, normalized))
  }

  return resolveSinglePrefabMaterial(sourceMaterial, normalized)
}

export function disposeBiomeTintMaterial(material) {
  if (Array.isArray(material)) {
    material.forEach(disposeBiomeTintMaterial)
    return
  }

  if (material?.userData?.[TINT_CLONE_FLAG] === true) {
    const cacheKey = tintCloneCacheKeys.get(material)
    if (cacheKey) {
      tintMaterialCache.get(cacheKey.sourceMaterial)?.delete(cacheKey.cacheKey)
      tintCloneCacheKeys.delete(material)
    }
    material.dispose()
  }
}

function resolveSinglePrefabMaterial(sourceMaterial, normalizedTint) {
  if (!sourceMaterial || !normalizedTint) {
    return sourceMaterial
  }

  const cacheKey = getTintCacheKey(normalizedTint)
  let sourceCache = tintMaterialCache.get(sourceMaterial)
  if (!sourceCache) {
    sourceCache = new Map()
    tintMaterialCache.set(sourceMaterial, sourceCache)
  }
  if (sourceCache.has(cacheKey)) {
    return sourceCache.get(cacheKey)
  }

  const clone = sourceMaterial.clone()
  const sourceColor = sourceMaterial.color?.clone?.() ?? new THREE.Color(0xffffff)
  const targetColor = normalizedTint.color

  clone.color = sourceColor.clone().lerp(targetColor, normalizedTint.strength)
  clone.userData = {
    ...clone.userData,
    [TINT_CLONE_FLAG]: true
  }
  clone.needsUpdate = true

  sourceCache.set(cacheKey, clone)
  tintCloneCacheKeys.set(clone, { sourceMaterial, cacheKey })

  return clone
}

function getTintCacheKey(normalizedTint) {
  return `${normalizedTint.color.getHexString()}:${normalizedTint.strength}`
}

function normalizeTint(tint) {
  if (typeof tint.color !== 'string') {
    console.warn('Invalid prefab biome tint color:', tint.color)
    return null
  }

  const colorString = tint.color.trim()
  if (!isUsableTintColorString(colorString)) {
    console.warn('Invalid prefab biome tint color:', tint.color)
    return null
  }

  const color = new THREE.Color()
  color.set(colorString)

  const strength = Number.isFinite(tint.strength) ? tint.strength : 1

  return {
    color,
    strength: THREE.MathUtils.clamp(strength, 0, 1)
  }
}

function isUsableTintColorString(color) {
  if (color.length === 0) {
    return false
  }

  if (/^#[A-Fa-f\d]{3}$/.test(color) || /^#[A-Fa-f\d]{6}$/.test(color)) {
    return true
  }

  if (/^(rgb|rgba)\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/.test(color)) {
    return true
  }

  if (/^(rgb|rgba)\(\s*(\d+)%\s*,\s*(\d+)%\s*,\s*(\d+)%\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/.test(color)) {
    return true
  }

  if (/^(hsl|hsla)\(\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)%\s*,\s*(\d*\.?\d+)%\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/.test(color)) {
    return true
  }

  return THREE.Color.NAMES[color.toLowerCase()] !== undefined
}
