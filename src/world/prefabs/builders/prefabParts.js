import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import * as THREE from 'three/webgpu'
import { createLegoMaterial } from '../../../materials/tsl/legoMaterial.js'
import { PREFAB_ORIGIN, STUD_HEIGHT, STUD_RADIUS } from './legoUnits.js'

// Three assigns cylinder groups as side / top / bottom, and box group 3 to -Y.
const CYLINDER_TOP = 1
const CYLINDER_BOTTOM = 2
const BOX_BOTTOM = 3

export function cylinder({ radius, height, segments, top = true, bottom = false }) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, segments)
  geometry.translate(0, height / 2, 0)
  return keepGroups(geometry, index =>
    (index !== CYLINDER_TOP || top) && (index !== CYLINDER_BOTTOM || bottom))
}

// Partial cylinder. Three's theta range leaves the two cut faces open.
export function sector({ radius, height, segments, thetaStart = 0, thetaLength, top = true, bottom = false }) {
  const geometry = new THREE.CylinderGeometry(
    radius,
    radius,
    height,
    segments,
    1,
    false,
    thetaStart,
    thetaLength,
  )
  geometry.translate(0, height / 2, 0)
  keepGroups(geometry, index =>
    (index !== CYLINDER_TOP || top) && (index !== CYLINDER_BOTTOM || bottom))
  appendRadialWalls(geometry, radius, height, thetaStart, thetaLength)
  return geometry
}

export function box({ width, height, depth, bottom = false }) {
  const geometry = new THREE.BoxGeometry(width, height, depth)
  geometry.translate(0, height / 2, 0)
  return keepGroups(geometry, index => index !== BOX_BOTTOM || bottom)
}

export function stud() {
  return cylinder({ radius: STUD_RADIUS, height: STUD_HEIGHT, segments: 6 })
}

export function flowerPlate({ outerRadius, innerRadius, height, petals = 5 }) {
  const geometry = cylinder({ radius: outerRadius, height, segments: petals * 2 })
  const position = geometry.getAttribute('position')
  const step = Math.PI / petals
  const innerScale = innerRadius / outerRadius

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const z = position.getZ(i)
    if (Math.hypot(x, z) < 1e-6) {
      continue
    }
    if (Math.abs(Math.round(Math.atan2(x, z) / step)) % 2 === 1) {
      position.setXYZ(i, x * innerScale, position.getY(i), z * innerScale)
    }
  }

  geometry.computeVertexNormals()
  return geometry
}

// Consumes the temporary part geometries without changing their attributes.
// The caller owns the returned meshes' geometry and material (PrefabRegistry).
export function makePrefabScene(slots) {
  if (slots.length > 3) {
    throw new RangeError('A prefab may contain at most three material slots')
  }
  for (const { name, parts } of slots) {
    if (!parts.length) {
      throw new Error(`Prefab slot "${name}" must contain at least one part`)
    }
  }

  const scene = new THREE.Group()
  const sourceParts = new Set(slots.flatMap(({ parts }) => parts))
  const assets = new Set()

  try {
    for (const { name, color, parts } of slots) {
      const mergeable = []
      let geometry
      try {
        for (const part of parts) {
          mergeable.push(toMergeable(part))
        }
        geometry = mergeGeometries(mergeable)
        if (!geometry) {
          throw new Error(`Could not merge prefab slot "${name}"`)
        }
      }
      finally {
        for (const part of mergeable) {
          part.dispose()
        }
      }

      assets.add(geometry)
      geometry.translate(...PREFAB_ORIGIN)

      const material = createLegoMaterial()
      assets.add(material)
      material.name = name
      material.color.set(color)

      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = name
      scene.add(mesh)
    }
    return scene
  }
  catch (error) {
    for (const asset of assets) {
      asset.dispose()
    }
    throw error
  }
  finally {
    for (const part of sourceParts) {
      part.dispose()
    }
  }
}

function appendRadialWalls(geometry, radius, height, thetaStart, thetaLength) {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const count = position.count + 8
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  for (let i = 0; i < position.count; i++) {
    positions[i * 3] = position.getX(i)
    positions[i * 3 + 1] = position.getY(i)
    positions[i * 3 + 2] = position.getZ(i)
    normals[i * 3] = normal.getX(i)
    normals[i * 3 + 1] = normal.getY(i)
    normals[i * 3 + 2] = normal.getZ(i)
  }

  const index = Array.from(geometry.index.array)
  let offset = position.count
  for (const end of [false, true]) {
    const theta = end ? thetaStart + thetaLength : thetaStart
    const x = radius * Math.sin(theta)
    const z = radius * Math.cos(theta)
    const nx = (end ? 1 : -1) * Math.cos(theta)
    const nz = (end ? -1 : 1) * Math.sin(theta)
    const verts = [0, 0, 0, x, 0, z, x, height, z, 0, height, 0]
    for (let vertex = 0; vertex < 4; vertex++) {
      const cursor = (offset + vertex) * 3
      positions[cursor] = verts[vertex * 3]
      positions[cursor + 1] = verts[vertex * 3 + 1]
      positions[cursor + 2] = verts[vertex * 3 + 2]
      normals[cursor] = nx
      normals[cursor + 1] = 0
      normals[cursor + 2] = nz
    }
    index.push(
      offset,
      offset + (end ? 2 : 1),
      offset + (end ? 1 : 2),
      offset,
      offset + (end ? 3 : 2),
      offset + (end ? 2 : 3),
    )
    offset += 4
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setIndex(index)
  return geometry
}

function keepGroups(geometry, keep) {
  const source = geometry.index.array
  const indices = []
  for (const group of geometry.groups) {
    if (!keep(group.materialIndex)) {
      continue
    }
    for (let i = group.start; i < group.start + group.count; i++) {
      indices.push(source[i])
    }
  }
  geometry.setIndex(indices)
  geometry.clearGroups()
  geometry.deleteAttribute('uv')
  return geometry
}

// Static prefab parts share only Float32 position/normal attributes. Normalizing
// on fresh buffers also makes indexed and non-indexed parts safe to merge.
function toMergeable(source) {
  const position = source.getAttribute('position')
  const normal = source.getAttribute('normal')
  if (!position || position.itemSize !== 3) {
    throw new Error('Prefab parts require a three-component position attribute')
  }
  if (normal && (normal.itemSize !== 3 || normal.count !== position.count)) {
    throw new Error('Prefab part normals must match its position attribute')
  }

  const geometry = new THREE.BufferGeometry()
  try {
    geometry.setAttribute('position', copyVectorAttribute(position))
    if (source.index) {
      geometry.setIndex(Array.from(source.index.array))
    }
    if (normal) {
      geometry.setAttribute('normal', copyVectorAttribute(normal))
    }
    else {
      geometry.computeVertexNormals()
    }
    if (geometry.index) {
      return geometry
    }
    const indexed = mergeVertices(geometry, 1e-7)
    geometry.dispose()
    return indexed
  }
  catch (error) {
    geometry.dispose()
    throw error
  }
}

function copyVectorAttribute(attribute) {
  const values = new Float32Array(attribute.count * 3)
  for (let i = 0; i < attribute.count; i++) {
    values[i * 3] = attribute.getX(i)
    values[i * 3 + 1] = attribute.getY(i)
    values[i * 3 + 2] = attribute.getZ(i)
  }
  return new THREE.BufferAttribute(values, 3)
}
