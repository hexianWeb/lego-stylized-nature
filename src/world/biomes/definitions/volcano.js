export default {
  id: 'volcano',
  label: 'Volcano',
  terrain: {
    heightOffset: 3,
    heightMagnitude: 1.35,
    colors: {
      surface: '#4a545e',
      subsurface: '#3e4650',
      deep: '#3a4048',
      shore: '#a398aa'
    },
    // Basalt deltas: rare magma, blackstone, blue-gray basalt. Shore is lighter mauve gravel so the waterline stays separate.
    palettes: {
      surface: [
        { at: 0, color: '#6e2c18' },
        { at: 0.22, color: '#26242c' },
        { at: 0.48, color: '#4a545e' },
        { at: 0.76, color: '#62707a' },
        { at: 1, color: '#74808a' }
      ],
      subsurface: [
        { at: 0, color: '#1c1a22' },
        { at: 0.35, color: '#323840' },
        { at: 0.62, color: '#3e4650' },
        { at: 1, color: '#66707a' }
      ],
      deep: [
        { at: 0, color: '#16141a' },
        { at: 0.3, color: '#262a32' },
        { at: 0.55, color: '#3a4048' },
        { at: 0.78, color: '#514e58' },
        { at: 1, color: '#685f70' }
      ],
      shore: [
        { at: 0, color: '#7d7484' },
        { at: 0.4, color: '#a398aa' },
        { at: 0.7, color: '#c4b8cc' },
        { at: 1, color: '#ddd2e2' }
      ]
    }
  },
  lava: {
    poolDensity: 0.22,
    minVolcanoWeight: 0.65,
    poolCellScale: 18,
    poolEdgeWarp: 0.12,
    maxSlope: 4,
    darkColor: '#C2410C',
    midColor: '#F15A24',
    lightColor: '#FFB020'
  },
  prefabs: [
    { id: 'volcanoRock', density: 0.09, minHeight: 5, maxSlope: 3 }
  ]
}
