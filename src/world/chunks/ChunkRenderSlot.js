import * as THREE from 'three/webgpu'
import { getRenderChunkKey, getRenderChunkOrigin } from './chunkCoordinates.js'

export default class ChunkRenderSlot {
  constructor({
    index,
    chunkSize,
    cellSize,
    terrainRenderer,
    heightfieldAO,
    prefabPlacer = null,
    waterRenderer = null,
    lavaRenderer = null
  }) {
    this.index = index
    this.chunkSize = chunkSize
    this.cellSize = cellSize
    this.terrainRenderer = terrainRenderer
    this.heightfieldAO = heightfieldAO
    this.prefabPlacer = prefabPlacer
    this.waterRenderer = waterRenderer
    this.lavaRenderer = lavaRenderer
    this.coord = null
    this.origin = null
    this.terrainMap = null
    this.placements = []
    this.group = new THREE.Group()
    this.group.name = `ChunkRenderSlot:${index}`
    this.group.add(terrainRenderer.group)
    if (waterRenderer) {
      this.group.add(waterRenderer.group)
    }
    if (lavaRenderer) {
      this.group.add(lavaRenderer.group)
    }
    if (prefabPlacer) {
      this.group.add(prefabPlacer.group)
    }
  }

  get key() {
    return this.coord ? getRenderChunkKey(this.coord) : null
  }

  isLoadedFor(coord) {
    return this.coord !== null && this.coord.x === coord.x && this.coord.z === coord.z
  }

  show() {
    this.group.visible = true
    this.syncOverlayVisibility()
  }

  hide() {
    this.group.visible = false
  }

  setOverlaysVisible(visible) {
    if (this.prefabPlacer?.group) {
      this.prefabPlacer.group.visible = visible
    }
    if (this.waterRenderer?.group) {
      this.waterRenderer.group.visible = visible
    }
    if (this.lavaRenderer?.group) {
      this.lavaRenderer.group.visible = visible
    }
  }

  syncOverlayVisibility() {
    const visible = this.group.visible
    this.setOverlaysVisible(visible)
  }

  populate({
    coord,
    terrainMap,
    placements,
    colorResolver
  }) {
    this.coord = { ...coord }
    this.origin = getRenderChunkOrigin(coord, this.chunkSize)
    this.terrainMap = terrainMap
    this.placements = placements

    this.group.position.set(
      this.origin.x * this.cellSize,
      0,
      this.origin.z * this.cellSize
    )

    this.heightfieldAO.build(terrainMap)
    this.terrainRenderer.build(placements, colorResolver, this.heightfieldAO)
    this.waterRenderer?.build(terrainMap)
    this.lavaRenderer?.build(terrainMap)
    this.prefabPlacer?.build(terrainMap)
    this.syncOverlayVisibility()
  }

  updateInstanceColors() {
    this.terrainRenderer.updateInstanceColors()
  }

  dispose() {
    this.prefabPlacer?.dispose()
    this.waterRenderer?.dispose()
    this.lavaRenderer?.dispose()
    this.terrainRenderer.dispose()
    this.group.parent?.remove(this.group)
  }
}
