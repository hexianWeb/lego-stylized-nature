export const biomePrefabs = {
  waterBubble: {
    category: 'waterAccent',
    placement: { surface: 'water' },
    variants: [
      { source: 'waterBubbleModel', weight: 1 }
    ],
    randomRotation: true
  },
  waterDuckweed: {
    category: 'waterPlant',
    placement: { surface: 'water' },
    variants: [
      { source: 'waterDuckweedModel', weight: 1 }
    ],
    randomRotation: true
  },
  phragmites: {
    category: 'waterPlant',
    placement: { surface: 'water' },
    variants: [
      { source: 'phragmitesModel', weight: 1 }
    ],
    randomRotation: true
  },
  commonRock: {
    category: 'rock',
    placement: { surface: 'land' },
    variants: [
      { source: 'commonRock1Model', weight: 1 },
      { source: 'commonRock2Model', weight: 1 },
      { source: 'commonRock3Model', weight: 1 },
      { source: 'commonRock4Model', weight: 1 }
    ],
    randomRotation: true,
    biomeTints: {
      forest: { color: '#7a8178', strength: 0.35 },
      autumnForest: { color: '#9a7a55', strength: 0.4 },
      desert: { color: '#b59a68', strength: 0.45 },
      volcano: { color: '#3a3a3a', strength: 0.65 }
    }
  },
  forestTree: {
    category: 'tree',
    placement: { surface: 'land', biomes: ['forest'] },
    variants: [
      { source: 'forestTreeGreenModel', weight: 1 },
      // { source: 'forestTreeCoconutModel', weight: 1 }
    ],
    randomRotation: false
  },
  autumnTree: {
    category: 'tree',
    placement: { surface: 'land', biomes: ['autumnForest'] },
    variants: [
      { source: 'autumnTreeModel', weight: 1 }
    ],
    randomRotation: false
  },
  desertCactusSmall: {
    category: 'plant',
    placement: { surface: 'land', biomes: ['desert'] },
    variants: [
      { source: 'desertCactusModel', weight: 1 }
    ],
    randomRotation: true,
  },
  skull: {
    category: 'prop',
    placement: { surface: 'land', biomes: ['desert'] },
    variants: [
      { source: 'skullModel', weight: 1 }
    ],
    randomRotation: true
  },
  deadBush: {
    category: 'plant',
    placement: { surface: 'land', biomes: ['desert'] },
    variants: [
      { source: 'deadBushModel', weight: 1 }
    ],
    randomRotation: true
  },
  landGrass: {
    category: 'flora',
    placement: { surface: 'land' },
    variants: [
      { source: 'landGrassModel', weight: 1 },
      { source: 'landGrass2Model', weight: 1 },
      { source: 'landGrass3Model', weight: 0.25 }
    ],
    randomRotation: true,
    biomeTints: {
      forest: { color: '#67b65d', strength: 0.35 },
      autumnForest: { color: '#c99a42', strength: 0.55 },
      desert: { color: '#c6b56a', strength: 1 }
    }
  },
  landMushroom: {
    category: 'flora',
    placement: { surface: 'land' },
    variants: [
      { source: 'landMushroom1Model', weight: 0.5 }
    ],
    randomRotation: true,
    instanceColors: {
      meshNameSuffix: '_InstanceColor',
      palette: ['#ff0000', '#0158b8', '#ea9202', '#03b1a0']
    }
  },
  landFlower: {
    category: 'flora',
    placement: { surface: 'land', biomes: ['forest', 'autumnForest'] },
    variants: [
      { source: 'landFlowerModel', weight: 0.5 }
    ],
    randomRotation: true,
    instanceColors: {
      meshNameSuffix: '_InstanceColor',
      palette: ['#ff0000', '#ffff00', '#ffffff']
    }
  }
}
