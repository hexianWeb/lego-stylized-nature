import { MeshStandardNodeMaterial } from 'three/webgpu'
import { MeshStandardMaterial } from 'three'

const useWebGL = typeof window !== 'undefined' && window.__sandbox_use_webgl === true
const MaterialClass = useWebGL ? MeshStandardMaterial : MeshStandardNodeMaterial

const DEFAULTS = {
  metalness: 0.0,
  roughness: 0.38,
  clearcoat: 0.3,
  clearcoatRoughness: 0.22,
  envMapIntensity: 0.5,
  sheen: 0.15,
  sheenRoughness: 0.6
}

/**
 * Create the shared Lego TSL physical material.
 *
 * Per-instance color is injected via `InstancedMesh.setColorAt` and modulated
 * by the WebGPU node pipeline automatically. Do NOT set `material.colorNode`
 * here — that would override the per-instance color path.
 *
 * @param {Partial<typeof DEFAULTS> & { colorTint?: string | number }} [options]
 */
export function createLegoMaterial(options = {}) {
  const merged = { ...DEFAULTS, ...options }
  const material = new MaterialClass()

  material.metalness = merged.metalness
  material.roughness = merged.roughness
  material.clearcoat = merged.clearcoat
  material.clearcoatRoughness = merged.clearcoatRoughness
  material.envMapIntensity = merged.envMapIntensity
  material.sheen = merged.sheen
  material.sheenRoughness = merged.sheenRoughness

  if (options.colorTint !== undefined) {
    material.color = new THREE.Color(options.colorTint)
  }

  return material
}
