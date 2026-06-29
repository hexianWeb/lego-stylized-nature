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

  const lightPosition = environment.directionalLight.position
  const targetPosition = environment.directionalLight.target.position
  const targetToLight = lightPosition.clone().sub(targetPosition)

  assertNearlyEqual(lightPosition.x, playerPosition.x + 14.485281374238572)
  assertNearlyEqual(lightPosition.y, playerPosition.y + 20.784609690826528)
  assertNearlyEqual(lightPosition.z, playerPosition.z + 8.485281374238572)
  assertNearlyEqual(targetPosition.x, playerPosition.x - 1.632993161854452)
  assertNearlyEqual(targetPosition.y, playerPosition.y - 10)
  assertNearlyEqual(targetPosition.z, playerPosition.z - 1.632993161854452)
  assert.equal(environment.shadowBounds.halfExtent, 6.4)
  assert.equal(environment.directionalLight.shadow.camera.far > targetToLight.length(), true)

  environment.dispose()
})
