export default {
  id: 'autumnForest',
  label: 'Autumn Forest',
  terrain: {
    heightOffset: 1,
    heightMagnitude: 1.0,
    colors: {
      surface: '#c5792a',
      subsurface: '#7a4b24',
      deep: '#8c8c8c',
      shore: '#d9b36c'
    }
  },
  prefabs: [
    { id: 'autumnTree', density: 0.025, minHeight: 4, maxSlope: 2 },
    { id: 'commonRock', density: 0.04, minHeight: 4, maxSlope: 2 },
    { id: 'waterBubble', density: 0.02 },
    { id: 'waterDuckweed', density: 0.035 },
    { id: 'phragmites', density: 0.025 },
    { id: 'landFlower', density: 0.045, minHeight: 4, maxSlope: 2 },
    { id: 'landGrass', density: 0.12, minHeight: 4, maxSlope: 2 },
    { id: 'landMushroom', density: 0.06, minHeight: 4, maxSlope: 2 }
  ]
}
