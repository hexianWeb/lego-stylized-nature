export default {
  id: 'snowForest',
  label: 'Snow Forest',
  terrain: {
    shape: {
      type: 'terraced',
      noise: { scale: 100, octaves: 3 },
      noiseOffset: { x: -3107, z: 1429 },
      heightCurve: [
        { n: 0, h: 0 },
        { n: 0.28, h: 1 },
        { n: 0.36, h: 5 },
        { n: 0.43, h: 5 },
        { n: 0.49, h: 13 },
        { n: 0.56, h: 13 },
        { n: 0.63, h: 25 },
        { n: 0.72, h: 25 },
        { n: 1, h: 37 },
      ],
    },
    colors: {
      surface: '#e4f1f4',
      subsurface: '#a9c6d4',
      deep: '#738b9e',
      shore: '#c1e3ed',
    },
    palettes: {
      surface: [
        { at: 0, color: '#aacbdc' },
        { at: 0.3, color: '#c9e0e9' },
        { at: 0.55, color: '#e4f1f4' },
        { at: 0.8, color: '#f2f7f4' },
        { at: 1, color: '#ffffff' },
      ],
      subsurface: [
        { at: 0, color: '#7495ae' },
        { at: 0.5, color: '#a9c6d4' },
        { at: 1, color: '#d1e5ec' },
      ],
      deep: [
        { at: 0, color: '#52667e' },
        { at: 0.5, color: '#738b9e' },
        { at: 1, color: '#a1b4c1' },
      ],
      shore: [
        { at: 0, color: '#80b6d0' },
        { at: 0.5, color: '#c1e3ed' },
        { at: 1, color: '#e3f2f5' },
      ],
    },
  },
  trees: { leafColor: '#245b52', trunkColor: '#66564d' },
  prefabs: [
    { id: 'snowPine', density: 0.018, minHeight: 5, maxSlope: 2, patch: { scale: 32, minDensity: 0.004 } },
    { id: 'iceCluster', density: 0.006, minHeight: 4, maxSlope: 2, allowShore: true },
    { id: 'commonRock', density: 0.012, minHeight: 5, maxSlope: 3 },
  ],
}
