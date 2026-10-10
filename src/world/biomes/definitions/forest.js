export default {
  id: 'forest',
  label: 'Forest',
  terrain: {
    shape: {
      type: 'terraced',
      // Absolute layers above waterLevel, preserving the former 0.95 height scale.
      heightCurve: [
        { n: 0.00, h: 0 },
        { n: 0.35, h: 0 },
        { n: 0.38, h: 1.9 },
        { n: 0.44, h: 1.9 },
        { n: 0.46, h: 10.45 },
        { n: 0.53, h: 10.45 },
        { n: 0.55, h: 19 },
        { n: 0.62, h: 19 },
        { n: 0.64, h: 27.55 },
        { n: 0.80, h: 27.55 },
        { n: 1.00, h: 30.4 }
      ]
    },
    colors: {
      surface: '#2e8b3c',
      subsurface: '#6e4a28',
      deep: '#8c8c8c',
      shore: '#e8d18b'
    },
    // Tone order runs cool/dark -> warm/light; height influence pushes high plateaus toward later entries.
    palettes: {
      surface: [
        { at: 0, color: '#2f6e46' },
        { at: 0.3, color: '#3f8a47' },
        { at: 0.52, color: '#5a9e48' },
        { at: 0.74, color: '#7fb350' },
        { at: 1, color: '#a8c25e' }
      ],
      subsurface: [
        { at: 0, color: '#62422a' },
        { at: 0.35, color: '#7d5734' },
        { at: 0.62, color: '#966c40' },
        { at: 1, color: '#7f7a3c' }
      ],
      deep: [
        { at: 0, color: '#646a64' },
        { at: 0.3, color: '#7a7e76' },
        { at: 0.55, color: '#959485' },
        { at: 0.78, color: '#ab9f83' },
        { at: 1, color: '#77835a' }
      ],
      shore: [
        { at: 0, color: '#c7ab74' },
        { at: 0.4, color: '#dcc28a' },
        { at: 0.7, color: '#e8d6a4' },
        { at: 1, color: '#b9b56e' }
      ]
    }
  },
  prefabs: [
    { id: 'tree', density: 0.015, minHeight: 4, maxSlope: 2 },
    { id: 'commonRock', density: 0.0175, minHeight: 4, maxSlope: 2 },
    { id: 'waterBubble', density: 0.0125 },
    { id: 'waterDuckweed', density: 0.02 },
    { id: 'phragmites', density: 0.015 },
    { id: 'landFlower', density: 0.05, minHeight: 4, maxSlope: 2 },
    { id: 'landGrass', density: 0.06, minHeight: 4, maxSlope: 2 },
    { id: 'landMushroom', density: 0.03, minHeight: 4, maxSlope: 2 }
  ]
}
