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
  commonRock: {
    category: 'rock',
    placement: { surface: 'land' },
    variants: [
      { source: 'commonRock1Model', weight: 1 },
      { source: 'commonRock2Model', weight: 1 },
      { source: 'commonRock3Model', weight: 1 },
      { source: 'commonRock4Model', weight: 1 }
    ],
    randomRotation: true
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
  landGrass: {
    category: 'flora',
    placement: { surface: 'land' },
    variants: [
      { source: 'landGrassModel', weight: 1 },
      { source: 'landGrass2Model', weight: 1 }
    ],
    randomRotation: true
  },
  landFlower: {
    category: 'flora',
    placement: { surface: 'land', biomes: ['forest', 'autumnForest'] },
    variants: [
      { source: 'landFlowerModel', weight: 1 }
    ],
    randomRotation: true
  }
}
