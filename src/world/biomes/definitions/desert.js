export default {
  id: 'desert',
  label: 'Desert',
  terrain: {
    heightOffset: -1,
    heightMagnitude: 0.65,
    colors: {
      surface: '#d2b77f',
      subsurface: '#ca945b',
      deep: '#aa8c6b',
      shore: '#e8d3a4'
    },
    // Ochre dune shade -> pale sunlit sand; terracotta soil sits above muted sandstone.
    palettes: {
      surface: [
        { at: 0, color: '#a78c5c' },
        { at: 0.3, color: '#c0a16c' },
        { at: 0.52, color: '#d2b77f' },
        { at: 0.74, color: '#e4cc99' },
        { at: 1, color: '#efdeb6' }
      ],
      subsurface: [
        { at: 0, color: '#8e5f40' },
        { at: 0.35, color: '#b07849' },
        { at: 0.62, color: '#ca945b' },
        { at: 1, color: '#ddaf74' }
      ],
      deep: [
        { at: 0, color: '#71695b' },
        { at: 0.3, color: '#8d7b63' },
        { at: 0.55, color: '#aa8c6b' },
        { at: 0.78, color: '#c4a481' },
        { at: 1, color: '#dbc099' }
      ],
      shore: [
        { at: 0, color: '#bca374' },
        { at: 0.4, color: '#d4bc8a' },
        { at: 0.7, color: '#e8d3a4' },
        { at: 1, color: '#f4e3be' }
      ]
    }
  },
  prefabs: [
    { id: 'desertCactusSmall', density: 0.0175, minHeight: 4, maxSlope: 1 },
    { id: 'skull', density: 0.01, minHeight: 4, maxSlope: 2 },
    { id: 'commonRock', density: 0.025, minHeight: 4, maxSlope: 2 },
    { id: 'deadBush', density: 0.02, minHeight: 4, maxSlope: 2 },
    { id: 'landGrass', density: 0.005, minHeight: 4, maxSlope: 2 },
    { id: 'landMushroom', density: 0.0025, minHeight: 4, maxSlope: 2 }
  ]
}
