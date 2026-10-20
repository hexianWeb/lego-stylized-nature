import * as THREE from 'three/webgpu'
import { LDrawPartLoader } from '../utils/LDrawPartLoader.js'
import { createLegoMaterial } from '../materials/tsl/legoMaterial.js'
import { partsCatalog } from '../assets/manifests/partsCatalog.js'

const DEFAULT_CAPACITY = 128
const GROWTH_FACTOR = 1.5
const SELECT_HUE_OFFSET = 0.0
const SELECT_LIGHT_OFFSET = 0.18

/**
 * Per-partNumber `InstancedMesh` renderer for the sandbox.
 *
 * Lazily creates one `InstancedMesh` per LDraw part on first drop.
 * Each instance carries one of the standard Lego colors via
 * `InstancedMesh.setColorAt`. The currently-selected brick gets a
 * small brightness offset so it stands out from the rest.
 */
export class SandboxBrickRenderer {
  constructor({ grid, scene, rendererKind = 'webgpu' }) {
    this.grid = grid
    this.scene = scene
    this.partLoader = new LDrawPartLoader({
      cellSize: grid.cellSize,
      layerHeight: grid.layerHeight,
      partsBasePath: '/model/ldraw/',
      rendererKind: String(rendererKind).includes('webgl') ? 'webgl' : 'webgpu'
    })

    this.entries = new Map()        // partNumber → { mesh, material, byId, capacity }
    this.placements = new Map()     // id → placement
    this.selectedId = null

      this.group = new THREE.Group()
    this.group.name = 'SandboxBricks'
    scene.add(this.group)

    this._matrix = new THREE.Matrix4()
    this._position = new THREE.Vector3()
    this._quaternion = new THREE.Quaternion()
    this._scale = new THREE.Vector3(1, 1, 1)
    this._color = new THREE.Color()
    this._yAxis = new THREE.Vector3(0, 1, 0)
    this._tmpMatrix = new THREE.Matrix4()
    this._idCounter = 0
  }

  /**
   * Wait for the LDraw asset of `partNumber` to be ready. If the entry
   * already exists, returns immediately.
   */
  async ensureLoaded(partNumber) {
    if (this.partLoader.isReady(partNumber)) return
    await this.partLoader.loadPart(partNumber).catch((err) => {
      console.warn(`[Sandbox] Failed to load ${partNumber}:`, err)
    })
  }

  _ensureEntry(partNumber) {
    let entry = this.entries.get(partNumber)
    if (entry) return entry

    const asset = this.partLoader.getCached(partNumber)
    if (!asset) return null

    const material = createLegoMaterial({ roughness: 0.45 })
    const mesh = new THREE.InstancedMesh(asset.geometry, material, DEFAULT_CAPACITY)
    mesh.name = `SandboxBricks_${partNumber}`
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.pickable = true
    mesh.userData.kind = 'sandbox-brick'
    mesh.userData.partNumber = partNumber

    entry = { mesh, material, capacity: DEFAULT_CAPACITY, byId: new Map() }
    this.entries.set(partNumber, entry)
    this.group.add(mesh)
    return entry
  }

  _growEntry(entry) {
    const newCap = Math.ceil(entry.capacity * GROWTH_FACTOR)
    const partNumber = entry.mesh.userData.partNumber
    const asset = this.partLoader.getCached(partNumber)
    if (!asset) return
    const newMesh = new THREE.InstancedMesh(asset.geometry, entry.material, newCap)
    newMesh.name = entry.mesh.name
    newMesh.castShadow = true
    newMesh.receiveShadow = true
    newMesh.userData = entry.mesh.userData

    for (let i = 0; i < entry.mesh.count; i++) {
      entry.mesh.getMatrixAt(i, this._tmpMatrix)
      newMesh.setMatrixAt(i, this._tmpMatrix)
      entry.mesh.getColorAt(i, this._color)
      newMesh.setColorAt(i, this._color)
    }
    newMesh.count = entry.mesh.count

    this.group.remove(entry.mesh)
    entry.mesh.dispose()
    entry.mesh = newMesh
    entry.capacity = newCap
    this.group.add(newMesh)
  }

  nextId() {
    this._idCounter += 1
    return `b${this._idCounter}`
  }

  /**
   * Drop a brick. Returns the placement record or null if the asset
   * isn't loaded yet.
   */
  addBrick({ partNumber, x, y, z, rot, color }) {
    const entry_ = partsCatalog[partNumber]
    const placement = {
      id: this.nextId(),
      partNumber,
      x, y, z,
      rot: rot ?? 0,
      color: color ?? '#cccccc',
      footprint: entry_?.footprint ?? { x: 1, z: 1 },
      height: entry_?.height ?? 1
    }
    return this.addPlacement(placement)
  }

  /**
   * Add a pre-built placement (e.g. for undo restoration). Returns the
   * placement, or null if the asset isn't loaded yet.
   */
  addPlacement(placement) {
    const entry = this._ensureEntry(placement.partNumber)
    if (!entry) return null

    let slot = entry.mesh.count
    if (slot >= entry.capacity) {
      this._growEntry(entry)
    }
    entry.mesh.count = slot + 1
    entry.byId.set(placement.id, slot)
    this.placements.set(placement.id, placement)
    this._writeMatrix(entry, placement, slot)
    this._writeColor(entry, placement, slot)
    entry.mesh.instanceMatrix.needsUpdate = true
    if (entry.mesh.instanceColor) entry.mesh.instanceColor.needsUpdate = true
    return placement
  }

  updatePlacement(id, patch) {
    const placement = this.placements.get(id)
    if (!placement) return null
    const entry = this.entries.get(placement.partNumber)
    if (!entry) return null
    const slot = entry.byId.get(id)
    if (slot === undefined) return null

    Object.assign(placement, patch)
    if (patch.x !== undefined || patch.y !== undefined || patch.z !== undefined || patch.rot !== undefined) {
      this._writeMatrix(entry, placement, slot)
    }
    if (patch.color !== undefined) {
      this._writeColor(entry, placement, slot)
    }
    entry.mesh.instanceMatrix.needsUpdate = true
    if (entry.mesh.instanceColor) entry.mesh.instanceColor.needsUpdate = true
    return placement
  }

  removeBrick(id) {
    const placement = this.placements.get(id)
    if (!placement) return null
    const entry = this.entries.get(placement.partNumber)
    if (!entry) return null
    const slot = entry.byId.get(id)
    if (slot === undefined) return null

    const lastSlot = entry.mesh.count - 1
    if (slot !== lastSlot) {
      entry.mesh.getMatrixAt(lastSlot, this._matrix)
      entry.mesh.setMatrixAt(slot, this._matrix)
      entry.mesh.getColorAt(lastSlot, this._color)
      entry.mesh.setColorAt(slot, this._color)
      for (const [otherId, otherSlot] of entry.byId.entries()) {
        if (otherSlot === lastSlot) {
          entry.byId.set(otherId, slot)
          break
        }
      }
    }
    entry.mesh.count = lastSlot
    entry.byId.delete(id)
    this.placements.delete(id)
    entry.mesh.instanceMatrix.needsUpdate = true
    if (entry.mesh.instanceColor) entry.mesh.instanceColor.needsUpdate = true
    return placement
  }

  setSelected(id) {
    this.selectedId = id
    for (const entry of this.entries.values()) {
      for (const [placementId, slot] of entry.byId.entries()) {
        const placement = this.placements.get(placementId)
        if (!placement) continue
        this._writeColor(entry, placement, slot)
      }
      if (entry.mesh.instanceColor) entry.mesh.instanceColor.needsUpdate = true
    }
  }

  getPlacement(id) {
    return this.placements.get(id) ?? null
  }

  listPlacements() {
    return [...this.placements.values()]
  }

  removeAll() {
    for (const p of [...this.placements.values()]) {
      this.removeBrick(p.id)
    }
  }

  _writeMatrix(entry, placement, slot) {
    const fp = placement.footprint ?? { x: 1, z: 1 }
    const cellSize = this.grid.cellSize
    const layerHeight = this.grid.layerHeight

    const wx = (placement.x + fp.x * 0.5) * cellSize
    const wy = placement.y * layerHeight
    const wz = (placement.z + fp.z * 0.5) * cellSize

    this._position.set(wx, wy, wz)
    this._quaternion.setFromAxisAngle(this._yAxis, placement.rot ?? 0)
    this._scale.set(1, 1, 1)
    this._matrix.compose(this._position, this._quaternion, this._scale)
    entry.mesh.setMatrixAt(slot, this._matrix)
  }

  _writeColor(entry, placement, slot) {
    this._color.set(placement.color ?? '#cccccc')
    if (placement.id === this.selectedId) {
      this._color.offsetHSL(SELECT_HUE_OFFSET, 0, SELECT_LIGHT_OFFSET)
    }
    entry.mesh.setColorAt(slot, this._color)
  }

  /**
   * Raycast against every active brick mesh and return the placement
   * hit at the closest intersection, or null.
   */
  pickByRaycaster(raycaster) {
    const meshes = []
    for (const entry of this.entries.values()) {
      if (entry.mesh.count > 0) meshes.push(entry.mesh)
    }
    if (meshes.length === 0) return null
    const intersects = raycaster.intersectObjects(meshes, false)
    if (intersects.length === 0) return null
    const hit = intersects[0]
    const mesh = hit.object
    if (!mesh.userData?.pickable) return null
    const instanceId = hit.instanceId
    if (instanceId === undefined || instanceId >= mesh.count) return null

    for (const entry of this.entries.values()) {
      if (entry.mesh !== mesh) continue
      for (const [id, slot] of entry.byId.entries()) {
        if (slot === instanceId) {
          return {
            placement: this.placements.get(id),
            point: hit.point,
            distance: hit.distance
          }
        }
      }
    }
    return null
  }

  setVisible(visible) {
    this.group.visible = visible
  }

  dispose() {
    for (const entry of this.entries.values()) {
      entry.mesh.dispose()
      entry.material.dispose()
    }
    this.entries.clear()
    this.placements.clear()
    this.group.parent?.remove(this.group)
    this.partLoader.dispose()
  }
}