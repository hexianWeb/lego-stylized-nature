import * as THREE from 'three/webgpu'
import { createPlaceholderTerrainMaterial } from '../../materials/tsl/placeholderTerrainMaterial.js'
import { getChunkWindowCoords, getRenderChunkKey } from './chunkCoordinates.js'
import { createPlaceholderColorAttributes, samplePlaceholderPalette, writePlaceholderColors } from './placeholderTerrainPalette.js'

const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z))

// Top corners run counterclockwise: (x0,z0), (x0,z1), (x1,z1), (x1,z0).
// Indices 4..7 are the same XZ corners at the bottom of a wall.
const FACES = [
  { normal: [0, 1, 0], corners: [0, 1, 2, 3] },
  { normal: [-1, 0, 0], corners: [1, 0, 4, 5] },
  { normal: [0, 0, 1], corners: [2, 1, 5, 6] },
  { normal: [1, 0, 0], corners: [3, 2, 6, 7] },
  { normal: [0, 0, -1], corners: [0, 3, 7, 4] },
]

// Each tile owns a contiguous range of vertices. Only the higher tile emits an
// internal wall. Perimeter skirts also seal edges against other LODs/pending chunks.
function steppedGeometry(tiles, columns, cellSize, chunkSize, floor, offsets) {
  const bottoms = new Float64Array(tiles.length * 4)
  for (let i = 0; i < tiles.length; i++) {
    const j = i * 4
    bottoms[j] = i % columns ? tiles[i - 1].top : floor
    bottoms[j + 1] = tiles[i + columns]?.top ?? floor
    bottoms[j + 2] = i % columns < columns - 1 ? tiles[i + 1].top : floor
    bottoms[j + 3] = tiles[i - columns]?.top ?? floor
    let vertices = 4
    for (let k = j; k < j + 4; k++) if (bottoms[k] < tiles[i].top) vertices += 4
    offsets[i + 1] = offsets[i] + vertices
  }
  // Size once: building a new strip must not allocate temporary arrays per face.
  const count = offsets[tiles.length]
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const Index = count > 65535 ? Uint32Array : Uint16Array
  const indices = new Index(count / 4 * 6)
  let vertex = 0, index = 0
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i]
    const first = tile.cells[0], last = tile.cells[3]
    const x0 = (first % chunkSize) * cellSize, x1 = (last % chunkSize + 1) * cellSize
    const z0 = Math.floor(first / chunkSize) * cellSize, z1 = (Math.floor(last / chunkSize) + 1) * cellSize
    for (let f = 0; f < FACES.length; f++) {
      const bottom = f ? bottoms[i * 4 + f - 1] : tile.top
      if (f && bottom >= tile.top) continue
      indices[index++] = vertex
      indices[index++] = vertex + 1
      indices[index++] = vertex + 2
      indices[index++] = vertex
      indices[index++] = vertex + 2
      indices[index++] = vertex + 3
      const face = FACES[f]
      for (const corner of face.corners) {
        const j = vertex++ * 3
        const k = corner % 4
        positions[j] = k < 2 ? x0 : x1
        positions[j + 1] = corner < 4 ? tile.top : bottom
        positions[j + 2] = k === 1 || k === 2 ? z1 : z0
        normals.set(face.normal, j)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  return geometry
}

class MidTerrainPatch {
  constructor(owner, coord, span, step, boxes, material) {
    this.coord = coord
    this.tiles = owner.createChunk(coord, span, step).voxels
    const { chunkSize, config } = owner
    const { cellSize } = config.terrain
    const originX = coord.x * chunkSize * cellSize, originZ = coord.z * chunkSize * cellSize
    const count = this.tiles.length
    this.offsets = new Uint32Array(count + 1)
    const geometry = boxes ? new THREE.BoxGeometry(1, 1, 1)
      : steppedGeometry(this.tiles, Math.ceil(chunkSize / span), cellSize, chunkSize, -step, this.offsets)
    this.mesh = boxes ? new THREE.InstancedMesh(geometry, material, count) : new THREE.Mesh(geometry, material)
    this.mesh.name = boxes ? 'MidTerrainBoxes' : 'MidTerrainSurface'
    this.mesh.position.set(originX, 0, originZ)
    if (boxes) {
      for (let i = 0; i <= count; i++) this.offsets[i] = i
    }
    const length = this.offsets[count]
    const Attribute = boxes ? THREE.InstancedBufferAttribute : THREE.BufferAttribute
    this.cover = new Attribute(new Float32Array(length).fill(1), 1).setUsage(THREE.DynamicDrawUsage)
    this.colors = createPlaceholderColorAttributes(this.mesh, length)
    const anchors = new Float32Array(length * 3)
    const matrix = new THREE.Matrix4()
    let maxTop = 0
    for (let i = 0; i < count; i++) {
      const tile = this.tiles[i]
      maxTop = Math.max(maxTop, tile.top)
      const x = tile.x - originX, z = tile.z - originZ
      for (let j = this.offsets[i] * 3; j < this.offsets[i + 1] * 3; j += 3) {
        anchors[j] = x
        anchors[j + 1] = tile.y
        anchors[j + 2] = z
      }
      if (boxes) this.mesh.setMatrixAt(i, matrix.makeScale(tile.size, tile.sizeY, tile.sizeZ).setPosition(x, tile.y, z))
    }
    geometry.setAttribute('tileCover', this.cover)
    geometry.setAttribute('tileAnchor', new Attribute(anchors, 3))
    // Identical conservative culling for both modes, including every reveal pose.
    const half = chunkSize * cellSize * 0.5
    const bounds = new THREE.Sphere(new THREE.Vector3(half, (maxTop - step) * 0.5, half),
      Math.hypot(half, (maxTop + step) * 0.5, half))
    if (boxes) {
      this.mesh.boundingSphere = bounds
    }
    else {
      geometry.boundingSphere = bounds
    }
    this.updateColors(owner, true)
  }

  updateColors(owner, resample) {
    if (resample) {
      this.palette = samplePlaceholderPalette(owner.colorResolver, this.tiles, this.palette)
    }
    writePlaceholderColors(owner, this.tiles, this.palette, this.colors, { offsets: this.offsets })
    for (const attribute of this.colors) attribute.needsUpdate = true
  }

  updateCover(slot) {
    const transition = slot?.columnTransition
    this.mesh.visible = !slot || transition?.active === true
    if (!this.mesh.visible || (!transition?.active && !this.revealing)) return
    this.revealing = Boolean(transition?.active)
    const progress = transition?.progress
    let changed = false
    for (let i = 0; i < this.tiles.length; i++) {
      const tile = this.tiles[i]
      const [a, b, c, d] = tile.cells
      const p = progress ? Math.min(progress[a], progress[b], progress[c], progress[d]) : 0
      const t = THREE.MathUtils.smoothstep(p, tile.dissolveStart, tile.dissolveEnd)
      const value = Math.fround(1 - t)
      if (this.cover.array[this.offsets[i]] === value) continue
      this.cover.array.fill(value, this.offsets[i], this.offsets[i + 1])
      changed = true
    }
    if (changed) this.cover.needsUpdate = true
  }

  dispose(releaseSceneObjects) {
    // r185's shared material retains per-object bindings after geometry disposal.
    releaseSceneObjects?.(this.mesh)
    this.mesh.removeFromParent()
    this.mesh.dispose?.()
    this.mesh.geometry.dispose()
  }
}

export default class MidTerrainRing {
  constructor(owner, settings, releaseSceneObjects) {
    this.owner = owner
    this.releaseSceneObjects = releaseSceneObjects
    this.settings = settings
    this.radius = owner.windowRadius + 1
    this.span = Math.max(1, Math.min(owner.chunkSize, Math.floor(settings.cellSpan ?? 6)))
    this.step = owner.config.terrain.layerHeight * Math.max(1, Math.floor(settings.heightLayers ?? 2))
    this.materials = [false, true].map(brickSeams => createPlaceholderTerrainMaterial(owner.config.terrain, { brickSeams, revealTiles: true }))
    this.group = new THREE.Group()
    this.group.name = 'MidTerrainRing'
    owner.parentGroup.add(this.group)
    this.patches = new Map()
    this.pending = []
  }

  update(center, activeSlots, moved, visible, deadline) {
    const { mode, brickSeams } = this.settings
    if (mode !== this.mode) {
      this.clear()
      this.mode = mode
      moved = true
    }
    this.group.visible = visible
    if (mode !== 'surface' && mode !== 'boxes') return
    if (moved) {
      for (const [key, patch] of this.patches) {
        if (distance(patch.coord, center) > this.radius) {
          patch.dispose(this.releaseSceneObjects)
          this.patches.delete(key)
        }
        else patch.updateColors(this.owner, false)
      }
      this.pending = getChunkWindowCoords(center, this.radius).filter(coord =>
        distance(coord, center) === this.radius && !this.patches.has(getRenderChunkKey(coord)))
    }
    if (!visible) return
    const material = this.materials[Number(brickSeams !== false)]
    // A cold ring/teleport is never built in one frame. The ordinary boxes stay
    // on screen until each replacement exists; detailed builds get the budget first.
    if (this.pending.length && performance.now() < deadline) {
      const coord = this.pending.shift()
      const patch = new MidTerrainPatch(this.owner, coord, this.span, this.step, mode === 'boxes', material)
      this.patches.set(getRenderChunkKey(coord), patch)
      this.group.add(patch.mesh)
    }
    for (const [key, patch] of this.patches) {
      patch.mesh.material = material
      patch.updateCover(activeSlots.get(key))
    }
  }

  clear() {
    for (const patch of this.patches.values()) patch.dispose(this.releaseSceneObjects)
    this.patches.clear()
    this.pending.length = 0
  }

  dispose() {
    this.clear()
    this.group.removeFromParent()
    for (const material of this.materials) material.dispose()
  }
}
