export default [
  { name: 'studioEnvMap', type: 'hdrTexture', path: 'hdri/grasslands_sunset_1k.hdr' },
  { name: 'waterNoiseTexture', type: 'texture', path: 'texture/noise.jpg' },

  { name: 'brick2x2Model', type: 'gltfModel', path: 'model/terrain/legoBlock2x2.glb', required: true },
  { name: 'playerAircraftModel', type: 'gltfModel', path: 'model/player/fly.glb' },
  { name: 'desertSunGateModel', type: 'gltfModel', path: 'model/landmarks/desert-sun-gate.glb', required: true },

  { name: 'waterBubbleModel', type: 'gltfModel', path: 'model/prefab/bubble.glb' },

  { name: 'commonRock1Model', type: 'gltfModel', path: 'model/prefab/rock_1.glb' },
  { name: 'commonRock2Model', type: 'gltfModel', path: 'model/prefab/rock_2.glb' },
  { name: 'commonRock3Model', type: 'gltfModel', path: 'model/prefab/rock_3.glb' },
  { name: 'commonRock4Model', type: 'gltfModel', path: 'model/prefab/rock_4.glb' },

  { name: 'treeModel', type: 'gltfModel', path: 'model/tree/tree.glb' },
  { name: 'fruitTreeModel', type: 'gltfModel', path: 'model/tree/fruittree.glb' },
  { name: 'cTreeModel', type: 'gltfModel', path: 'model/tree/Ctree.glb' },
  { name: 'wetlandTreeModel', type: 'gltfModel', path: 'model/tree/wetland_tree.glb' },

  { name: 'deadBushModel', type: 'gltfModel', path: 'model/prefab/dead_bush.glb' },
  { name: 'skullModel', type: 'gltfModel', path: 'model/prefab/skull.glb' },
]
