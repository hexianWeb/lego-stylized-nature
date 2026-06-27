import * as THREE from 'three/webgpu'
import { createLavaMaterial } from '../../materials/tsl/lavaMaterial.js'
import { getTerrainIterationBounds } from '../terrain/terrainMapBounds.js'

export default class LavaBrickRenderer {
  constructor({ config, brickGeometry, lavaConfig = {}, lavaNoiseTexture = null }) {
    this.config = config
    this.brickGeometry = brickGeometry
    this.material = createLavaMaterial(lavaConfig, lavaNoiseTexture)
    this.group = new THREE.Group()
    this.group.name = 'LavaBricks'
    this.mesh = null
    this.capacity = 0
  }

  build(terrainMap) {
    const { cellSize, layerHeight } = this.config.terrain
    const bounds = getTerrainIterationBounds(terrainMap, this.config)
    const cells = []

    for (let localZ = 0; localZ < bounds.visibleDepth; localZ++) {
      for (let localX = 0; localX < bounds.visibleWidth; localX++) {
        const sampleX = bounds.halo + localX
        const sampleZ = bounds.halo + localZ
        const surfaceCell = terrainMap.getSurfaceCell(sampleX, sampleZ)
        if (surfaceCell.isLava) {
          cells.push({
            x: localX,
            z: localZ,
            height: surfaceCell.lavaHeight ?? surfaceCell.height
          })
        }
      }
    }

    if (!this.mesh || cells.length > this.capacity) {
      this.mesh?.dispose()
      if (this.mesh) {
        this.group.remove(this.mesh)
      }
      this.capacity = Math.ceil(Math.max(cells.length, 1) * 1.2)
      this.mesh = new THREE.InstancedMesh(this.brickGeometry, this.material, this.capacity)
      this.mesh.name = 'LavaBrickInstances'
      this.mesh.castShadow = true
      this.mesh.receiveShadow = true
      this.group.add(this.mesh)
    }

    const matrix = new THREE.Matrix4()
    cells.forEach((cell, i) => {
      matrix.setPosition(
        (cell.x + 0.5) * cellSize,
        cell.height * layerHeight,
        (cell.z + 0.5) * cellSize
      )
      this.mesh.setMatrixAt(i, matrix)
    })

    this.mesh.count = cells.length
    this.mesh.instanceMatrix.needsUpdate = true

    return this.group
  }

  dispose() {
    this.mesh?.dispose()
    this.material.dispose()
    this.group.parent?.remove(this.group)
    this.group.clear()
    this.mesh = null
    this.capacity = 0
  }
}
