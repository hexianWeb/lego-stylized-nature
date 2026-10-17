import * as THREE from 'three/webgpu'
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { getPartEntry } from '../assets/manifests/partsCatalog.js'

/**
 * Lazy LDraw part loader.
 *
 * Wraps Three.js's official `LDrawLoader` with:
 *  - per-part caching (first request parses; subsequent requests are instant)
 *  - bounding-box normalization against the build grid (cellSize / layerHeight)
 *  - sub-mesh merging into a single `BufferGeometry` per part so the build
 *    renderer can keep using one `InstancedMesh` per part type
 *
 * Each parsed part becomes:
 *  - `geometry`: single merged `BufferGeometry` ready for `InstancedMesh`
 *  - `material`: a shared `MeshStandardNodeMaterial` (color comes from
 *    `InstancedMesh.setColorAt`, identical to the V1 lego material)
 *  - `footprint`, `height`: measured dimensions in cells / layers
 */
export class LDrawPartLoader {
  constructor({ cellSize, layerHeight, partsBasePath = '/model/parts/', finish = null } = {}) {
    this.cellSize = cellSize
    this.layerHeight = layerHeight
    this.partsBasePath = partsBasePath
    this.finish = finish
    this.cache = new Map()
    this.loading = new Map()
    this._loader = null
  }

  _getLoader() {
    if (!this._loader) {
      this._loader = new LDrawLoader()
      this._loader.setPartsLibraryPath(this.partsBasePath)
    }
    return this._loader
  }

  /**
   * Returns the cached part asset or fetches + parses it on demand.
   * @returns {Promise<{ geometry: THREE.BufferGeometry, material: THREE.Material, footprint: {x:number,z:number}, height: number, displayName: string }>}
   */
  async loadPart(partNumber) {
    const cached = this.cache.get(partNumber)
    if (cached) return cached

    if (this.loading.has(partNumber)) {
      return this.loading.get(partNumber)
    }

    const promise = this._parse(partNumber).finally(() => {
      this.loading.delete(partNumber)
    })
    this.loading.set(partNumber, promise)
    return promise
  }

  /**
   * Update the active finish preset. Existing cached assets keep their
   * original materials; new placements will pick up the change.
   */
  setFinish(finish) {
    this.finish = finish
  }

  hasPart(partNumber) {
    return this.cache.has(partNumber) || this.loading.has(partNumber)
  }

  isReady(partNumber) {
    return this.cache.has(partNumber)
  }

  /**
   * Synchronous accessor — returns the cached asset or null. Useful for
   * the build renderer when a part is referenced but not yet loaded.
   */
  getCached(partNumber) {
    return this.cache.get(partNumber) ?? null
  }

  async _parse(partNumber) {
    const entry = getPartEntry(partNumber)
    if (!entry) {
      throw new Error(`[LDrawPartLoader] Unknown part number: ${partNumber}`)
    }

    const loader = this._getLoader()
    const url = `${this.partsBasePath}${partNumber}.dat`
    const group = await loader.loadAsync(url)

    const merged = this._mergeGroup(group)
    if (!merged) {
      throw new Error(`[LDrawPartLoader] No geometry parsed for ${partNumber}`)
    }

    merged.computeBoundingBox()
    const bbox = merged.boundingBox
    const measured = {
      widthCells: Math.max(1, Math.round(bbox.max.x / this.cellSize)),
      depthCells: Math.max(1, Math.round(bbox.max.z / this.cellSize)),
      heightLayers: Math.max(1, Math.round(bbox.max.y / this.layerHeight))
    }

    // Translate to origin (LDraw parts may be off-center)
    const center = new THREE.Vector3()
    bbox.getCenter(center)
    merged.translate(-center.x, -bbox.min.y, -center.z)

    // Normalize XZ footprint to match the build grid pitch.
    // We bake the XZ scale directly into the geometry so the InstancedMesh
    // can reuse identity matrices for X/Z position.
    const desiredWidth = measured.widthCells * this.cellSize
    const desiredDepth = measured.depthCells * this.cellSize
    const scaleX = desiredWidth / Math.max(0.0001, bbox.max.x - bbox.min.x)
    const scaleZ = desiredDepth / Math.max(0.0001, bbox.max.z - bbox.min.z)
    merged.scale(scaleX, 1, scaleZ)

    // Drop any materials from the original meshes — instance color drives
    // the final hue, so a neutral MeshStandardNodeMaterial is sufficient.
    const material = new THREE.MeshStandardNodeMaterial({
      color: 0xffffff,
      roughness: this.finish?.roughness ?? 0.45,
      metalness: this.finish?.metalness ?? 0.0,
      clearcoat: this.finish?.clearcoat ?? 0.0,
      clearcoatRoughness: this.finish?.clearcoatRoughness ?? 0.0,
      transparent: this.finish?.transparent ?? false,
      opacity: this.finish?.opacity ?? 1.0
    })

    const asset = {
      partNumber,
      displayName: entry.displayName,
      category: entry.category,
      geometry: merged,
      material,
      footprint: { x: measured.widthCells, z: measured.depthCells },
      height: measured.heightLayers
    }

    // Dispose the intermediate group + materials to avoid leaking GPU memory.
    group.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose?.()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose?.())
        } else {
          child.material?.dispose?.()
        }
      }
    })

    this.cache.set(partNumber, asset)
    return asset
  }

  _mergeGroup(group) {
    const geometries = []
    group.traverse((child) => {
      if (child.isMesh && child.geometry) {
        geometries.push(child.geometry)
      }
    })
    if (geometries.length === 0) return null
    if (geometries.length === 1) return geometries[0].clone()
    const merged = mergeGeometries(geometries, false)
    return merged
  }

  /**
   * Preload a batch of parts in parallel (e.g. when the player opens the
   * palette for the first time).
   */
  async preload(partNumbers) {
    return Promise.all(partNumbers.map((n) => this.loadPart(n).catch((err) => {
      console.warn(`[LDrawPartLoader] Failed to load ${n}:`, err)
      return null
    })))
  }

  dispose() {
    for (const asset of this.cache.values()) {
      asset.geometry?.dispose?.()
      asset.material?.dispose?.()
    }
    this.cache.clear()
    this.loading.clear()
    this._loader = null
  }
}
