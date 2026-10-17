import * as THREE from 'three/webgpu'

/**
 * Flat 128×128 baseplate for sandbox mode. Pickable so the raycaster
 * can convert clicks into cell coordinates. Uses `SandboxGrid` for the
 * cell-to-world math.
 */
export class SandboxBaseplate {
  constructor({ grid }) {
    this.grid = grid

    const { width: worldW, depth: worldD } = grid.worldSize()

    const geometry = new THREE.PlaneGeometry(worldW, worldD)
    geometry.rotateX(-Math.PI / 2)

    const material = new THREE.MeshStandardNodeMaterial({
      color: new THREE.Color('#9aa3ad'),
      roughness: 0.85,
      metalness: 0.0
    })

    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.position.set(worldW * 0.5, -grid.layerHeight * 0.1, worldD * 0.5)
    this.mesh.receiveShadow = true
    this.mesh.userData.pickable = true
    this.mesh.userData.kind = 'sandbox-baseplate'

    this.group = new THREE.Group()
    this.group.name = 'SandboxBaseplate'
    this.group.add(this.mesh)

    const maxDim = Math.max(grid.width, grid.depth)
    const gridHelper = new THREE.GridHelper(
      maxDim * grid.cellSize,
      maxDim,
      '#44505d',
      '#2a323c'
    )
    gridHelper.position.y = -grid.layerHeight * 0.05
    gridHelper.material.transparent = true
    gridHelper.material.opacity = 0.3
    gridHelper.userData.pickable = false
    this.group.add(gridHelper)
  }

  setVisible(visible) {
    this.group.visible = visible
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.group.traverse((child) => {
      if (child.isLineSegments) {
        child.geometry?.dispose?.()
        child.material?.dispose?.()
      }
    })
    this.group.parent?.remove(this.group)
  }
}