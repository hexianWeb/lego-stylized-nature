export const biomePrefabs = {
  waterBubble: {
    category: 'waterAccent',
    placement: { surface: 'water' },
    variants: [
      { source: 'waterBubbleModel', weight: 1 },
    ],
    randomRotation: true,
  },
  waterDuckweed: {
    category: 'waterPlant',
    placement: { surface: 'water' },
    variants: [
      { builder: 'duckweed', weight: 1 },
    ],
    randomRotation: true,
  },
  phragmites: {
    category: 'waterPlant',
    placement: { surface: 'water' },
    variants: [
      { builder: 'phragmites', weight: 1 },
    ],
    randomRotation: true,
  },
  commonRock: {
    category: 'rock',
    placement: { surface: 'land' },
    variants: [
      { source: 'commonRock1Model', weight: 1 },
      { source: 'commonRock2Model', weight: 1 },
      { source: 'commonRock3Model', weight: 1 },
      { source: 'commonRock4Model', weight: 1 },
    ],
    randomRotation: true,
    biomeTints: {
      forest: { color: '#7a8178', strength: 0.35 },
      autumnForest: { color: '#958970', strength: 0.45 },
      desert: { color: '#c4a481', strength: 0.55 },
      volcano: { color: '#48464a', strength: 0.65 },
      snowForest: { color: '#a8c8dc', strength: 0.7 },
      meadow: { color: '#d3c4b4', strength: 0.7 },
      wetland: { color: '#647d6c', strength: 0.65 },
    },
  },
  volcanoRock: {
    category: 'rock',
    placement: { surface: 'land', biomes: ['volcano'] },
    variants: [
      { builder: 'volcanoRock', weight: 0.3 },
      { builder: 'volcanoRockSmall', weight: 0.7 },
    ],
    randomRotation: true,
    instanceColors: {
      meshNameSuffix: '_InstanceColor',
      palette: ['#ff6a00', '#ff9a1f', '#d94212', '#8f1f14', '#b45a1c'],
    },
  },
  tree: {
    category: 'tree',
    placement: { surface: 'land', biomes: ['forest', 'autumnForest', 'meadow'] },
    variants: [
      { source: 'treeModel', weight: 1 },
      { source: 'fruitTreeModel', weight: 1 },
      { source: 'cTreeModel', weight: 1 },
    ],
    randomRotation: false,
  },
  desertCactusSmall: {
    category: 'plant',
    placement: { surface: 'land', biomes: ['desert'] },
    variants: [
      { builder: 'cactus', weight: 1 },
    ],
    randomRotation: true,
  },
  skull: {
    category: 'prop',
    placement: { surface: 'land', biomes: ['desert'] },
    variants: [
      { source: 'skullModel', weight: 1 },
    ],
    randomRotation: true,
  },
  deadBush: {
    category: 'plant',
    placement: { surface: 'land', biomes: ['desert'] },
    variants: [
      { source: 'deadBushModel', weight: 1 },
    ],
    randomRotation: true,
  },
  landGrass: {
    category: 'flora',
    placement: { surface: 'land' },
    variants: [
      { builder: 'grassShort', weight: 2 },
      { builder: 'grassTall', weight: 0.25 },
    ],
    randomRotation: true,
    biomeTints: {
      forest: { color: '#67b65d', strength: 0.35 },
      autumnForest: { color: '#cfa04c', strength: 0.75 },
      desert: { color: '#d2b77f', strength: 1 },
      meadow: { color: '#c5b98b', strength: 0.9 },
      wetland: { color: '#5d9274', strength: 0.8 },
    },
  },
  landMushroom: {
    category: 'flora',
    placement: { surface: 'land' },
    variants: [
      { builder: 'mushroom', weight: 0.5 },
    ],
    randomRotation: true,
    instanceColors: {
      meshNameSuffix: '_InstanceColor',
      palette: ['#ff0000', '#0158b8', '#ea9202', '#03b1a0'],
    },
  },
  landFlower: {
    category: 'flora',
    placement: { surface: 'land', biomes: ['forest', 'autumnForest'] },
    variants: [
      { builder: 'flower', weight: 0.5 },
    ],
    randomRotation: true,
    instanceColors: {
      meshNameSuffix: '_InstanceColor',
      palette: ['#ff1111', '#ffff00', '#ffffff'],
    },
  },
  snowPine: {
    category: 'tree',
    placement: { surface: 'land', biomes: ['snowForest'] },
    variants: [
      { builder: 'snowPine', weight: 2 },
      { builder: 'snowPine', params: { scale: 0.75 }, weight: 1 },
    ],
    randomRotation: true,
  },
  iceCluster: {
    category: 'rock',
    placement: { surface: 'land', biomes: ['snowForest'] },
    variants: [{ builder: 'iceCluster', weight: 1 }],
    randomRotation: true,
  },
  meadowFlower: {
    category: 'flora',
    placement: { surface: 'land', biomes: ['meadow'] },
    variants: [{ builder: 'flower', params: { stemColor: '#89916b' }, weight: 1 }],
    randomRotation: true,
    instanceColors: {
      meshNameSuffix: '_InstanceColor',
      palette: ['#f4bf4f', '#fff4df', '#a58bd0', '#d985ad'],
    },
  },
  wetlandTree: {
    category: 'tree',
    placement: { surface: 'land', biomes: ['wetland'] },
    variants: [{ source: 'wetlandTreeModel', weight: 1 }],
    randomRotation: true,
  },
  waterLily: {
    category: 'waterPlant',
    placement: { surface: 'water', biomes: ['wetland'] },
    variants: [{ builder: 'waterLily', weight: 1 }],
    randomRotation: true,
    instanceColors: {
      meshNameSuffix: '_InstanceColor',
      palette: ['#f1b4cf', '#fff1dd', '#d6b6e8'],
    },
  },
}
