import * as THREE from 'three/webgpu'
import { isTerrainPreview } from './terrainColorScheme.js'

export default class TerrainBrickRenderer {
  constructor({ config, brickGeometry, materials }) {
    this.config = config
    this.brickGeometry = brickGeometry
    this.material = materials.legoMaterial
    this.previewMaterial = materials.previewMaterial
    this.group = new THREE.Group()
    this.group.name = 'TerrainBricks'
    this.mesh = null
    this.capacity = 0
    this._placements = []
    this._colorResolver = null
    this._heightfieldAO = null
    this._origin = { x: 0, z: 0 }
    this._colorSample = {}
    this.colorHistogram = new Uint32Array(10)
  }

  build(placements, colorResolver, heightfieldAO = null, origin = { x: 0, z: 0 }) {
    const { cellSize, layerHeight } = this.config.terrain

    this._placements = placements
    this._colorResolver = colorResolver
    this._heightfieldAO = heightfieldAO
    this._origin = origin

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
    this.mesh.computeBoundingSphere()
    if (this.mesh.boundingBox) {
      this.mesh.computeBoundingBox()
    }
    this.updateInstanceColors()

    return this.group
  }

  updateInstanceColors() {
    if (!this.mesh || !this._colorResolver) {
      return
    }

    const aoPreview = this.config.terrain.ao?.previewGrayscale === true
    const colorPreview = this.config.terrain.color?.preview ?? 'final'
    this.mesh.material = this.isPreview() ? this.previewMaterial : this.material
    this.colorHistogram.fill(0)

    const color = new THREE.Color()
    const ao = this._heightfieldAO
    const aoEnabled = colorPreview === 'final' && ao?.isActive() && this.config.terrain.ao?.enabled
    const sample = this._colorSample

    this._placements.forEach((p, i) => {
      // Instance transforms and AO stay chunk-local; color/noise use stable world-grid coordinates.
      sample.biomeCell = p.biomeCell
      sample.surfaceCell = p.surfaceCell
      sample.layer = p.layer
      sample.x = this._origin.x + p.x
      sample.y = p.y
      sample.z = this._origin.z + p.z
      let tone = null

      if (aoPreview && ao) {
        const aoValue = ao.get(i)
        color.setRGB(aoValue, aoValue, aoValue)
      } else if (colorPreview === 'noise' && this._colorResolver.sampleTone) {
        tone = this._colorResolver.sampleTone(sample)
        color.setRGB(tone, tone, tone)
      } else {
        if (this._colorResolver.resolveColor) {
          this._colorResolver.resolveColor(sample, color)
          tone = this._colorResolver.lastTone
        } else {
          color.set(this._colorResolver.resolve(sample))
        }

        if (aoEnabled) {
          color.multiplyScalar(ao.get(i))
        }
      }

      if (Number.isFinite(tone)) {
        this.colorHistogram[Math.min(9, Math.max(0, Math.floor(tone * 10)))]++
      }
      this.mesh.setColorAt(i, color)
    })

    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true
    }
  }

  isPreview() {
    return isTerrainPreview(this.config)
  }

  dispose() {
    this.mesh?.dispose()
    this.group.parent?.remove(this.group)
    this.group.clear()
    this.mesh = null
    this.capacity = 0
    this._placements = []
    this._colorResolver = null
    this._heightfieldAO = null
    this.colorHistogram.fill(0)
  }
}
