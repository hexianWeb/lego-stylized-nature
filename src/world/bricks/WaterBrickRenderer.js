import * as THREE from 'three/webgpu'
import { createWaterMaterial } from '../../materials/tsl/waterMaterial.js'
import { classifyWaterDepth, WATER_BUCKETS } from './waterDepth.js'

const BUCKET_SETTINGS = {
  shallow: { colorKey: 'shallowColor', meshName: 'WaterShallowInstances' },
  transition: { colorKey: 'transitionColor', meshName: 'WaterTransitionInstances' },
  deep: { colorKey: 'deepColor', meshName: 'WaterDeepInstances' },
}

export default class WaterBrickRenderer {
  constructor({ config, brickGeometry }) {
    this.config = config
    this.brickGeometry = brickGeometry
    this.group = new THREE.Group()
    this.group.name = 'WaterBricks'
    this.buckets = Object.fromEntries(
      WATER_BUCKETS.map((name) => {
        const settings = BUCKET_SETTINGS[name]
        return [
          name,
          {
            material: createWaterMaterial(
              config.water,
              config.water?.[settings.colorKey],
            ),
            mesh: null,
            capacity: 0,
          },
        ]
      }),
    )
  }

  build(terrainMap) {
    const { width, depth, cellSize, layerHeight, waterLevel } =
      this.config.terrain
    const cellsByBucket = Object.fromEntries(
      WATER_BUCKETS.map((name) => [name, []]),
    )

    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        const surfaceCell = terrainMap.getSurfaceCell(x, z)
        if (!surfaceCell.isWater) {
          continue
        }

        const bucketName = classifyWaterDepth(
          waterLevel - surfaceCell.height,
          this.config.water,
        )
        cellsByBucket[bucketName].push({ x, z })
      }
    }

    for (const bucketName of WATER_BUCKETS) {
      this.updateBucket(
        bucketName,
        cellsByBucket[bucketName],
        cellSize,
        layerHeight,
        waterLevel,
      )
    }

    return this.group
  }

  updateBucket(bucketName, cells, cellSize, layerHeight, waterLevel) {
    const bucket = this.buckets[bucketName]

    if (cells.length > 0 && (!bucket.mesh || cells.length > bucket.capacity)) {
      bucket.mesh?.dispose()
      if (bucket.mesh) {
        this.group.remove(bucket.mesh)
      }

      bucket.capacity = Math.ceil(Math.max(cells.length, 1) * 1.2)
      bucket.mesh = new THREE.InstancedMesh(
        this.brickGeometry,
        bucket.material,
        bucket.capacity,
      )
      bucket.mesh.name = BUCKET_SETTINGS[bucketName].meshName
      bucket.mesh.castShadow = true
      bucket.mesh.receiveShadow = true
      this.group.add(bucket.mesh)
    }

    if (!bucket.mesh) {
      return
    }

    const matrix = new THREE.Matrix4()
    cells.forEach((cell, index) => {
      matrix.setPosition(
        (cell.x + 0.5) * cellSize,
        waterLevel * layerHeight,
        (cell.z + 0.5) * cellSize,
      )
      bucket.mesh.setMatrixAt(index, matrix)
    })

    bucket.mesh.count = cells.length
    bucket.mesh.instanceMatrix.needsUpdate = cells.length > 0
  }

  get materials() {
    return WATER_BUCKETS.map((name) => this.buckets[name].material)
  }

  dispose() {
    for (const bucket of Object.values(this.buckets)) {
      bucket.mesh?.dispose()
      bucket.material.dispose()
      bucket.mesh = null
      bucket.capacity = 0
    }

    this.group.parent?.remove(this.group)
    this.group.clear()
  }
}
