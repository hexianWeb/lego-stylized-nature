export function getTerrainIterationBounds(terrainMap, config) {
  if (!terrainMap.heightField) {
    return {
      halo: 0,
      visibleWidth: config.terrain.width,
      visibleDepth: config.terrain.depth,
      origin: terrainMap.origin ?? { x: 0, z: 0 }
    }
  }

  const halo = terrainMap.halo ?? 0
  const visibleWidth = terrainMap.visibleSize ?? terrainMap.heightField.width - halo * 2
  const visibleDepth = terrainMap.visibleSize ?? terrainMap.heightField.depth - halo * 2

  return {
    halo,
    visibleWidth,
    visibleDepth,
    origin: terrainMap.origin ?? { x: 0, z: 0 }
  }
}
