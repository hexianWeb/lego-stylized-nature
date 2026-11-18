import * as THREE from 'three/webgpu'
import { LEGO_COLORS } from './legoColors.js'
import { cylinder, makePrefabScene } from './prefabParts.js'

// The two GLBs share their dark rock. The larger variant adds a cluster of
// transparent, square-ended crystals, rather than a second dark rock shape.
export function buildVolcanoRock() {
  const scene = makePrefabScene([
    darkRockSlot(),
    {
      name: 'volcano_rock_InstanceColor',
      color: LEGO_COLORS.volcanoLava,
      parts: [unionConvexParts(crystalCluster())],
    },
  ])
  const lava = scene.getObjectByName('volcano_rock_InstanceColor').material
  lava.transparent = true
  lava.depthWrite = false
  lava.opacity = 0.7
  lava.metalness = 0.064
  lava.roughness = 0.314
  lava.side = THREE.DoubleSide
  return scene
}

export function buildVolcanoRockSmall() {
  return makePrefabScene([darkRockSlot()])
}

function darkRockSlot() {
  // All dimensions below are local to the terrain stud, in world units.
  // Keep the source's smaller rectangular base and its two exposed studs.
  const parts = [rectangularLoft([
    { x: 0.00263, z: 0.00541, width: 0.08688, depth: 0.07792, y: 0 },
    { x: 0.00263, z: 0.00541, width: 0.08922, depth: 0.08026, y: 0.00117 },
    { x: 0.00263, z: 0.00541, width: 0.08922, depth: 0.08026, y: 0.0185 },
    { x: 0.00263, z: 0.00541, width: 0.08688, depth: 0.07792, y: 0.01967 },
  ], 0.00117)]

  // Unequal shoulders, a broad sloping face, and a short flattened summit.
  // Separate intersecting masses preserve the source's stepped silhouette.
  parts.push(rectangularLoft([
    { x: 0.008, z: -0.0118, width: 0.066, depth: 0.037, y: 0.0185 },
    { x: 0.009, z: -0.0118, width: 0.069, depth: 0.038, y: 0.031 },
    { x: 0.007, z: -0.0115, width: 0.063, depth: 0.035, y: 0.052 },
    { x: 0.008, z: -0.011, width: 0.054, depth: 0.032, y: 0.077 },
    { x: 0.0128, z: -0.01135, width: 0.0253, depth: 0.02065, y: 0.0982 },
    { x: 0.0128, z: -0.01135, width: 0.022, depth: 0.018, y: 0.09955 },
  ], 0.0012))
  parts.push(rectangularLoft([
    { x: 0.0212, z: 0.0242, width: 0.038, depth: 0.033, y: 0.0185 },
    { x: 0.0226, z: 0.0242, width: 0.0356, depth: 0.033, y: 0.031 },
    { x: 0.0196, z: 0.0191, width: 0.0292, depth: 0.0247, y: 0.051 },
    { x: 0.0204, z: 0.0182, width: 0.016, depth: 0.013, y: 0.068 },
  ], 0.0012))

  for (const [x, z] of [[-0.025, 0.026], [-0.025, 0.001]]) {
    parts.push(cylinder({ radius: 0.009, height: 0.009, segments: 12 })
      .translate(x, 0.0185, z))
  }
  return { name: 'volcano_rock', color: LEGO_COLORS.volcanoRock, parts }
}

function crystalCluster() {
  return [
    // A continuous low core fills the gaps between the square arms. The
    // source crystals surround the rock, rather than growing as loose rods.
    rectangularLoft([
      { x: 0.004, z: 0.006, width: 0.074, depth: 0.090, y: 0.018 },
      { x: 0.004, z: 0.010, width: 0.090, depth: 0.085, y: 0.055 },
      { x: 0.003, z: 0.009, width: 0.078, depth: 0.052, y: 0.099 },
    ], 0.004, true),
    // The two central square towers have different heights and beveled tips.
    crystal([0.004108, 0.020, 0.009096], [0.004108, 0.1802, 0.009096], 0.0317, 0.031324, 0.008495),
    crystal([0.004108, 0.020, -0.019963], [0.004108, 0.14624, -0.019963], 0.0317, 0.026795, 0.01061),
    // Four outward leaning crystal arms form the wide upper silhouette.
    crystal([-0.0234, 0.053, 0.009096], [-0.04502, 0.107955, 0.009096], 0.03132, 0.031324, 0.0106),
    crystal([0.03776, 0.08105, 0.009096], [0.05053, 0.129705, 0.009096], 0.03192, 0.031324, 0.010),
    crystal([0.004108, 0.052, 0.030], [0.004108, 0.12207, 0.055777], 0.0317, 0.030385, 0.0106),
    crystal([0.004, 0.042, -0.024], [-0.016, 0.101, -0.060], 0.030, 0.032, 0.010),
    // Low crystal feet connect the arms to the rock and form the lower lobes.
    crystal([-0.0315, 0.018, 0.009096], [-0.0315, 0.049, 0.009096], 0.032, 0.031324, 0.008),
    crystal([0.035, 0.018, 0.009096], [0.035, 0.049, 0.009096], 0.032, 0.031324, 0.008),
    crystal([0.004108, 0.018, 0.036], [0.004108, 0.044, 0.036], 0.0317, 0.031324, 0.008),
  ]
}

// A square prism with a small, flat bevelled roof. Its section stays normal
// to the shaft, so leaning arms retain the reference's slanted square ends.
function crystal(base, shoulder, width, depth, roofHeight) {
  const start = new THREE.Vector3(...base)
  const end = new THREE.Vector3(...shoulder)
  const axis = end.clone().sub(start).normalize()
  const across = new THREE.Vector3(1, 0, 0)
  if (Math.abs(axis.x) > 1e-6) {
    across.set(axis.y, -axis.x, 0).normalize()
  }
  const along = across.clone().cross(axis).normalize()
  const tip = end.clone().addScaledVector(axis, roofHeight)
  const rings = [[start, 1], [end, 1], [tip, 0.25]].map(([center, scale]) =>
    [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([u, v]) => center.clone()
      .addScaledVector(across, u * width / 2 * scale)
      .addScaledVector(along, v * depth / 2 * scale)))
  // The low lobes extend slightly past the dark base, so their undersides
  // remain visible at shallow angles; retain the crystal end caps.
  return loft(rings, true)
}

function rectangularLoft(specs, chamfer, bottom = false) {
  const rings = specs.map(({ x, z, width, depth, y }) => {
    const hx = width / 2
    const hz = depth / 2
    return [
      [-hx + chamfer, hz],
      [hx - chamfer, hz],
      [hx, hz - chamfer],
      [hx, -hz + chamfer],
      [hx - chamfer, -hz],
      [-hx + chamfer, -hz],
      [-hx, -hz + chamfer],
      [-hx, hz - chamfer],
    ].map(([rx, rz]) => new THREE.Vector3(x + rx, y, z + rz))
  })
  return loft(rings, bottom)
}

// Broad rock facets use separate face normals; the narrow bevel bands provide
// the visible rounded edge without smoothing the whole rock into a cone.
function loft(rings, bottom) {
  const positions = []
  const normals = []
  const indices = []
  const triangle = (a, b, c) => {
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize()
    const offset = positions.length / 3
    for (const point of [a, b, c]) {
      positions.push(point.x, point.y, point.z)
      normals.push(normal.x, normal.y, normal.z)
    }
    indices.push(offset, offset + 1, offset + 2)
  }
  const sides = rings[0].length
  for (let level = 0; level < rings.length - 1; level++) {
    for (let side = 0; side < sides; side++) {
      const next = (side + 1) % sides
      triangle(rings[level][side], rings[level][next], rings[level + 1][next])
      triangle(rings[level][side], rings[level + 1][next], rings[level + 1][side])
    }
  }
  for (const [ring, reverse] of [[rings.at(-1), false], ...(bottom ? [[rings[0], true]] : [])]) {
    const center = ring.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / sides)
    for (let side = 0; side < sides; side++) {
      const next = (side + 1) % sides
      triangle(center, ring[reverse ? next : side], ring[reverse ? side : next])
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setIndex(indices)
  return geometry
}

// Transparent solids must share one exterior: internal walls would blend
// several alpha layers. Clip each convex face against the other solids,
// retaining only the pieces outside them. Start with complete planar faces
// rather than individual triangles to avoid unnecessary clipping fragments.
function unionConvexParts(parts) {
  const epsilon = 1e-8
  const positions = []
  const normals = []
  const indices = []
  try {
    const solids = parts.map(convexFaces)
    for (const [solidIndex, solid] of solids.entries()) {
      for (const face of solid.faces) {
        let polygons = [face.points]
        for (const [otherIndex, other] of solids.entries()) {
          if (otherIndex === solidIndex)
            continue
          // Equal exterior planes belong to the first solid. This prevents
          // both coincident faces being deleted, or both being rendered.
          if (solidIndex < otherIndex && other.faces.some(({ plane }) =>
            plane.normal.dot(face.plane.normal) > 1 - 1e-6
            && Math.abs(plane.constant - face.plane.constant) < epsilon)) {
            continue
          }

          const visible = []
          for (const polygon of polygons) {
            const bounds = new THREE.Box3().setFromPoints(polygon)
            if (!bounds.intersectsBox(other.bounds)) {
              visible.push(polygon)
              continue
            }
            let inside = polygon
            for (const { plane } of other.faces) {
              const split = splitPolygon(inside, plane, epsilon)
              if (split.outside.length >= 3)
                visible.push(split.outside)
              inside = split.inside
              if (inside.length < 3)
                break
            }
            // The remainder lies inside every plane and is an internal wall.
          }
          polygons = visible
          if (!polygons.length)
            break
        }
        for (const polygon of polygons) {
          for (let i = 1; i < polygon.length - 1; i++) {
            const points = [polygon[0], polygon[i], polygon[i + 1]]
            const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]))
            // Coplanar clipping can leave repeated or collinear vertices.
            if (normal.lengthSq() <= 1e-16)
              continue
            normal.normalize()
            const offset = positions.length / 3
            for (const point of points) {
              positions.push(point.x, point.y, point.z)
              normals.push(normal.x, normal.y, normal.z)
            }
            indices.push(offset, offset + 1, offset + 2)
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setIndex(indices)
    return geometry
  }
  finally {
    for (const part of parts) part.dispose()
  }
}

function convexFaces(geometry) {
  const position = geometry.getAttribute('position')
  const faces = []
  const allPoints = []
  for (let i = 0; i < geometry.index.count; i += 3) {
    const points = [0, 1, 2].map(offset => new THREE.Vector3()
      .fromBufferAttribute(position, geometry.index.getX(i + offset)))
    allPoints.push(...points)
    const plane = new THREE.Plane().setFromCoplanarPoints(...points)
    let face = faces.find(({ plane: candidate }) =>
      candidate.normal.dot(plane.normal) > 1 - 1e-6
      && Math.abs(candidate.constant - plane.constant) < 1e-7)
    if (!face) {
      face = { plane, points: [] }
      faces.push(face)
    }
    face.points.push(...points)
  }
  for (const face of faces) {
    face.points = planarHull(face.points, face.plane.normal)
  }
  return { faces, bounds: new THREE.Box3().setFromPoints(allPoints) }
}

function planarHull(points, normal) {
  const across = Math.abs(normal.x) < 0.8
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 0, 1)
  across.addScaledVector(normal, -across.dot(normal)).normalize()
  const up = normal.clone().cross(across)
  const unique = [...new Map(points.map(point =>
    [point.toArray().map(value => value.toFixed(8)).join(','), point])).values()]
    .map(point => ({ point, x: point.dot(across), y: point.dot(up) }))
    .sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const half = (vertices) => {
    const result = []
    for (const vertex of vertices) {
      while (result.length > 1 && cross(result.at(-2), result.at(-1), vertex) <= 1e-14) result.pop()
      result.push(vertex)
    }
    return result.slice(0, -1)
  }
  return [...half(unique), ...half([...unique].reverse())].map(({ point }) => point)
}

function splitPolygon(points, plane, epsilon) {
  const distances = points.map(point => plane.distanceToPoint(point))
  if (!distances.some(distance => distance > epsilon))
    return { inside: points, outside: [] }
  if (!distances.some(distance => distance < -epsilon))
    return { inside: [], outside: points }
  const inside = []
  const outside = []
  for (let i = 0; i < points.length; i++) {
    const next = (i + 1) % points.length
    const distance = distances[i]
    const nextDistance = distances[next]
    if (distance <= epsilon)
      inside.push(points[i])
    if (distance >= -epsilon)
      outside.push(points[i])
    if ((distance > epsilon && nextDistance < -epsilon)
      || (distance < -epsilon && nextDistance > epsilon)) {
      const intersection = points[i].clone().lerp(points[next], distance / (distance - nextDistance))
      inside.push(intersection)
      outside.push(intersection)
    }
  }
  return { inside, outside }
}
