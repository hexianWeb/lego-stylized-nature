export function getRenderChunkCoord(worldBlockX, worldBlockZ, chunkSize) {
  return {
    x: Math.floor(worldBlockX / chunkSize),
    z: Math.floor(worldBlockZ / chunkSize)
  }
}

export function getRenderChunkKey(coord) {
  return `${coord.x}:${coord.z}`
}

export function parseRenderChunkKey(key) {
  const [x, z] = key.split(':').map((value) => Number.parseInt(value, 10))
  return { x, z }
}

export function getRenderChunkOrigin(coord, chunkSize) {
  return {
    x: coord.x * chunkSize,
    z: coord.z * chunkSize
  }
}

export function toLocalCell(origin, worldBlockX, worldBlockZ) {
  return {
    x: worldBlockX - origin.x,
    z: worldBlockZ - origin.z
  }
}

export function getWorldBlockFromPosition(worldX, worldZ, cellSize) {
  return {
    x: Math.floor(worldX / cellSize),
    z: Math.floor(worldZ / cellSize)
  }
}

export function getPrefetchChunkCoord(activeCoord, localCell, chunkSize, threshold = 0.2) {
  const edge = chunkSize * threshold
  let x = activeCoord.x
  let z = activeCoord.z

  if (localCell.x < edge) {
    x -= 1
  } else if (localCell.x >= chunkSize - edge) {
    x += 1
  }

  if (localCell.z < edge) {
    z -= 1
  } else if (localCell.z >= chunkSize - edge) {
    z += 1
  }

  return { x, z }
}

export function coordsEqual(a, b) {
  return a.x === b.x && a.z === b.z
}
