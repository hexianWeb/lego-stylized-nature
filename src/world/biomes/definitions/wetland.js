export default {
  id: 'wetland',
  label: 'Wetland',
  terrain: {
    shape: {
      type: 'terraced',
      noise: { scale: 44, octaves: 3 },
      noiseOffset: { x: -1571, z: -4933 },
      // Shallow pools separated by low muddy shelves and small grassy islands.
      heightCurve: [
        { n: 0, h: -2 },
        { n: 0.34, h: -1 },
        { n: 0.48, h: 0 },
        { n: 0.54, h: 1 },
        { n: 0.59, h: 2 },
        { n: 0.68, h: 3 },
        { n: 1, h: 6 },
      ],
    },
    colors: {
      surface: '#4e7e65',
      subsurface: '#625b41',
      deep: '#596761',
      shore: '#85805a',
    },
    palettes: {
      surface: [
        { at: 0, color: '#30594c' },
        { at: 0.3, color: '#426e59' },
        { at: 0.55, color: '#4e7e65' },
        { at: 0.8, color: '#70936b' },
        { at: 1, color: '#99aa77' },
      ],
      subsurface: [
        { at: 0, color: '#454c3b' },
        { at: 0.5, color: '#625b41' },
        { at: 1, color: '#8b7e53' },
      ],
      deep: [
        { at: 0, color: '#3d4e4b' },
        { at: 0.5, color: '#596761' },
        { at: 1, color: '#7e8c7c' },
      ],
      shore: [
        { at: 0, color: '#5d6549' },
        { at: 0.5, color: '#85805a' },
        { at: 1, color: '#aaa16e' },
      ],
    },
  },
  trees: { leafColor: '#d4b04a', trunkColor: '#6e4a28' },
  prefabs: [
    { id: 'wetlandTree', density: 0.007, minHeight: 4, maxSlope: 1, allowShore: true },
    { id: 'commonRock', density: 0.006, minHeight: 5, maxSlope: 2 },
    { id: 'waterLily', density: 0.018, maxWaterDepth: 2, patch: { scale: 18, minDensity: 0.002 } },
    { id: 'phragmites', density: 0.075, maxWaterDepth: 1, patch: { scale: 16, minDensity: 0.008 } },
    { id: 'waterDuckweed', density: 0.045, maxWaterDepth: 2, patch: { scale: 22, minDensity: 0.005 } },
    { id: 'landGrass', density: 0.075, minHeight: 4, maxSlope: 1, allowShore: true, patch: { scale: 20, minDensity: 0.015 } },
    { id: 'landMushroom', density: 0.008, minHeight: 5, maxSlope: 1 },
  ],
}
