import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import * as THREE from 'three/webgpu'
import VoxelClouds from '../world/chunks/VoxelClouds.js'

const scene = new THREE.Scene()
scene.background = new THREE.Color('#0886b8')
const group = new THREE.Group()
scene.add(group)
const clouds = new VoxelClouds({
  config: {
    seed: 20260608,
    chunks: { size: 72, windowRadius: 1, clouds: { radius: 2 } },
    terrain: { cellSize: 0.2, layerHeight: 0.095, maxHeight: 64 },
  },
  parentGroup: new THREE.Group(),
})
// The study contains only three clouds; keep its GPU pool compact as well.
const mesh = new THREE.InstancedMesh(clouds.geometry, clouds.material, 96)
group.add(mesh)
let variation = 0
function showClouds() {
  const voxels = []
  for (const [anchorX, anchorZ, offsetX, offsetY, offsetZ, scale] of [
    [variation, 1, -3.3, 0, 0, 1],
    [variation + 1, 2, 3.9, -0.55, 0.7, 0.7],
    [variation + 2, 1, -3.6, -1.5, 3.5, 0.3],
  ]) {
    const source = clouds.createCloud(anchorX, anchorZ)
    const minX = Math.min(...source.map(voxel => voxel.x - voxel.size / 2))
    const maxX = Math.max(...source.map(voxel => voxel.x + voxel.size / 2))
    const minY = Math.min(...source.map(voxel => voxel.y - voxel.sizeY / 2))
    const minZ = Math.min(...source.map(voxel => voxel.z - voxel.sizeZ / 2))
    const maxZ = Math.max(...source.map(voxel => voxel.z + voxel.sizeZ / 2))
    voxels.push(...source.map(voxel => ({
      ...voxel,
      x: (voxel.x - (minX + maxX) / 2) * scale + offsetX,
      y: (voxel.y - minY) * scale + offsetY,
      z: (voxel.z - (minZ + maxZ) / 2) * scale + offsetZ,
      size: voxel.size * scale,
      sizeY: voxel.sizeY * scale,
      sizeZ: voxel.sizeZ * scale,
    })))
  }
  mesh.count = voxels.length
  const color = new THREE.Color()
  const matrix = new THREE.Matrix4()
  voxels.forEach((voxel, index) => {
    matrix.makeScale(voxel.size, voxel.sizeY, voxel.sizeZ).setPosition(voxel.x, voxel.y, voxel.z)
    mesh.setMatrixAt(index, matrix)
    mesh.setColorAt(index, color.copy(clouds.shadowColor).lerp(clouds.lightColor, voxel.tint))
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingSphere()
}
showClouds()

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 100)
camera.position.set(13, 9, 17)
const controls = new OrbitControls(camera, document.querySelector('canvas'))
controls.target.set(0, 1, 0)
controls.enableDamping = false
controls.enablePan = false
controls.minDistance = 10
controls.maxDistance = 40
controls.update()
const renderer = new THREE.WebGPURenderer({ canvas: document.querySelector('canvas'), antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
await renderer.init()
const render = () => renderer.render(scene, camera)
await renderer.renderAsync(scene, camera)
controls.addEventListener('change', render)
document.querySelector('button').addEventListener('click', () => { variation += 3; showClouds(); render() })
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
  render()
})
