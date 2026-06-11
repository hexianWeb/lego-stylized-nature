import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Inspector } from 'three/addons/inspector/Inspector.js'
// import { sobel } from 'three/addons/tsl/display/SobelOperatorNode.js'
import { pass, renderOutput } from 'three/tsl'
import * as THREE from 'three/webgpu'
import { setupInspector } from './gui.js'
import { startLoop } from './loop.js'
import { createInstancedGridMaterial } from './material.js'

const canvas = document.querySelector('canvas.webgl')

const scene = new THREE.Scene()

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
}

const camera = new THREE.PerspectiveCamera(25, sizes.width / sizes.height, 0.1, 100)
camera.position.set(6, 3, 10)
scene.add(camera)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true

const renderer = new THREE.WebGPURenderer({
  canvas,
  forceWebGL: false,
})
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setClearColor('#222')

const inspector = new Inspector()
renderer.inspector = inspector

const postProcessing = new THREE.RenderPipeline(renderer)
postProcessing.outputColorTransform = false

const scenePass = pass(scene, camera)
const outputPass = renderOutput(scenePass)
postProcessing.outputNode = outputPass
// postProcessing.outputNode = sobel(outputPass)

const { material } = createInstancedGridMaterial()

const rows = 50
const columns = 50
const count = rows * columns
const cellSize = 0.1

const gridGeometry = new THREE.PlaneGeometry(cellSize, cellSize, 1, 1)
const instancedMesh = new THREE.InstancedMesh(gridGeometry, material, count)

const matrix = new THREE.Matrix4()
const position = new THREE.Vector3()

for (let i = 0; i < rows; i++) {
  for (let j = 0; j < columns; j++) {
    const index = i * columns + j
    position.set(i * cellSize, j * cellSize, 0)
    matrix.identity()
    matrix.setPosition(position)
    instancedMesh.setMatrixAt(index, matrix)
  }
}

instancedMesh.instanceMatrix.needsUpdate = true
scene.add(instancedMesh)

scene.add(new THREE.AxesHelper(3))
setupInspector(inspector)
startLoop({ renderer, postProcessing, controls })

window.addEventListener('resize', () => {
  sizes.width = window.innerWidth
  sizes.height = window.innerHeight

  camera.aspect = sizes.width / sizes.height
  camera.updateProjectionMatrix()

  renderer.setSize(sizes.width, sizes.height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})
