export default {
  id: 'forest',
  label: 'Forest',
  terrain: {
    heightOffset: 0,
    heightMagnitude: 0.95,
    colors: {
      surface: '#2e8b3c',
      subsurface: '#6e4a28',
      deep: '#8c8c8c',
      shore: '#e8d18b'
    }
  },
  prefabs: [
    { id: 'forestTree', density: 0.03, minHeight: 4, maxSlope: 2 },
    { id: 'commonRock', density: 0.035, minHeight: 4, maxSlope: 2 },
    { id: 'waterBubble', density: 0.025 },
    { id: 'waterDuckweed', density: 0.04 },
    { id: 'phragmites', density: 0.03 },
    { id: 'landFlower', density: 0.1, minHeight: 4, maxSlope: 2 },
    { id: 'landGrass', density: 0.12, minHeight: 4, maxSlope: 2 },
    { id: 'landMushroom', density: 0.06, minHeight: 4, maxSlope: 2 }
  ]
}
