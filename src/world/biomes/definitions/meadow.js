export default {
  id: 'meadow',
  label: 'Blossom Hills',
  terrain: {
    shape: {
      type: 'terraced',
      noise: { scale: 58, octaves: 3 },
      noiseOffset: { x: 4211, z: 619 },
      // Short rolling ridges and planted shelves make the flower hills readable from the air.
      heightCurve: [
        { n: 0, h: 0 },
        { n: 0.22, h: 1 },
        { n: 0.33, h: 5 },
        { n: 0.42, h: 9 },
        { n: 0.48, h: 16 },
        { n: 0.56, h: 16 },
        { n: 0.63, h: 24 },
        { n: 0.71, h: 24 },
        { n: 1, h: 32 },
      ],
    },
    colors: {
      surface: '#6fa84a',
      subsurface: '#b09573',
      deep: '#b9afa3',
      shore: '#e7d6b6',
    },
    palettes: {
      surface: [
        { at: 0, color: '#3f7a3c' },
        { at: 0.25, color: '#568f42' },
        { at: 0.48, color: '#6fa84a' },
        { at: 0.7, color: '#8cbc55' },
        { at: 0.88, color: '#a8ce62' },
        { at: 1, color: '#c4dc74' },
      ],
      subsurface: [
        { at: 0, color: '#8b745d' },
        { at: 0.5, color: '#b09573' },
        { at: 1, color: '#d1b998' },
      ],
      deep: [
        { at: 0, color: '#8b8991' },
        { at: 0.5, color: '#b9afa3' },
        { at: 1, color: '#d7cbbb' },
      ],
      shore: [
        { at: 0, color: '#b9ae89' },
        { at: 0.5, color: '#e7d6b6' },
        { at: 1, color: '#f0e5cf' },
      ],
    },
  },
  trees: {
    leafColor: '#a2a475',
    trunkColor: '#80613e',
    variantWeights: { treeModel: 1, fruitTreeModel: 2 },
  },
  prefabs: [
    { id: 'tree', density: 0.0015, minHeight: 5, maxSlope: 1 },
    { id: 'commonRock', density: 0.007, minHeight: 5, maxSlope: 3 },
    { id: 'meadowFlower', density: 0.095, minHeight: 4, maxSlope: 3, patch: { scale: 18, minDensity: 0.008 } },
    { id: 'landGrass', density: 0.012, minHeight: 4, maxSlope: 2 },
    { id: 'waterDuckweed', density: 0.012 },
    { id: 'phragmites', density: 0.012, maxWaterDepth: 1 },
  ],
}
