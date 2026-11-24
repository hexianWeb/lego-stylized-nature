import { abs, attribute, float, fract, fwidth, max, mix, normalGeometry, positionLocal, smoothstep, varying, vec2, vec3 } from 'three/tsl'
import * as THREE from 'three/webgpu'

/** The same unlit shader works on both the stepped mesh and the instanced box control. */
export function createMidTerrainMaterial({ cellSize, layerHeight }, brickSeams) {
  const material = new THREE.MeshBasicNodeMaterial({ vertexColors: true, toneMapped: false })
  material.positionNode = mix(attribute('tileAnchor', 'vec3'), positionLocal, attribute('tileCover', 'float'))

  const n = normalGeometry
  const top = max(n.y, 0)
  // Match the distant boxes' directional face colors without a lighting/shadow pass.
  const shade = varying(float(0.74).add(top.mul(0.26)).sub(max(n.y.negate(), 0).mul(0.29))
    .sub(max(n.x, 0).mul(0.09)).add(max(n.x.negate(), 0).mul(0.08)))
  let tone = shade
  if (brickSeams) {
    // Chunk origins are integer brick offsets. Local coordinates keep the grid in
    // phase across seams, even far from the origin, without large world-space floats.
    const grid = varying(vec2(
      mix(positionLocal.x, positionLocal.z, abs(n.x)).div(cellSize),
      mix(positionLocal.y.div(layerHeight), positionLocal.z.div(cellSize), top),
    ))
    const footprint = max(fwidth(grid), 0.0001)
    const width = footprint.mul(0.5)
    const distance = abs(fract(grid.add(0.5)).sub(0.5))
    const line = smoothstep(vec2(0.045).sub(width), vec2(0.045).add(width), distance).oneMinus()
      .mul(smoothstep(0.16, 0.5, footprint).oneMinus())
    tone = shade.mul(max(line.x, line.y).mul(0.38).oneMinus())
  }
  material.colorNode = vec3(tone)
  return material
}
