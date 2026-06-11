export const worldConfig = {
  seed: 20260608,
  terrain: {
    width: 96,
    depth: 96,
    maxHeight: 18,
    layerHeight: 0.16,
    cellSize: 0.32,
    waterLevel: 3,
    noiseScale: 34,
    noiseOctaves: 4,
    noiseGain: 0.5,
    noiseLacunarity: 2,
    seaClip: 0.35
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
    rotationStep: Math.PI / 2,
    scaleStep: 0.05
  },
  water: {
    color: '#2d9bd4',
    opacity: 0.82,
    rippleStrength: 0.06,
    rippleSpeed: 0.6
  }
}
