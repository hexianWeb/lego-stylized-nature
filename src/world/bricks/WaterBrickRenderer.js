import * as THREE from 'three/webgpu'
import { getTerrainIterationBounds } from '../terrain/terrainMapBounds.js'

const WATER_PAGE_CAPACITY = 900

export default class WaterBrickRenderer {
  constructor({
    config,
    brickGeometry,
    materials,
    pageCapacity = WATER_PAGE_CAPACITY
  }) {
    this.config = config
    this.brickGeometry = brickGeometry
    this.material = materials.waterMaterial

    this.group = new THREE.Group()
    this.group.name = 'WaterBricks'

    this.pageCapacity = pageCapacity
    this.pages = []
    this._instanceCount = 0
    this._matrix = new THREE.Matrix4()
  }

  get mesh() {
    return this.pages[0]?.mesh ?? null
  }

  get instanceCount() {
    return this._instanceCount
  }

  build(terrainMap) {
    const bounds = getTerrainIterationBounds(terrainMap, this.config)
    for (const page of this.pages) {
      page.count = 0
    }
    const { cellSize, layerHeight, waterLevel } = this.config.terrain
    const waterY = waterLevel * layerHeight
    let instanceIndex = 0

    for (let localZ = 0; localZ < bounds.visibleDepth; localZ++) {
      for (let localX = 0; localX < bounds.visibleWidth; localX++) {
        if (this.config.water?.enableWater === false
            || !terrainMap.getSurfaceCell(bounds.halo + localX, bounds.halo + localZ)?.isWater) {
          continue
        }
        const pageIndex = Math.floor(instanceIndex / this.pageCapacity)
        const localIndex = instanceIndex % this.pageCapacity
        const page = this.ensurePage(pageIndex)

        this._matrix.makeTranslation(
          (localX + 0.5) * cellSize,
          waterY,
          (localZ + 0.5) * cellSize
        )

        page.mesh.setMatrixAt(localIndex, this._matrix)
        page.count = localIndex + 1

        instanceIndex++
      }
    }
    this._instanceCount = instanceIndex
    for (const page of this.pages) {
      page.mesh.count = page.count
      page.mesh.visible = page.count > 0
      page.mesh.castShadow = this.config.water?.castShadow !== false
      page.mesh.instanceMatrix.needsUpdate = true
      page.mesh.computeBoundingSphere()
      if (page.mesh.boundingBox) {
        page.mesh.computeBoundingBox()
      }
    }
    return this.group
  }

  ensurePage(pageIndex) {
    let page = this.pages[pageIndex]

    if (page) {
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
    mesh.count = 0
    mesh.visible = false
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

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
    this._instanceCount = 0
  }

  dispose() {
    this.disposePages()
    this.group.parent?.remove(this.group)
    this.group.clear()
  }
}
