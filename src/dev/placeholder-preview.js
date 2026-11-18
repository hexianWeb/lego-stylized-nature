import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import * as THREE from 'three/webgpu'
import VoxelTerrainPlaceholder from '../world/chunks/VoxelTerrainPlaceholder.js'
import ChunkColumnTransition from '../world/chunks/ChunkColumnTransition.js'
import { worldConfig } from '../world/WorldConfig.js'

const scene = new THREE.Scene()
scene.background = new THREE.Color('#d9e7df')
const patches = []
const labels = document.querySelector('#labels')
for (const [index, [biome, name]] of [
  ['forest', '青翠森林'], ['autumnForest', '秋日林地'], ['desert', '金色沙漠'],
  ['snowForest', '雪松之境'], ['wetland', '静谧湿地'], ['volcano', '火山荒原'],
].entries()) {
  const config = structuredClone(worldConfig)
  config.biomes.previewBiome = biome
  config.chunks.placeholder.radius = 2
  const group = new THREE.Group()
  group.position.set((index % 3 - 1) * 20, 0, (Math.floor(index / 3) - 0.5) * 23)
  scene.add(group)
  const placeholder = new VoxelTerrainPlaceholder({ config, parentGroup: group })
  // One patch per biome; a 900-instance pool also fits Three's uniform-buffer path.
  const transition = new ChunkColumnTransition({ chunkSize: config.chunks.size, cellSize: config.terrain.cellSize })
  const label = document.createElement('span')
  label.className = 'label'
  label.textContent = name
  labels.append(label)
  patches.push({ placeholder, group, transition, label })
}

let variation = 0
function populate() {
  for (const patch of patches) {
    const { placeholder, group } = patch
    const coord = { x: variation, z: -variation }
    const chunk = placeholder.createChunk(coord)
    const span = placeholder.chunkSize * placeholder.config.terrain.cellSize
    // Keep the gallery fixed while sampling a different place in each biome.
    group.children[0].position.set(-(coord.x + 0.5) * span, 0, -(coord.z + 0.5) * span)
    placeholder.cache.clear()
    placeholder.cache.set(`${coord.x}:${coord.z}`, chunk)
    placeholder.centerCoord = coord
    placeholder.mesh.count = chunk.voxels.length
    placeholder.updateColors()
    patch.chunk = chunk
    patch.transition.progress.fill(0)
    patch.transition.start(1, { x: 1, z: 0 })
  }
  applyProgress()
}

function applyProgress() {
  const elapsed = Number(document.querySelector('#reveal').value) / 100 * 1.05
  for (const { placeholder, transition, chunk } of patches) {
    transition.progress.fill(0)
    transition.start(1, { x: 1, z: 0 })
    transition.update(elapsed)
    placeholder.updateChunk(chunk, { columnTransition: transition })
    placeholder.mesh.instanceMatrix.needsUpdate = true
    placeholder.mesh.computeBoundingSphere()
  }
}
populate()

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 300)
camera.position.set(24, 64, 83)
const controls = new OrbitControls(camera, document.querySelector('canvas'))
controls.target.set(0, 0, 0)
controls.enablePan = false
controls.minDistance = 55
controls.maxDistance = 160
controls.update()
const renderer = new THREE.WebGPURenderer({ canvas: document.querySelector('canvas'), antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
await renderer.init()

function updateLabels() {
  for (const { group, label } of patches) {
    const point = group.position.clone().add(new THREE.Vector3(0, 0, 9)).project(camera)
    label.style.left = `${(point.x * 0.5 + 0.5) * innerWidth}px`
    label.style.top = `${(-point.y * 0.5 + 0.5) * innerHeight}px`
  }
}
function render() { renderer.render(scene, camera); updateLabels() }
await renderer.renderAsync(scene, camera)
updateLabels()
controls.addEventListener('change', render)
document.querySelector('#next').addEventListener('click', () => { variation++; populate(); render() })
document.querySelector('#reveal').addEventListener('input', () => { applyProgress(); render() })
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
  render()
})
