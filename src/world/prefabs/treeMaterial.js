import * as THREE from 'three/webgpu'
import { random01 } from '../../utils/random.js'

const HSL_JITTER = {
  hue: 0.08,
  saturation: 0.04,
  lightness: 0.04
}

const PART_SEED = {
  root: 41,
  leaf: 0
}

const materialCache = new Map()
const _color = new THREE.Color()
const _hsl = { h: 0, s: 0, l: 0 }

export function resolveTreeMaterial(mesh, biomeId) {
  const part = getTreePart(mesh)
  if (!part) {
    return null
  }

  const cacheKey = `${biomeId}:${part}`
  if (!materialCache.has(cacheKey)) {
    materialCache.set(cacheKey, new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.38,
      metalness: 0.0,
      clearcoat: 0.3,
      clearcoatRoughness: 0.22,
      ior: 1.5
    }))
  }

  return materialCache.get(cacheKey)
}

export function resolveTreeInstanceColor(mesh, biome, x, y, z, seed) {
  const part = getTreePart(mesh)
  const colors = biome?.terrain?.colors
  if (!part || !colors) {
    return null
  }

  const baseHex = part === 'root' ? colors.subsurface : colors.surface
  return applyHslJitter(baseHex, x, y, z, seed, PART_SEED[part])
}

export function disposeTreeMaterials() {
  for (const material of materialCache.values()) {
    material.dispose()
  }
  materialCache.clear()
}

function applyHslJitter(baseHex, x, y, z, seed, salt) {
  _color.set(baseHex)
  _color.getHSL(_hsl)

  const hueJitter = (random01(x, y, seed + z + salt) * 2 - 1) * HSL_JITTER.hue
  const satJitter = (random01(z, x, seed + y + salt + 17) * 2 - 1) * HSL_JITTER.saturation
  const lightJitter = (random01(y, z, seed + x + salt + 31) * 2 - 1) * HSL_JITTER.lightness

  _hsl.h = (_hsl.h + hueJitter + 1) % 1
  _hsl.s = THREE.MathUtils.clamp(_hsl.s + satJitter, 0, 1)
  _hsl.l = THREE.MathUtils.clamp(_hsl.l + lightJitter, 0, 1)

  return _color.setHSL(_hsl.h, _hsl.s, _hsl.l).clone()
}

function getTreePart(mesh) {
  for (let node = mesh; node; node = node.parent) {
    const name = node.name?.toLowerCase?.() ?? ''
    if (name.includes('root')) {
      return 'root'
    }
    if (name.includes('leaf')) {
      return 'leaf'
    }
  }

  return null
}
