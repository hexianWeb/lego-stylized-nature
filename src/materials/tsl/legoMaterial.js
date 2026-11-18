import {
  cameraViewMatrix,
  float,
  fract,
  fwidth,
  materialColor,
  max,
  min,
  mix,
  normalGeometry,
  normalView,
  positionGeometry,
  smoothstep,
  step,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import * as THREE from 'three/webgpu'
import { MeshStandardMaterial } from 'three'
import { normalizeStudShadingConfig } from './legoStudsConfig.js'

// When the sandbox falls back to a plain WebGLRenderer, node materials are
// replaced with a MeshStandardMaterial carrying the classic brick look.
const useWebGLFallback = () => typeof window !== 'undefined' && window.__sandbox_use_webgl === true

const WEBGL_FALLBACK_DEFAULTS = {
  metalness: 0.0,
  roughness: 0.38,
  clearcoat: 0.3,
  clearcoatRoughness: 0.22,
  envMapIntensity: 0.5,
  sheen: 0.15,
  sheenRoughness: 0.6,
}

function createWebGLFallbackMaterial(options = {}) {
  const merged = { ...WEBGL_FALLBACK_DEFAULTS, ...options }
  const material = new MeshStandardMaterial()
  material.metalness = merged.metalness
  material.roughness = merged.roughness
  material.envMapIntensity = merged.envMapIntensity
  if (merged.colorTint !== undefined) {
    material.color = new THREE.Color(merged.colorTint)
  }
  return material
}

export function createLegoMaterial({ studs = null, studShading = {}, ...rest } = {}) {
  if (useWebGLFallback()) {
    return createWebGLFallbackMaterial(rest)
  }
  const material = new THREE.MeshPhysicalNodeMaterial()
  material.metalness = 0.0
  material.roughness = 0.36
  material.clearcoat = 0.45
  material.clearcoatRoughness = 0.22
  material.envMapIntensity = 0.75
  material.sheen = 0.12
  material.sheenRoughness = 0.5
  if (studs)
    applyStudShading(material, studs, studShading)
  return material
}

// Only update uniforms: live tuning must not recompile the shared material.
export function syncLegoStudShading(material, config) {
  const settings = normalizeStudShadingConfig(config)
  const studs = material.userData.studs
  if (studs) {
    for (const [key, value] of Object.entries(settings))
      studs[key].value = key === 'enabled' ? Number(value) : value
  }
  return settings
}

// Draws the stud pattern on the brick deck in the fragment shader, so bricks
// whose LOD dropped the stud geometry keep their surface detail. Lengths are
// in stud periods; once a period approaches the pixel Nyquist limit the
// pattern fades to its area average instead of aliasing into moire.
function applyStudShading(material, { deckY, pitch, originX, originZ, radius }, config) {
  const settings = normalizeStudShadingConfig(config)
  const studs = Object.fromEntries(Object.entries(settings).map(([key, value]) => [
    key,
    uniform(key === 'enabled' ? Number(value) : value),
  ]))
  const { shadow, tilt, topBrighten, shadowWidth, rimWidth, fadeStart, fadeEnd } = studs
  const r = min(float(radius / pitch).mul(studs.radiusScale), 0.49)
  // Keep the contact ring inside one cell, even when the radius is enlarged.
  const shadowOuter = min(r.add(shadowWidth), 0.5)

  const p = positionGeometry.xz.sub(vec2(originX, originZ)).div(pitch)
  const q = fract(p.add(0.5)).sub(0.5)
  const d = q.length()
  const fw = fwidth(p)
  const footprint = max(fw.x, fw.y)
  const aa = max(footprint.mul(0.75), 1e-5)
  const detail = float(1).sub(smoothstep(fadeStart, max(fadeStart.add(0.01), fadeEnd), footprint))
  const deck = step(0.9, normalGeometry.y).mul(step(positionGeometry.y, deckY + 1e-3))
  const influence = deck.mul(studs.enabled).mul(studs.strength)

  const top = float(1).sub(smoothstep(aa.negate().add(r), aa.add(r), d))
  const ring = float(1).sub(smoothstep(r, aa.add(shadowOuter), d)).mul(top.oneMinus()).mul(step(1e-5, shadowWidth))
  const shade = top.mul(topBrighten).add(1).sub(ring.mul(shadow))
  const mean = shadow.mul(meanShadowCoverage(r, shadowOuter)).negate().add(topBrighten.mul(Math.PI).mul(r).mul(r).add(1))
  material.colorNode = materialColor.mul(mix(1, mix(mean, shade, detail), influence))

  const rim = smoothstep(max(0, r.sub(rimWidth)), r, d).mul(top)
  const slope = rim.mul(tilt).mul(detail)
  const outward = q.div(max(d, 1e-4)).mul(slope)
  const deckNormal = cameraViewMatrix.mul(vec4(vec3(outward.x, 1, outward.y).normalize(), 0)).xyz
  material.normalNode = mix(normalView, deckNormal, influence).normalize()

  material.userData.studs = studs
}

// Area of one stud cell darkened by the contact ring, as used by `ring` above.
// Exact smoothstep integral, kept as nodes so radius/width edits update the
// unresolved pattern's mean as well as its visible rings.
function meanShadowCoverage(inner, outer) {
  const width = outer.sub(inner)
  return width.mul(inner).add(width.mul(width).mul(0.3)).mul(Math.PI)
}
