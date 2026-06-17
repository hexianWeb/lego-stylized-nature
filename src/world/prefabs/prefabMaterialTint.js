import * as THREE from 'three/webgpu'

const TINT_CLONE_FLAG = 'isBiomeTintClone'

export function resolvePrefabMaterial(sourceMaterial, tint) {
  if (Array.isArray(sourceMaterial)) {
    return sourceMaterial.map((material) => resolveSinglePrefabMaterial(material, tint))
  }

  return resolveSinglePrefabMaterial(sourceMaterial, tint)
}

export function disposeBiomeTintMaterial(material) {
  if (Array.isArray(material)) {
    material.forEach(disposeBiomeTintMaterial)
    return
  }

  if (material?.userData?.[TINT_CLONE_FLAG] === true) {
    material.dispose()
  }
}

function resolveSinglePrefabMaterial(sourceMaterial, tint) {
  if (!sourceMaterial || !tint) {
    return sourceMaterial
  }

  const normalized = normalizeTint(tint)
  if (!normalized) {
    return sourceMaterial
  }

  const clone = sourceMaterial.clone()
  const sourceColor = sourceMaterial.color?.clone?.() ?? new THREE.Color(0xffffff)
  const targetColor = sourceColor.clone().multiply(normalized.color)

  clone.color = sourceColor.clone().lerp(targetColor, normalized.strength)
  clone.userData = {
    ...clone.userData,
    [TINT_CLONE_FLAG]: true
  }
  clone.needsUpdate = true

  return clone
}

function normalizeTint(tint) {
  if (typeof tint.color !== 'string') {
    console.warn('Invalid prefab biome tint color:', tint.color)
    return null
  }

  const color = new THREE.Color()
  try {
    color.set(tint.color)
  } catch {
    console.warn('Invalid prefab biome tint color:', tint.color)
    return null
  }

  const strength = Number.isFinite(tint.strength) ? tint.strength : 1

  return {
    color,
    strength: THREE.MathUtils.clamp(strength, 0, 1)
  }
}
