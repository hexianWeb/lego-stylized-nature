import * as THREE from 'three/webgpu'
import ChunkColumnTransition from './ChunkColumnTransition.js'
import {
  getRenderChunkKey,
  getRenderChunkOrigin,
  getRenderChunkWorldPosition,
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
    lavaRenderer = null,
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
    this.prefabBuildMs = 0
    this.columnTransition = null
    this.buildTimings = { aoMs: 0, instancesMs: 0 }
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

  startLoading(direction, settings) {
    this.startColumnTransition(1, direction, settings, false)
    this.show()
  }

  startColumnTransition(target, direction, settings, initiallyVisible) {
    this.columnTransition ??= new ChunkColumnTransition({
      chunkSize: this.chunkSize,
      cellSize: this.cellSize,
      initiallyVisible,
    })
    this.columnTransition.start(target, direction, settings)
    this.columnTransition.capture(this.terrainRenderer.group)
    this.columnTransition.capture(this.waterRenderer?.group)
    this.columnTransition.capture(this.lavaRenderer?.group)
    if (this.prefabsBuiltForKey === this.key) {
      this.columnTransition.capture(this.prefabPlacer?.group)
    }
  }

  updateTransition(deltaSeconds) {
    return this.columnTransition?.update(deltaSeconds) ?? true
  }

  resetTransition() {
    this.columnTransition?.reset()
    this.columnTransition = null
  }

  discardTransition() {
    this.columnTransition?.discard()
    this.columnTransition = null
  }

  setOverlaysVisible(visible) {
    visible = visible && this.terrainRenderer.isPreview?.() !== true
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
    aoValues = null,
    colorResolver,
    debugSpacing = 0,
  }) {
    this.resetTransition()
    this.coord = { ...coord }
    this.origin = getRenderChunkOrigin(coord, this.chunkSize)
    this.terrainMap = terrainMap
    this.placements = placements
    this.prefabsBuiltForKey = null
    this.prefabBuildMs = 0
    this.setPrefabsVisible(false)
    this.debugSpacing = debugSpacing

    this.updateWorldPosition(debugSpacing)

    const started = performance.now()
    if (aoValues) {
      this.heightfieldAO.setValues(aoValues)
    }
    else {
      this.heightfieldAO.build(terrainMap, placements)
    }
    const aoBuilt = performance.now()
    this.terrainRenderer.build(placements, colorResolver, this.heightfieldAO, this.origin)
    this.waterRenderer?.build(terrainMap)
    this.lavaRenderer?.build(terrainMap)
    this.buildTimings.aoMs = aoBuilt - started
    this.buildTimings.instancesMs = performance.now() - aoBuilt
    this.syncOverlayVisibility()
  }

  ensurePrefabsBuilt() {
    if (!this.prefabPlacer || !this.terrainMap || !this.key) {
      return
    }

    if (this.prefabsBuiltForKey === this.key) {
      return
    }

    const started = performance.now()
    this.prefabPlacer.build(this.terrainMap)
    this.prefabBuildMs = performance.now() - started
    this.prefabsBuiltForKey = this.key
    if (this.columnTransition?.active) {
      this.columnTransition.capture(this.prefabPlacer.group)
    }
  }

  setPrefabsVisible(visible) {
    this.prefabsVisible = visible
    if (this.prefabPlacer?.group) {
      this.prefabPlacer.group.visible = visible && this.terrainRenderer.isPreview?.() !== true
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
      debugSpacing,
    )
    this.group.position.set(position.x, 0, position.z)
  }

  updateInstanceColors() {
    this.terrainRenderer.updateInstanceColors()
    this.setPrefabsVisible(this.prefabsVisible)
  }

  dispose() {
    this.resetTransition()
    this.prefabPlacer?.dispose()
    this.waterRenderer?.dispose()
    this.lavaRenderer?.dispose()
    this.terrainRenderer.dispose()
    this.group.parent?.remove(this.group)
  }
}
