import { BufferAttribute, BufferGeometry, Color } from 'three/webgpu'

function emitBoundaryRuns(length, getDirection, emit) {
  let start = 0
  while (start < length) {
    const direction = getDirection(start)
    let end = start + 1
    while (end < length && getDirection(end) === direction) end++
    if (direction !== 0) emit(start, end, direction)
    start = end
  }
}

/** Mesh a row-major XZ mask as one solid cloud layer. */
export function createCloudLayerGeometry({ mask, width, depth, cellSize, thickness }) {
  const positions = []
  const normals = []
  const colors = []
  const indices = []
  const top = new Color('#f5fbff')
  const bottom = new Color('#acc5d8')
  const lightSide = new Color('#e2eff7')
  const darkSide = new Color('#d1e3ef')
  const sideBottom = new Color('#b6cfdf')

  function addQuad(corners, normal, upperColor, lowerColor) {
    const start = positions.length / 3
    for (const corner of corners) {
      const color = corner[1] === 0 ? lowerColor : upperColor
      positions.push(...corner)
      normals.push(...normal)
      colors.push(color.r, color.g, color.b)
    }
    if (normal.some(value => value < 0)) {
      indices.push(start, start + 2, start + 1, start, start + 3, start + 2)
    }
    else {
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3)
    }
  }

  // Tops and undersides use the same greedy rectangles. Keep the original
  // mask intact for finding the horizontal outline.
  const remaining = new Uint8Array(mask)
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const rowStart = z * width
      if (!remaining[rowStart + x]) continue

      let endX = x + 1
      while (endX < width && remaining[rowStart + endX]) endX++

      let endZ = z + 1
      while (endZ < depth) {
        const nextRowStart = endZ * width
        if (!remaining.subarray(nextRowStart + x, nextRowStart + endX).every(Boolean)) break
        endZ++
      }

      for (let row = z; row < endZ; row++) remaining.fill(0, row * width + x, row * width + endX)
      const x0 = x * cellSize
      const x1 = endX * cellSize
      const z0 = z * cellSize
      const z1 = endZ * cellSize
      addQuad([[x0, thickness, z0], [x0, thickness, z1], [x1, thickness, z1], [x1, thickness, z0]], [0, 1, 0], top, top)
      addQuad([[x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0]], [0, -1, 0], bottom, bottom)
    }
  }

  const solid = (x, z) => x >= 0 && x < width && z >= 0 && z < depth && Boolean(mask[z * width + x])
  for (let x = 0; x <= width; x++) {
    const worldX = x * cellSize
    emitBoundaryRuns(depth, z => Number(solid(x - 1, z)) - Number(solid(x, z)), (start, end, direction) => {
      const z0 = start * cellSize
      const z1 = end * cellSize
      const upperColor = direction > 0 ? darkSide : lightSide
      addQuad([[worldX, 0, z0], [worldX, thickness, z0], [worldX, thickness, z1], [worldX, 0, z1]], [direction, 0, 0], upperColor, sideBottom)
    })
  }
  for (let z = 0; z <= depth; z++) {
    const worldZ = z * cellSize
    emitBoundaryRuns(width, x => Number(solid(x, z - 1)) - Number(solid(x, z)), (start, end, direction) => {
      const x0 = start * cellSize
      const x1 = end * cellSize
      const upperColor = direction > 0 ? lightSide : darkSide
      addQuad([[x0, 0, worldZ], [x1, 0, worldZ], [x1, thickness, worldZ], [x0, thickness, worldZ]], [0, 0, direction], upperColor, sideBottom)
    })
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}
