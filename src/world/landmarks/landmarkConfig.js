/** Asset dimensions are measured from the exported Blender GLB (Y up). */
export const SUN_GATE = Object.freeze({
  id: 'desert-sun-gate',
  name: '沙漠日轮门',
  resource: 'desertSunGateModel',
  dimensions: Object.freeze({ width: 12.8, height: 11.47, depth: 7.85 }),
})

export const LANDMARK_DEFAULTS = Object.freeze({
  enabled: true,
  targetHeight: 7.6,
  regionChunks: 3,
  foundationPadding: 0.3,
  vegetationPadding: 0.7,
  terraceBlendCells: 5,
  maxHeightRange: 14,
  terrainTopOffset: 0.12,
  revealDuration: 0.55,
  riseDistance: 0.45,
})

export function getLandmarkSettings(config) {
  return { ...LANDMARK_DEFAULTS, ...config.landmarks }
}
