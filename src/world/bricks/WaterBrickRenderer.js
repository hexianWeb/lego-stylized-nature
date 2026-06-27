import * as THREE from 'three/webgpu'
import { createWaterMaterial } from '../../materials/tsl/waterMaterial.js'
import { getTerrainIterationBounds } from '../terrain/terrainMapBounds.js'

const WATER_PAGE_CAPACITY = 900

function resolveWaterGridSize(config) {
  const chunkSize = config.chunks?.size
  if (config.chunks?.enabled === true && chunkSize != null) {
    return { width: chunkSize, depth: chunkSize }
  }

  return {
    width: config.terrain.width,
    depth: config.terrain.depth
  }
}

export default class WaterBrickRenderer {
  constructor({
    config,
    brickGeometry,
    waterNoiseTexture = null,
    pageCapacity = WATER_PAGE_CAPACITY
  }) {
    this.config = config
    this.brickGeometry = brickGeometry
    this.material = createWaterMaterial(config.water, waterNoiseTexture)

    this.group = new THREE.Group()
    this.group.name = 'WaterBricks'

    this.pageCapacity = pageCapacity
    this.pages = []
    this.initialized = false
    this._matrix = new THREE.Matrix4()

    const { width, depth } = resolveWaterGridSize(config)
    this.gridWidth = width
    this.gridDepth = depth
  }

  get mesh() {
    return this.pages[0]?.mesh ?? null
  }

  get instanceCount() {
    return this.gridWidth * this.gridDepth
  }

  build(terrainMap = null) {
    let width = this.gridWidth
    let depth = this.gridDepth

    if (terrainMap) {
      const bounds = getTerrainIterationBounds(terrainMap, this.config)
      width = bounds.visibleWidth
      depth = bounds.visibleDepth
    }

    if (this.initialized && width === this.gridWidth && depth === this.gridDepth) {
      return this.group
    }

    this.gridWidth = width
    this.gridDepth = depth
    this.initializeGrid()
    this.initialized = true

    return this.group
  }

  initializeGrid() {
    this.disposePages()

    const { cellSize, layerHeight, waterLevel } = this.config.terrain
    const waterY = waterLevel * layerHeight
    let instanceIndex = 0

    for (let localZ = 0; localZ < this.gridDepth; localZ++) {
      for (let localX = 0; localX < this.gridWidth; localX++) {
        const pageIndex = Math.floor(instanceIndex / this.pageCapacity)
        const localIndex = instanceIndex % this.pageCapacity
        const page = this.ensurePage(pageIndex)

        this._matrix.makeTranslation(
          (localX + 0.5) * cellSize,
          waterY,
          (localZ + 0.5) * cellSize
        )

        page.mesh.setMatrixAt(localIndex, this._matrix)
        page.count = Math.max(page.count, localIndex + 1)
        page.mesh.count = page.count
        page.mesh.visible = true
        page.mesh.instanceMatrix.needsUpdate = true

        instanceIndex++
      }
    }
  }

  ensurePage(pageIndex) {
    let page = this.pages[pageIndex]

    if (page) {
      page.count = 0
      page.mesh.count = 0
      return page
    }

    const mesh = new THREE.InstancedMesh(
      this.brickGeometry,
      this.material,
      this.pageCapacity
    )

    mesh.name = pageIndex === 0 ? 'WaterBrickInstances' : `WaterBrickInstances_${pageIndex}`
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.count = 0
    mesh.visible = false
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)

    page = {
      mesh,
      count: 0
    }

    this.pages[pageIndex] = page
    this.group.add(mesh)

    return page
  }

  disposePages() {
    for (const page of this.pages) {
      if (!page) {
        continue
      }

      page.mesh.dispose()
      this.group.remove(page.mesh)
    }

    this.pages.length = 0
  }

  dispose() {
    this.disposePages()
    this.material.dispose()
    this.group.parent?.remove(this.group)
    this.group.clear()
    this.initialized = false
  }
}
