export const worldConfig = {
  seed: 20260608,
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
    enableTrees: false,
    rotationStep: Math.PI / 2
  },
  water: {
    color: '#2d9bd4',
    rippleStrength: 0.06,
    rippleSpeed: 0.6
  }
}
