import * as THREE from 'three/webgpu'
import { random01 } from '../../utils/random.js'

const HSL_JITTER = {
  hue: 0.08,
  saturation: 0.04,
  lightness: 0.04,
}

const PART_SEED = {
  root: 41,
  leaf: 0,
}

const DEFAULT_TREE_COLORS = {
  leafColor: '#2e8b3c',
  trunkColor: '#6e4a28',
}

// Source asset names are stable; weak keys do not retain disposed GLTF scenes.
const treeParts = new WeakMap()
const baseHslCache = new WeakMap()
const _color = new THREE.Color()

export function resolveTreeMaterial(mesh, biomeId, materialCache = new Map()) {
  const part = getTreePart(mesh)
  if (!part) {
    return null
  }

  const cacheKey = `${biomeId}:${part}`
  if (!materialCache.has(cacheKey)) {
    materialCache.set(cacheKey, new THREE.MeshPhysicalMaterial({
      color: 0xFFFFFF,
      roughness: 0.26,
      metalness: 0.0,
      clearcoat: 0.65,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.75,
      ior: 1.5,
    }))
  }

  return materialCache.get(cacheKey)
}

export function resolveTreeInstanceColor(mesh, biome, x, y, z, seed, target = new THREE.Color()) {
  const part = getTreePart(mesh)
  if (!part || !biome) {
    return null
  }

  const baseHsl = getBaseHsl(biome, part)
  return applyHslJitter(baseHsl, x, y, z, seed, PART_SEED[part], target)
}

function getBaseHsl(biome, part) {
  const colorKey = part === 'root' ? 'trunkColor' : 'leafColor'
  const baseHex = biome.trees?.[colorKey] ?? DEFAULT_TREE_COLORS[colorKey]
  let colors = baseHslCache.get(biome)
  if (!colors) {
    colors = {}
    baseHslCache.set(biome, colors)
  }
  if (colors[part]?.hex !== baseHex) {
    colors[part] = { hex: baseHex, h: 0, s: 0, l: 0 }
    _color.set(baseHex).getHSL(colors[part])
  }
  return colors[part]
}

function applyHslJitter(baseHsl, x, y, z, seed, salt, target) {
  const hueJitter = (random01(x, y, seed + z + salt) * 2 - 1) * HSL_JITTER.hue
  const satJitter = (random01(z, x, seed + y + salt + 17) * 2 - 1) * HSL_JITTER.saturation
  const lightJitter = (random01(y, z, seed + x + salt + 31) * 2 - 1) * HSL_JITTER.lightness

  return target.setHSL(
    (baseHsl.h + hueJitter + 1) % 1,
    THREE.MathUtils.clamp(baseHsl.s + satJitter, 0, 1),
    THREE.MathUtils.clamp(baseHsl.l + lightJitter, 0, 1),
  )
}

function getTreePart(mesh) {
  if (!mesh) {
    return null
  }
  if (treeParts.has(mesh)) {
    return treeParts.get(mesh)
  }

  let part = null
  for (let node = mesh; node; node = node.parent) {
    const name = node.name?.toLowerCase?.() ?? ''
    if (name.includes('root')) {
      part = 'root'
      break
    }
    if (name.includes('leaf')) {
      part = 'leaf'
      break
    }
  }

  treeParts.set(mesh, part)
  return part
}
