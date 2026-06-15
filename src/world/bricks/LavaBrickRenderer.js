import * as THREE from 'three/webgpu'
import { createLavaMaterial } from '../../materials/tsl/lavaMaterial.js'

export default class LavaBrickRenderer {
  constructor({ config, brickGeometry, lavaConfig = {} }) {
    this.config = config
    this.brickGeometry = brickGeometry
    this.material = createLavaMaterial(lavaConfig)
    this.group = new THREE.Group()
    this.group.name = 'LavaBricks'
    this.mesh = null
    this.capacity = 0
  }

  build(terrainMap) {
    const { width, depth, cellSize, layerHeight } = this.config.terrain

    const cells = []
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        const surfaceCell = terrainMap.getSurfaceCell(x, z)
        if (surfaceCell.isLava) {
          cells.push({ x, z, height: surfaceCell.height })
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
        (cell.height + 1) * layerHeight,
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
