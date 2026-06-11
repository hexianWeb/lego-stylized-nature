export default {
  id: 'volcano',
  label: 'Volcano',
  terrain: {
    heightOffset: 3,
    heightMagnitude: 1.35,
    colors: {
      surface: '#3f3f3f',
      subsurface: '#2b2420',
      deep: '#1c1c1c',
      shore: '#5a3a2c'
    }
  },
  prefabs: [
    { id: 'commonRock', density: 0.09, minHeight: 5, maxSlope: 3 },
    { id: 'waterBubble', density: 0.015 }
  ]
}
