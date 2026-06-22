import * as THREE from 'three/webgpu'
import { createWaterMaterial } from '../../materials/tsl/waterMaterial.js'

export default class WaterBrickRenderer {
  constructor({
    config,
    brickGeometry,
    waterNoiseTexture = null
  }) {
    this.config = config
    this.brickGeometry = brickGeometry
    this.material = createWaterMaterial(config.water, waterNoiseTexture)
    this.group = new THREE.Group()
    this.group.name = 'WaterBricks'
    this.mesh = null
    this.capacity = 0
  }

  build(terrainMap) {
    const { width, depth, cellSize, layerHeight, waterLevel } =
      this.config.terrain
    const cells = []

    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        if (terrainMap.getSurfaceCell(x, z).isWater) {
          cells.push({ x, z })
        }
      }
    }

    if (!this.mesh || cells.length > this.capacity) {
      this.mesh?.dispose()
      if (this.mesh) {
        this.group.remove(this.mesh)
      }

      this.capacity = Math.ceil(Math.max(cells.length, 1) * 1.2)
      this.mesh = new THREE.InstancedMesh(
        this.brickGeometry,
        this.material,
        this.capacity
      )
      this.mesh.name = 'WaterBrickInstances'
      this.mesh.castShadow = true
      this.mesh.receiveShadow = true
      this.group.add(this.mesh)
    }

    const matrix = new THREE.Matrix4()
    cells.forEach((cell, index) => {
      matrix.setPosition(
        (cell.x + 0.5) * cellSize,
        waterLevel * layerHeight,
        (cell.z + 0.5) * cellSize
      )
      this.mesh.setMatrixAt(index, matrix)
    })

    this.mesh.count = cells.length
    this.mesh.instanceMatrix.needsUpdate = cells.length > 0

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
