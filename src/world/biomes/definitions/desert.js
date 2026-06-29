export default {
  id: 'desert',
  label: 'Desert',
  terrain: {
    heightOffset: -1,
    heightMagnitude: 0.65,
    colors: {
      surface: '#C2AE78',
      subsurface: '#c9a258',
      deep: '#8c8c8c',
      shore: '#e0c878'
    }
  },
  prefabs: [
    { id: 'desertCactusSmall', density: 0.0175, minHeight: 4, maxSlope: 1 },
    { id: 'skull', density: 0.01, minHeight: 4, maxSlope: 2 },
    { id: 'commonRock', density: 0.025, minHeight: 4, maxSlope: 2 },
    { id: 'waterBubble', density: 0.0075 },
    { id: 'waterDuckweed', density: 0.005 },
    { id: 'phragmites', density: 0.004 },
    { id: 'deadBush', density: 0.02, minHeight: 4, maxSlope: 2 },
    { id: 'landGrass', density: 0.005, minHeight: 4, maxSlope: 2 },
    { id: 'landMushroom', density: 0.0025, minHeight: 4, maxSlope: 2 }
  ]
}
