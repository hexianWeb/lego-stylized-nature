import { hash, positionLocal, uniform, vec3 } from 'three/tsl'
import * as THREE from 'three/webgpu'
import { getLandmarkSettings, SUN_GATE } from './landmarkConfig.js'

/** Loaded geometry belongs to Resources. This owns only four shared materials. */
export function createLandmarkAssets(resources) {
  const scene = resources?.items?.[SUN_GATE.resource]?.scene
  if (!scene) return null
  const materialCache = new Map()
  const opacity = uniform(1).onObjectUpdate(({ object }) => object.userData.landmarkOpacity ?? 1)
  const grain = hash(positionLocal.mul(97).floor().dot(vec3(1, 157, 113)))
  const revealMask = opacity.greaterThan(grain)
  const resolve = (source) => {
    if (materialCache.has(source)) return materialCache.get(source)
    const material = new THREE.MeshPhysicalNodeMaterial()
    material.name = `Landmark:${source.name}`
    material.color.copy(source.color)
    material.roughness = source.roughness
    material.metalness = source.metalness
    material.clearcoat = source.clearcoat ?? 0
    material.clearcoatRoughness = source.clearcoatRoughness ?? 0
    material.side = source.side
    // A common opaque mask reaches both main and shadow passes in r185.
    // One object uniform lets every pooled slot share these four materials.
    material.maskNode = revealMask
    material.maskShadowNode = revealMask
    materialCache.set(source, material)
    return material
  }
  const parts = []
  scene.updateMatrixWorld(true)
  scene.traverse((child) => {
    if (!child.isMesh) return
    parts.push({ geometry: child.geometry, transform: child.matrixWorld.clone(),
      material: Array.isArray(child.material) ? child.material.map(resolve) : resolve(child.material) })
  })
  return {
    parts,
    dispose() { for (const material of materialCache.values()) material.dispose() },
  }
}

/** Fixed instance buffers are reused across chunks and warmed before flight. */
export default class LandmarkRenderer {
  constructor({ config, assets }) {
    this.config = config
    this.settings = getLandmarkSettings(config)
    this.assets = assets
    this.group = new THREE.Group()
    this.group.name = 'LandmarkModels'
    this.site = null
    this.elapsed = 0
    this.progress = 0
    this.overlaysVisible = true
    this._matrix = new THREE.Matrix4()
    this._placement = new THREE.Matrix4()
    this._position = new THREE.Vector3()
    this._rotation = new THREE.Quaternion()
    this._scale = new THREE.Vector3()
    this._up = new THREE.Vector3(0, 1, 0)
    this.meshes = assets.parts.map((part, i) => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, 1)
      mesh.name = `SunGate:${i}`
      mesh.count = 0
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.userData.streamingPrefab = true
      mesh.userData.landmarkOpacity = 0
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      this.group.add(mesh)
      return mesh
    })
    this.group.visible = false
  }

  build(terrainMap) {
    this.settings = getLandmarkSettings(this.config)
    this.site = this.settings.enabled ? terrainMap.landmarks?.find(site => site.type === SUN_GATE.id) ?? null : null
    this.restartReveal()
    for (const mesh of this.meshes) mesh.count = this.site ? 1 : 0
    if (!this.site) return
    const { cellSize } = this.config.terrain
    const origin = terrainMap.origin ?? { x: 0, z: 0 }
    this._position.set(this.site.worldX - origin.x * cellSize, this.site.baseY, this.site.worldZ - origin.z * cellSize)
    this._rotation.setFromAxisAngle(this._up, this.site.rotation)
    this._scale.setScalar(this.site.scale)
    this._placement.compose(this._position, this._rotation, this._scale)
    this.meshes.forEach((mesh, i) => {
      this._matrix.multiplyMatrices(this._placement, this.assets.parts[i].transform)
      mesh.setMatrixAt(0, this._matrix)
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      if (mesh.boundingBox) mesh.computeBoundingBox()
    })
  }

  restartReveal() {
    this.elapsed = 0
    this.progress = 0
    this.group.position.y = -Math.max(0, this.settings.riseDistance)
    this.group.visible = false
    for (const mesh of this.meshes) mesh.userData.landmarkOpacity = 0
  }

  setVisible(visible) {
    this.overlaysVisible = visible
    this.group.visible = visible && Boolean(this.site) && this.progress > 0
  }

  update(delta, groundSettled) {
    if (!this.site || !groundSettled) {
      this.group.visible = false
      return
    }
    if (this.progress < 1) {
      this.elapsed += Math.max(0, Number.isFinite(delta) ? delta : 0)
      const duration = Math.max(0, this.settings.revealDuration)
      const t = duration > 0 ? Math.min(1, this.elapsed / duration) : 1
      this.progress = t * t * (3 - 2 * t)
      this.group.position.y = -(1 - this.progress) * Math.max(0, this.settings.riseDistance)
      for (const mesh of this.meshes) mesh.userData.landmarkOpacity = this.progress
    }
    this.group.visible = this.overlaysVisible && this.progress > 0
  }

  dispose() {
    for (const mesh of this.meshes) mesh.dispose()
    this.meshes.length = 0
    this.group.clear()
    this.group.removeFromParent()
  }
}
