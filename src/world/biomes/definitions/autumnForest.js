export default {
  id: 'autumnForest',
  label: 'Autumn Forest',
  terrain: {
    shape: {
      type: 'terraced',
      noiseOffset: { x: 1709, z: -2381 },
      // Low waterside terraces and tall upper plateaus emphasize the elevation contrast.
      heightCurve: [
        { n: 0.00, h: 0 },
        { n: 0.35, h: 0 },
        { n: 0.38, h: 1 },
        { n: 0.44, h: 1 },
        { n: 0.46, h: 9 },
        { n: 0.55, h: 9 },
        { n: 0.57, h: 23 },
        { n: 0.66, h: 23 },
        { n: 0.68, h: 40 },
        { n: 1.00, h: 40 }
      ]
    },
    colors: {
      surface: '#df6827',
      subsurface: '#7a4b24',
      deep: '#958970',
      shore: '#e08878'
    },
    // Dappled forest ground: leaf litter, coarse dirt, rust grass, sunlit orange, yellow poplar.
    // Shore is pale red clay: lighter and redder than the rust grass, so the bank stays warm without matching the inland surface.
    palettes: {
      surface: [
        { at: 0, color: '#8c3a04' },
        { at: 0.22, color: '#7a5842' },
        { at: 0.48, color: '#df6827' },
        { at: 0.78, color: '#e68e30' },
        { at: 1, color: '#f0c14e' }
      ],
      subsurface: [
        { at: 0, color: '#5e412f' },
        { at: 0.35, color: '#7a4b32' },
        { at: 0.62, color: '#98603b' },
        { at: 1, color: '#b1814b' }
      ],
      deep: [
        { at: 0, color: '#656b62' },
        { at: 0.3, color: '#7c7c69' },
        { at: 0.55, color: '#958970' },
        { at: 0.78, color: '#ad9b7b' },
        { at: 1, color: '#c5af86' }
      ],
      shore: [
        { at: 0, color: '#b08b54' },
        { at: 0.4, color: '#c8a66b' },
        { at: 0.7, color: '#dfc184' },
        { at: 1, color: '#eed7a5' }
      ]
    }
  },
  prefabs: [
    { id: 'tree', density: 0.0125, minHeight: 4, maxSlope: 2 },
    { id: 'commonRock', density: 0.02, minHeight: 4, maxSlope: 2 },
    { id: 'waterBubble', density: 0.01 },
    { id: 'waterDuckweed', density: 0.0175 },
    { id: 'phragmites', density: 0.0125 },
    { id: 'landFlower', density: 0.0225, minHeight: 4, maxSlope: 2 },
    { id: 'landGrass', density: 0.06, minHeight: 4, maxSlope: 2 },
    { id: 'landMushroom', density: 0.03, minHeight: 4, maxSlope: 2 }
  ]
}
