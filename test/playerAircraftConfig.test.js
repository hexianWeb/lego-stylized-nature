import test from 'node:test'
import assert from 'node:assert/strict'
import sources from '../src/assets/sources.js'
import { worldConfig } from '../src/world/WorldConfig.js'

test('registers player aircraft model source', () => {
  const source = sources.find((entry) => entry.name === 'playerAircraftModel')

  assert.deepEqual(source, {
    name: 'playerAircraftModel',
    type: 'gltfModel',
    path: 'model/player/fly.glb'
  })
})

test('player aircraft config is enabled and has no terrain bounds clamp', () => {
  const config = worldConfig.player.aircraft

  assert.equal(config.enabled, true)
  assert.equal(config.assetName, 'playerAircraftModel')
  assert.equal(config.height > 0, true)
  assert.equal(config.scale > 0, true)
  assert.equal(config.thrust > config.reverseThrust, true)
  assert.equal(config.turnTorque > 0, true)
  assert.equal(config.linearDrag > 0, true)
  assert.equal(config.angularDrag > 0, true)
  assert.equal(config.maxSpeed > 0, true)
  assert.equal(config.maxAngularSpeed > 0, true)
  assert.equal(config.boundsPadding, undefined)
  assert.equal(config.cameraFollow.enabled, true)
  assert.equal(config.cameraFollow.smoothing > 0, true)
})
