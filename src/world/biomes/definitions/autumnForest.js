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
