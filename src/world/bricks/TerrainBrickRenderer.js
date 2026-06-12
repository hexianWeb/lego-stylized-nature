import * as THREE from 'three/webgpu'
import { createLegoMaterial } from '../../materials/tsl/legoMaterial.js'

export default class TerrainBrickRenderer {
  constructor({ config, brickGeometry }) {
    this.config = config
    this.brickGeometry = brickGeometry
    this.material = createLegoMaterial()
    this.group = new THREE.Group()
    this.group.name = 'TerrainBricks'
    this.mesh = null
    this.capacity = 0
  }

  build(placements, colorResolver) {
    const { cellSize, layerHeight } = this.config.terrain

    if (!this.mesh || placements.length > this.capacity) {
      this.mesh?.dispose()
      if (this.mesh) {
        this.group.remove(this.mesh)
      }
      this.capacity = Math.ceil(Math.max(placements.length, 1) * 1.2)
      this.mesh = new THREE.InstancedMesh(this.brickGeometry, this.material, this.capacity)
      this.mesh.name = 'TerrainBrickInstances'
      this.group.add(this.mesh)
    }

    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()

    placements.forEach((p, i) => {
      matrix.setPosition(
        (p.x + 0.5) * cellSize,
        p.y * layerHeight,
        (p.z + 0.5) * cellSize
      )
      this.mesh.setMatrixAt(i, matrix)

      color.set(colorResolver.resolve({
        biomeCell: p.biomeCell,
        surfaceCell: p.surfaceCell,
        layer: p.layer,
        x: p.x,
        y: p.y,
        z: p.z
      }))
      this.mesh.setColorAt(i, color)
    })

    this.mesh.count = placements.length
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true
    }

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
