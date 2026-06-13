import * as THREE from 'three/webgpu'
import { createLegoMaterial } from '../../materials/tsl/legoMaterial.js'

export default class TerrainBrickRenderer {
  constructor({ config, brickGeometry }) {
    this.config = config
    this.brickGeometry = brickGeometry
    this.material = createLegoMaterial()
    this.previewMaterial = new THREE.MeshBasicNodeMaterial()
    this.group = new THREE.Group()
    this.group.name = 'TerrainBricks'
    this.mesh = null
    this.capacity = 0
    this._placements = []
    this._colorResolver = null
    this._heightfieldAO = null
  }

  build(placements, colorResolver, heightfieldAO = null) {
    const { cellSize, layerHeight } = this.config.terrain

    this._placements = placements
    this._colorResolver = colorResolver
    this._heightfieldAO = heightfieldAO

    if (!this.mesh || placements.length > this.capacity) {
      this.mesh?.dispose()
      if (this.mesh) {
        this.group.remove(this.mesh)
      }
      this.capacity = Math.ceil(Math.max(placements.length, 1) * 1.2)
      this.mesh = new THREE.InstancedMesh(this.brickGeometry, this.material, this.capacity)
      this.mesh.name = 'TerrainBrickInstances'
      this.mesh.castShadow = true
      this.mesh.receiveShadow = true
      this.group.add(this.mesh)
    }

    const matrix = new THREE.Matrix4()

    placements.forEach((p, i) => {
      matrix.setPosition(
        (p.x + 0.5) * cellSize,
        p.y * layerHeight,
        (p.z + 0.5) * cellSize
      )
      this.mesh.setMatrixAt(i, matrix)
    })

    this.mesh.count = placements.length
    this.mesh.instanceMatrix.needsUpdate = true
    this.updateInstanceColors()

    return this.group
  }

  updateInstanceColors() {
    if (!this.mesh || !this._colorResolver) {
      return
    }

    const preview = this.config.terrain.ao?.previewGrayscale === true
    this.mesh.material = preview ? this.previewMaterial : this.material

    const color = new THREE.Color()
    const ao = this._heightfieldAO
    const aoEnabled = ao?.isActive() && this.config.terrain.ao?.enabled

    this._placements.forEach((p, i) => {
      if (preview && ao) {
        const aoValue = ao.get(p.x, p.y, p.z)
        color.setRGB(aoValue, aoValue, aoValue)
      } else {
        color.set(this._colorResolver.resolve({
          biomeCell: p.biomeCell,
          surfaceCell: p.surfaceCell,
          layer: p.layer,
          x: p.x,
          y: p.y,
          z: p.z
        }))

        if (aoEnabled) {
          color.multiplyScalar(ao.get(p.x, p.y, p.z))
        }
      }

      this.mesh.setColorAt(i, color)
    })

    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true
    }
  }

  dispose() {
    this.mesh?.dispose()
    this.material.dispose()
    this.previewMaterial.dispose()
    this.group.parent?.remove(this.group)
    this.group.clear()
    this.mesh = null
    this.capacity = 0
    this._placements = []
    this._colorResolver = null
    this._heightfieldAO = null
  }
}
