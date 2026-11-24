import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const CAPACITY = 16
const LIFE = 0.48
const DRAG = 2.6

function coloredBox(width, height, depth, color) {
  const box = new THREE.BoxGeometry(width, height, depth)
  const face = new THREE.Color(color)
  const colors = []
  for (let i = 0; i < box.attributes.position.count; i++) colors.push(face.r, face.g, face.b)
  box.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return box
}

export function cannonFlashGeometry() {
  // Local +Y starts at the muzzle. Block shoulders keep the flash legible over bright terrain.
  return mergeBlocks([
    coloredBox(0.65, 0.28, 0.65, 0xfff3bc).translate(0, 0.14, 0),
    coloredBox(1, 0.24, 1, 0xffc34e).translate(0, 0.40, 0),
    coloredBox(0.58, 0.31, 0.58, 0xffa135).translate(0, 0.675, 0),
    coloredBox(0.28, 0.17, 0.28, 0xee7626).translate(0, 0.915, 0),
  ])
}

function mergeBlocks(parts) {
  const geometry = mergeGeometries(parts)
  for (const part of parts) part.dispose()
  return geometry
}

export function createCannonCasings() {
  // A raised rim and dark mouth catch the light on opposite ends during a tumble.
  const geometry = mergeBlocks([
    coloredBox(0.065, 0.032, 0.032, 0xe5ae55),
    coloredBox(0.009, 0.041, 0.041, 0xffda87).translate(-0.036, 0, 0),
    coloredBox(0.003, 0.021, 0.021, 0x58361c).translate(0.033, 0, 0),
  ]).scale(0.45, 0.45, 0.45)
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.43, metalness: 0.32 })
  const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY)
  mesh.name = 'CannonCasings'
  mesh.frustumCulled = false
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  const pool = Array.from({ length: CAPACITY }, () => ({
    origin: new THREE.Vector3(), velocity: new THREE.Vector3(), orientation: new THREE.Quaternion(),
    age: LIFE, side: 1, scale: 1, spin: 0,
  }))
  const transform = new THREE.Object3D()
  const spin = new THREE.Euler()
  const rotation = new THREE.Quaternion()
  let cursor = 0

  function reset() {
    cursor = mesh.count = 0
    for (const casing of pool) casing.age = LIFE
  }

  function update(delta, events) {
    for (const casing of pool) {
      if (casing.age < LIFE) casing.age += delta
    }
    for (const event of events) {
      if (event.type !== 'cannon' || !event.orientation) continue
      const casing = pool[cursor]
      const variation = (cursor % 4) / 3
      cursor = (cursor + 1) % CAPACITY
      casing.side = event.side
      casing.scale = event.scale
      casing.age = event.frameAge
      casing.spin = event.side * (12 + 4 * variation)
      casing.orientation.copy(event.orientation)
      // The eject port sits just aft and outboard of this wing's firing position.
      casing.origin.set(-0.065, 0.018, event.side * 0.026).multiplyScalar(event.scale)
        .applyQuaternion(event.orientation).add(event.position).addScaledVector(event.carrierVelocity, -event.frameAge)
      casing.velocity.set(-0.46, 0.83 + 0.14 * variation, event.side * (1.85 + 0.25 * variation))
        .multiplyScalar(event.scale).applyQuaternion(event.orientation).add(event.carrierVelocity)
    }

    let count = 0
    for (const casing of pool) {
      const age = casing.age
      if (age >= LIFE) continue
      // Exponential drag sheds the aircraft's inherited speed; gravity stays world-down in a bank.
      const drift = -Math.expm1(-DRAG * age) / DRAG
      transform.position.copy(casing.origin).addScaledVector(casing.velocity, drift)
      transform.position.y -= 3.8 * age * age
      spin.set(age * 7, casing.side * 0.48 + age * casing.spin, age * 9)
      transform.quaternion.copy(casing.orientation).multiply(rotation.setFromEuler(spin))
      transform.scale.setScalar(casing.scale * (1 - THREE.MathUtils.smoothstep(age, LIFE * 0.76, LIFE)))
      transform.updateMatrix()
      mesh.setMatrixAt(count++, transform.matrix)
    }
    mesh.count = count
    if (count) mesh.instanceMatrix.needsUpdate = true
  }

  reset()
  return {
    mesh, reset, update,
    dispose() {
      mesh.dispose()
      geometry.dispose()
      material.dispose()
    },
  }
}
