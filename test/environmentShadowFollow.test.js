import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import Environment from '../src/world/environment.js'

const EPSILON = 1e-6

function assertNearlyEqual(actual, expected, epsilon = EPSILON) {
  assert.equal(Math.abs(actual - expected) <= epsilon, true)
}

test('player shadow follow uses fixed offsets from the player', () => {
  const environment = new Environment(new THREE.Scene())
  const playerPosition = new THREE.Vector3(10, 3, 20)

  environment.configureShadows({
    centerX: 0,
    centerZ: 0,
    halfExtent: 6.4,
    maxHeight: 12
  })

  environment.followPlayerShadow(playerPosition, {
    halfExtent: 6.4,
    maxHeight: 12
  })
  environment.syncDirectionalTarget()

  const lightPosition = environment.directionalLight.position
  const targetPosition = environment.directionalLight.target.position
  const targetToLight = lightPosition.clone().sub(targetPosition)

  assertNearlyEqual(lightPosition.x, playerPosition.x - 14.48)
  assertNearlyEqual(lightPosition.y, playerPosition.y + 20.78)
  assertNearlyEqual(lightPosition.z, playerPosition.z - 8.48)
  assertNearlyEqual(targetPosition.x, playerPosition.x - 1.63)
  assertNearlyEqual(targetPosition.y, playerPosition.y - 10)
  assertNearlyEqual(targetPosition.z, playerPosition.z - 1.63)
  assert.equal(environment.shadowBounds.halfExtent, 6.4)
  assert.equal(environment.directionalLight.shadow.camera.far > targetToLight.length(), true)

  environment.dispose()
})

function assertEnvelopeContained(environment, position, envelope) {
  const camera = environment.directionalLight.shadow.camera
  for (const x of [-envelope.radius, envelope.radius]) {
    for (const y of [envelope.minY, envelope.maxY]) {
      for (const z of [-envelope.radius, envelope.radius]) {
        const projected = new THREE.Vector3(position.x + x, y, position.z + z).project(camera)
        for (const component of projected.toArray()) {
          assert.equal(Number.isFinite(component), true)
          assert.equal(component >= -1 - EPSILON && component <= 1 + EPSILON, true,
            `Envelope corner projected outside the shadow camera: ${projected.toArray()}`)
        }
      }
    }
  }
  assert.equal(camera.near > 0 && camera.far > camera.near, true)
}

test('shadow fit contains the loaded prefab window at normal and high player altitude', () => {
  const environment = new Environment(new THREE.Scene())
  const envelope = { radius: 15.5, minY: -2, maxY: 18 }
  for (const position of [new THREE.Vector3(10, 3, 20), new THREE.Vector3(-80, 120, 60)]) {
    environment.followPlayerShadow(position, { halfExtent: 14.4, envelope })
    assertEnvelopeContained(environment, position, envelope)
  }
  environment.dispose()
})

test('shadow fit moves the light along its direction when very tall prefabs cross the near plane', () => {
  const environment = new Environment(new THREE.Scene())
  const position = new THREE.Vector3(0, 1, 0)
  const envelope = { radius: 15, minY: 0, maxY: 80 }
  const expectedDirection = new THREE.Vector3(-14.48 + 1.63, 20.78 + 10, -8.48 + 1.63).normalize()
  environment.followPlayerShadow(position, { halfExtent: 14.4, envelope })
  assertEnvelopeContained(environment, position, envelope)
  const direction = environment.directionalLight.position.clone()
    .sub(environment.directionalLight.target.position).normalize()
  assertNearlyEqual(direction.dot(expectedDirection), 1)
  environment.dispose()
})

test('invalid optional shadow envelopes fall back to finite legacy bounds', () => {
  const environment = new Environment(new THREE.Scene())
  environment.followPlayerShadow(new THREE.Vector3(2, 4, 6), {
    halfExtent: 14.4, envelope: { radius: Infinity, minY: 0, maxY: 20 }
  })
  assert.equal(environment.shadowEnvelope, null)
  assert.equal(environment.directionalLight.shadow.camera.left, -14.4)
  assert.equal(Number.isFinite(environment.directionalLight.shadow.camera.far), true)
  environment.dispose()
})
