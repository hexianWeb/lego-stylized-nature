import * as THREE from 'three/webgpu'

const TINT_CLONE_FLAG = 'isBiomeTintClone'

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
    material.dispose()
  }
}

function resolveSinglePrefabMaterial(sourceMaterial, normalizedTint) {
  if (!sourceMaterial || !normalizedTint) {
    return sourceMaterial
  }

  const clone = sourceMaterial.clone()
  const sourceColor = sourceMaterial.color?.clone?.() ?? new THREE.Color(0xffffff)
  const targetColor = sourceColor.clone().multiply(normalizedTint.color)

  clone.color = sourceColor.clone().lerp(targetColor, normalizedTint.strength)
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
