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
  lava: {
    poolDensity: 0.2,
    crackDensity: 0.3,
    minVolcanoWeight: 0.65,
    poolNoiseScale: 30,
    crackNoiseScale: 7,
    maxSlope: 4,
    pulseSpeed: 1.35,
    glowStrength: 1.15,
    roughness: 0.34
  },
  prefabs: [
    { id: 'commonRock', density: 0.09, minHeight: 5, maxSlope: 3 }
  ]
}
