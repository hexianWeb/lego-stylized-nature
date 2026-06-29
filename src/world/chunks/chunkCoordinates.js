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

export function getChunkWindowCoords(centerCoord, radius = 1) {
  const coords = []

  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      coords.push({
        x: centerCoord.x + dx,
        z: centerCoord.z + dz
      })
    }
  }

  coords.sort((a, b) => {
    const aDistance = Math.abs(a.x - centerCoord.x) + Math.abs(a.z - centerCoord.z)
    const bDistance = Math.abs(b.x - centerCoord.x) + Math.abs(b.z - centerCoord.z)
    if (aDistance !== bDistance) {
      return aDistance - bDistance
    }
    if (a.x !== b.x) {
      return a.x - b.x
    }
    return a.z - b.z
  })

  return coords
}

export function getPlayerPrefabWindowCoords(worldBlock, chunkSize) {
  const centerCoord = getRenderChunkCoord(worldBlock.x, worldBlock.z, chunkSize)
  const localX = worldBlock.x - centerCoord.x * chunkSize
  const localZ = worldBlock.z - centerCoord.z * chunkSize
  const xOffset = localX < chunkSize * 0.5 ? -1 : 1
  const zOffset = localZ < chunkSize * 0.5 ? -1 : 1
  const xCoords = [centerCoord.x, centerCoord.x + xOffset].sort((a, b) => a - b)
  const zCoords = [centerCoord.z, centerCoord.z + zOffset].sort((a, b) => a - b)

  return [
    { x: xCoords[0], z: zCoords[0] },
    { x: xCoords[1], z: zCoords[0] },
    { x: xCoords[0], z: zCoords[1] },
    { x: xCoords[1], z: zCoords[1] }
  ]
}

export function getChunkBounds(coord, chunkSize, cellSize, padding = 0) {
  const origin = getRenderChunkOrigin(coord, chunkSize)
  const minX = origin.x * cellSize - padding
  const minZ = origin.z * cellSize - padding
  const size = chunkSize * cellSize

  return {
    minX,
    maxX: minX + size + padding * 2,
    minZ,
    maxZ: minZ + size + padding * 2
  }
}

const BOUNDS_EPSILON = 1e-9

export function boundsIntersect(a, b, epsilon = BOUNDS_EPSILON) {
  return a.minX <= b.maxX + epsilon &&
    a.maxX + epsilon >= b.minX &&
    a.minZ <= b.maxZ + epsilon &&
    a.maxZ + epsilon >= b.minZ
}

export function getCameraWorldBounds(camera, padding = 0) {
  if (!camera?.isOrthographicCamera) {
    return null
  }

  if (camera.matrixWorld?.elements) {
    return getProjectedOrthographicCameraBounds(camera, padding)
  }

  return getAxisAlignedOrthographicCameraBounds(camera, padding)
}

function getAxisAlignedOrthographicCameraBounds(camera, padding = 0) {
  const zoom = camera.zoom || 1
  const conservativeZoom = Math.min(zoom, 1)
  const halfWidth = (camera.right - camera.left) / conservativeZoom * 0.5
  const halfDepth = (camera.top - camera.bottom) / conservativeZoom * 0.5
  const x = camera.position.x
  const z = camera.position.z

  return {
    minX: x - halfWidth - padding,
    maxX: x + halfWidth + padding,
    minZ: z - halfDepth - padding,
    maxZ: z + halfDepth + padding
  }
}

function getProjectedOrthographicCameraBounds(camera, padding = 0) {
  camera.updateMatrixWorld?.(true)

  const zoom = camera.zoom || 1
  const conservativeZoom = Math.min(zoom, 1)
  const left = camera.left / conservativeZoom
  const right = camera.right / conservativeZoom
  const top = camera.top / conservativeZoom
  const bottom = camera.bottom / conservativeZoom
  const elements = camera.matrixWorld.elements
  const cameraRight = { x: elements[0], y: elements[1], z: elements[2] }
  const cameraUp = { x: elements[4], y: elements[5], z: elements[6] }
  const cameraForward = { x: -elements[8], y: -elements[9], z: -elements[10] }
  const cameraPosition = { x: elements[12], y: elements[13], z: elements[14] }

  if (Math.abs(cameraForward.y) < 1e-6) {
    return getAxisAlignedOrthographicCameraBounds(camera, padding)
  }

  const projectedCorners = [
    projectOrthographicCornerToGround(cameraPosition, cameraRight, cameraUp, cameraForward, left, top),
    projectOrthographicCornerToGround(cameraPosition, cameraRight, cameraUp, cameraForward, right, top),
    projectOrthographicCornerToGround(cameraPosition, cameraRight, cameraUp, cameraForward, left, bottom),
    projectOrthographicCornerToGround(cameraPosition, cameraRight, cameraUp, cameraForward, right, bottom)
  ]

  return {
    minX: Math.min(...projectedCorners.map((corner) => corner.x)) - padding,
    maxX: Math.max(...projectedCorners.map((corner) => corner.x)) + padding,
    minZ: Math.min(...projectedCorners.map((corner) => corner.z)) - padding,
    maxZ: Math.max(...projectedCorners.map((corner) => corner.z)) + padding
  }
}

function projectOrthographicCornerToGround(
  cameraPosition,
  cameraRight,
  cameraUp,
  cameraForward,
  localX,
  localY
) {
  const corner = {
    x: cameraPosition.x + cameraRight.x * localX + cameraUp.x * localY,
    y: cameraPosition.y + cameraRight.y * localX + cameraUp.y * localY,
    z: cameraPosition.z + cameraRight.z * localX + cameraUp.z * localY
  }
  const distanceToGround = -corner.y / cameraForward.y

  return {
    x: corner.x + cameraForward.x * distanceToGround,
    z: corner.z + cameraForward.z * distanceToGround
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
