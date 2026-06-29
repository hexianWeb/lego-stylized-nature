import * as THREE from 'three/webgpu'
import {
  getRenderChunkKey,
  getRenderChunkOrigin,
  getRenderChunkWorldPosition
} from './chunkCoordinates.js'

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
    this.prefabsBuiltForKey = null
    this.prefabsVisible = false
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
    colorResolver,
    debugSpacing = 0
  }) {
    this.coord = { ...coord }
    this.origin = getRenderChunkOrigin(coord, this.chunkSize)
    this.terrainMap = terrainMap
    this.placements = placements
    this.prefabsBuiltForKey = null
    this.setPrefabsVisible(false)
    this.debugSpacing = debugSpacing

    this.updateWorldPosition(debugSpacing)

    this.heightfieldAO.build(terrainMap)
    this.terrainRenderer.build(placements, colorResolver, this.heightfieldAO)
    this.waterRenderer?.build(terrainMap)
    this.lavaRenderer?.build(terrainMap)
    this.syncOverlayVisibility()
  }

  ensurePrefabsBuilt() {
    if (!this.prefabPlacer || !this.terrainMap || !this.key) {
      return
    }

    if (this.prefabsBuiltForKey === this.key) {
      return
    }

    this.prefabPlacer.build(this.terrainMap)
    this.prefabsBuiltForKey = this.key
  }

  setPrefabsVisible(visible) {
    this.prefabsVisible = visible
    if (this.prefabPlacer?.group) {
      this.prefabPlacer.group.visible = visible
    }
  }

  updateWorldPosition(debugSpacing = this.debugSpacing ?? 0) {
    if (!this.coord) {
      return
    }

    this.debugSpacing = debugSpacing
    const position = getRenderChunkWorldPosition(
      this.coord,
      this.chunkSize,
      this.cellSize,
      debugSpacing
    )
    this.group.position.set(position.x, 0, position.z)
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
