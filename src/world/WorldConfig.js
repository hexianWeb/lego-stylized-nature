import { TILT_SHIFT_DEFAULTS } from '../renderer/postprocessing/tiltShiftConfig.js'

export const worldConfig = {
  seed: 20260608,
  postProcessing: {
    tiltShift: { ...TILT_SHIFT_DEFAULTS }
  },
  terrain: {
    width: 128,
    depth: 128,
    maxHeight: 28,
    layerHeight: 0.095,
    cellSize: 0.2,
    waterLevel: 3,
    noiseScale: 34,
    noiseOctaves: 4,
    noiseGain: 0.5,
    noiseLacunarity: 2,
    seaClip: 0.35,
    ao: {
      enabled: true,
      previewGrayscale: false,
      strength: 1.4,
      min: 0.2,
      horizonScale: 2.5,
      creviceScale: 2.5,
      depthScale: 6.5,
      horizonWeight: 0.61,
      creviceWeight: 0.42,
      depthWeight: 0.32,
      sideWeight: 0.52
    }
  },
  biomes: {
    regions: [
      { id: 'forest', center: [24, 34], radius: 30, weight: 1 },
      { id: 'autumnForest', center: [45, 28], radius: 28, weight: 1 },
      { id: 'desert', center: [72, 42], radius: 30, weight: 1 },
      { id: 'volcano', center: [58, 74], radius: 32, weight: 1 }
    ]
  },
  placement: {
    enableTrees: true,
    rotationStep: Math.PI / 2
  },
  water: {
    darkColor: '#0757A6',
    midColor: '#168FD2',
    lightColor: '#42DDEB',
    textureScale: 0.3,
    flowSpeed: 1.2,
    flowStrength: 0.72,
    flowVariance: 0.55,
    roughness: 0.3,
    clearcoat: 0.45,
    clearcoatRoughness: 0.2
  }
}
