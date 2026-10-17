import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export const BRICK_LOD_DEFAULTS = Object.freeze({
  enabled: true,
  fullDetailPixels: 8,
  studPixels: 4,
  hysteresis: 0.15,
})

// The authored 2x2 brick has a closed, beveled body and four separate studs.
// Find its broad upward-facing deck rather than assuming layerHeight is its top.
export function createBrickLODGeometries(source) {
  source.computeBoundingBox()
  source.computeBoundingSphere()
  const flat = source.index ? source.toNonIndexed() : source.clone()
  const position = flat.getAttribute('position')
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const cross = new THREE.Vector3()
  let largestArea = 0
  let deckY = source.boundingBox.max.y
  const epsilon = source.boundingBox.getSize(a).length() * 1e-5

  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i)
    b.fromBufferAttribute(position, i + 1)
    c.fromBufferAttribute(position, i + 2)
    if (Math.abs(a.y - b.y) > epsilon || Math.abs(a.y - c.y) > epsilon)
      continue
    cross.crossVectors(b.sub(a), c.sub(a))
    if (cross.y > largestArea) {
      largestArea = cross.y
      deckY = a.y
    }
  }

  const center = source.boundingBox.getCenter(a).clone()
  const studs = Array.from({ length: 4 }, () => new THREE.Box3())
  const bodyVertices = []
  for (let i = 0; i < position.count; i++) {
    a.fromBufferAttribute(position, i)
    if (a.y > deckY + epsilon)
      studs[(a.x > center.x ? 1 : 0) + (a.z > center.z ? 2 : 0)].expandByPoint(a)
  }
  // Keep unfamiliar assets intact (also allows plain-box test fixtures).
  if (studs.some(bounds => bounds.isEmpty())) {
    flat.dispose()
    return { geometries: [source], studDiameter: 0, studLayout: null }
  }

  for (let i = 0; i < position.count; i += 3) {
    if ([0, 1, 2].every(offset => position.getY(i + offset) <= deckY + epsilon))
      bodyVertices.push(i, i + 1, i + 2)
  }
  const body = new THREE.BufferGeometry()
  for (const [name, attribute] of Object.entries(flat.attributes)) {
    const values = new attribute.array.constructor(bodyVertices.length * attribute.itemSize)
    bodyVertices.forEach((index, i) => {
      for (let component = 0; component < attribute.itemSize; component++)
        values[i * attribute.itemSize + component] = attribute.array[index * attribute.itemSize + component]
    })
    body.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize, attribute.normalized))
  }
  flat.dispose()

  const parts = [body]
  let studDiameter = Infinity
  for (const bounds of studs) {
    const size = bounds.getSize(a)
    const radius = Math.min(size.x, size.z) * 0.5
    studDiameter = Math.min(studDiameter, radius * 2)
    const studCenter = bounds.getCenter(b)
    const height = bounds.max.y - deckY
    // Six smooth sides, no bevel or hidden bottom cap. Retain authored stud height.
    const side = new THREE.CylinderGeometry(radius, radius, height, 6, 1, true, Math.PI / 2)
    side.translate(studCenter.x, deckY + height * 0.5, studCenter.z)
    const cap = new THREE.CircleGeometry(radius, 6)
    cap.rotateX(-Math.PI / 2)
    cap.translate(studCenter.x, bounds.max.y, studCenter.z)
    parts.push(side.toNonIndexed(), cap.toNonIndexed())
    side.dispose()
    cap.dispose()
  }
  const simplified = mergeGeometries(parts)
  for (const part of parts.slice(1))
    part.dispose()

  // All levels use the full-detail envelope: reused instance/transition bounds
  // remain conservative even when a slot is rebuilt at a lower detail level.
  for (const geometry of [simplified, body]) {
    geometry.boundingBox = source.boundingBox.clone()
    geometry.boundingSphere = source.boundingSphere.clone()
  }
  const origin = studs[0].getCenter(a)
  const studLayout = {
    deckY,
    pitch: studs[1].getCenter(b).x - origin.x,
    originX: origin.x,
    originZ: origin.z,
    radius: studDiameter * 0.5,
  }
  return { geometries: [source, simplified, body], studDiameter, studLayout }
}

// Smallest projected diameter of a horizontal stud disk, in render-buffer pixels.
// Supports both orthographic zoom and perspective focus-plane distance.
export function projectedStudPixels(camera, width, height, diameter) {
  const view = camera.matrixWorldInverse.elements
  const projection = camera.projectionMatrix.elements
  const distance = camera.isPerspectiveCamera
    ? Math.max(1e-4, camera.userData?.focusDistance || -view[14] || camera.position.length() || 1)
    : 1
  const sx = (width * Math.abs(projection[0]) * 0.5) / distance
  const sy = (height * Math.abs(projection[5]) * 0.5) / distance
  const a = sx * view[0]
  const b = sx * view[8]
  const c = sy * view[1]
  const d = sy * view[9]
  const trace = a * a + b * b + c * c + d * d
  const determinant = a * d - b * c
  const largest = Math.sqrt((trace + Math.sqrt(Math.max(0, trace * trace - 4 * determinant ** 2))) * 0.5)
  return largest > 0 ? diameter * Math.abs(determinant) / largest : 0
}

export function selectBrickLOD(pixels, previous, settings) {
  const low = Math.max(0, settings.studPixels)
  const high = Math.max(low, settings.fullDetailPixels)
  const hysteresis = THREE.MathUtils.clamp(settings.hysteresis, 0, 0.49)
  if (previous === null)
    return pixels >= high ? 0 : pixels >= low ? 1 : 2
  let level = previous
  const thresholds = [high, low]
  while (level < 2 && pixels < thresholds[level] * (1 - hysteresis))
    level++
  while (level > 0 && pixels > thresholds[level - 1] * (1 + hysteresis))
    level--
  return level
}

export default class BrickLOD {
  constructor(source, settings = { ...BRICK_LOD_DEFAULTS }) {
    Object.assign(this, createBrickLODGeometries(source))
    this.settings = settings
    this.level = null
    this.studPixels = 0
    this._size = new THREE.Vector2()
    this._apply = (object) => {
      if (object.isInstancedMesh && this.geometries.includes(object.geometry))
        object.geometry = this.geometries[this.level]
    }
  }

  update(group, camera, renderer) {
    if (!renderer || !camera)
      return
    if (this.settings.enabled && (camera.isOrthographicCamera || camera.isPerspectiveCamera) && this.geometries.length === 3) {
      camera.updateWorldMatrix(true, false)
      renderer.getDrawingBufferSize(this._size)
      this.studPixels = projectedStudPixels(camera, this._size.x, this._size.y, this.studDiameter)
      this.level = selectBrickLOD(this.studPixels, this.level, this.settings)
    }
    else {
      this.level = 0
    }
    // Also picks up newly allocated/recycled chunk and water pages without
    // changing instance order, AO colors, column animations or draw-call count.
    group.traverse(this._apply)
  }

  dispose() {
    // The original geometry is owned by World.
    for (const geometry of this.geometries.slice(1))
      geometry.dispose()
  }
}
