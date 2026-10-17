export const MISSIONS = [
  {
    id: 'build-a-wall',
    title: 'Build a Wall',
    brief: 'Place 5 bricks in a single straight row (same Y, consecutive X or Z).',
    goal: { type: 'straightRow', length: 5 },
    nextHint: 'Pick a 1×4 brick and drop five of them side by side.'
  },
  {
    id: 'first-tower',
    title: 'First Tower',
    brief: 'Stack 3 bricks vertically on the same cell (different Y, same XZ).',
    goal: { type: 'verticalStack', count: 3 },
    nextHint: 'Drop a 2×2, then press `]` and drop again, twice more.'
  },
  {
    id: 'mixed-colors',
    title: 'Mixed Colors',
    brief: 'Use at least 3 different colors in your build.',
    goal: { type: 'uniqueColors', count: 3 },
    nextHint: 'Change color from the swatch row before each drop.'
  }
]

/**
 * 10 bonus parts unlocked after the 3 starter missions are complete.
 * Same shape as the entries in `partsCatalog.js` so they can be
 * concatenated into the runtime catalog.
 */
export const BONUS_PARTS = [
  { partNumber: '3623', displayName: 'Plate 1×3', category: 'plate',  categoryLabel: 'Plates',  footprint: { x: 3, z: 1 }, height: 1, colorPalette: ['#0055bf', '#c91a09'] },
  { partNumber: '3460', displayName: 'Plate 1×1 Round', category: 'plate',  categoryLabel: 'Plates',  footprint: { x: 1, z: 1 }, height: 1, colorPalette: ['#fec101', '#237841'] },
  { partNumber: '4073', displayName: 'Plate 1×1 Round w/ Stud', category: 'plate',  categoryLabel: 'Plates',  footprint: { x: 1, z: 1 }, height: 1, colorPalette: ['#1b2a34', '#f4f4f4'] },
  { partNumber: '4589', displayName: 'Cone 1×1', category: 'decor',  categoryLabel: 'Decor',   footprint: { x: 1, z: 1 }, height: 3, colorPalette: ['#fec101', '#ff8e0d'] },
  { partNumber: '4079', displayName: 'Minifig Tap', category: 'decor',  categoryLabel: 'Decor',   footprint: { x: 1, z: 1 }, height: 1, colorPalette: ['#9b9b9b'] },
  { partNumber: '4081', displayName: 'Minifig Hand', category: 'decor', categoryLabel: 'Decor', footprint: { x: 1, z: 1 }, height: 1, colorPalette: ['#f4f4f4', '#1b2a34'] },
  { partNumber: '3044', displayName: 'Slope 33° 1×2', category: 'slope',  categoryLabel: 'Slopes',  footprint: { x: 2, z: 1 }, height: 3, colorPalette: ['#c91a09', '#0055bf'] },
  { partNumber: '3680', displayName: 'Slope 75° 2×1', category: 'slope',  categoryLabel: 'Slopes',  footprint: { x: 1, z: 2 }, height: 3, colorPalette: ['#f4f4f4'] },
  { partNumber: '4175', displayName: 'Technic Bush', category: 'technic', categoryLabel: 'Technic', footprint: { x: 1, z: 1 }, height: 1, colorPalette: ['#9b9b9b', '#1b2a34'] },
  { partNumber: '3700', displayName: 'Technic Brick 1×2', category: 'technic', categoryLabel: 'Technic', footprint: { x: 2, z: 1 }, height: 3, colorPalette: ['#0055bf'] }
]