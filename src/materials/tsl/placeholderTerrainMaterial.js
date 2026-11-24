import { abs, attribute, float, Fn, fract, fwidth, max, mix, normalGeometry, positionGeometry, positionLocal, smoothstep, varying, vec2, vec3 } from 'three/tsl'
import * as THREE from 'three/webgpu'

const depthBelowTop = Fn(([height], builder) => {
  // Use the original depth so layers stay attached while tiles shrink away.
  return builder.object.isInstancedMesh
    ? float(0.5).sub(positionGeometry.y).mul(height)
    : height.sub(positionGeometry.y)
})

export function createPlaceholderTerrainMaterial({ cellSize, layerHeight }, { brickSeams = false, revealTiles = false } = {}) {
  const material = new THREE.MeshBasicNodeMaterial({ vertexColors: true, toneMapped: false })
  if (revealTiles) {
    material.positionNode = mix(attribute('tileAnchor', 'vec3'), positionLocal, attribute('tileCover', 'float'))
  }

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
  const subsurface = varying(attribute('subsurfaceColor', 'vec4'))
  const deep = varying(attribute('deepColor', 'vec3'))
  const depth = varying(depthBelowTop(attribute('subsurfaceColor', 'vec4').w))
  const width = fwidth(depth).mul(0.5).clamp(0.0001, layerHeight * 0.5)
  const belowSurface = smoothstep(width.negate().add(layerHeight), width.add(layerHeight), depth)
  const belowSubsurface = smoothstep(width.negate().add(3 * layerHeight), width.add(3 * layerHeight), depth)

  // Three multiplies the surface vertex or instance color into colorNode.
  // Add the weighted strata to that result before the material applies fog.
  material.colorNode = vec3(tone.mul(belowSurface.oneMinus()))
  material.emissiveNode = mix(subsurface.rgb, deep, belowSubsurface).mul(tone, belowSurface)
  return material
}
