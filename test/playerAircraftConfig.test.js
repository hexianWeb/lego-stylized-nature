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

test('player aircraft visualAttitude config has expected defaults', () => {
  const attitude = worldConfig.player.aircraft.visualAttitude

  assert.equal(attitude.enabled, true)
  assert.equal(attitude.pitchMax > 0, true)
  assert.equal(attitude.rollMax > 0, true)
  assert.equal(attitude.pitchSmoothing > 0, true)
  assert.equal(attitude.rollSmoothing > 0, true)
  assert.equal(attitude.hover.amplitude > 0, true)
  assert.equal(attitude.hover.frequency > 0, true)
  assert.equal(attitude.thrusters.enabled, true)
})

test('player aircraft wing airflow config has expected defaults', () => {
  const airflow = worldConfig.player.aircraft.wingAirflow

  assert.equal(airflow.enabled, true)
  assert.equal(airflow.anchors.wingHalfWidth > 0, true)
  assert.equal(airflow.anchors.outwardOffset >= 0, true)
  assert.equal(airflow.sampleLife > 0, true)
  assert.equal(airflow.emitInterval > 0, true)
  assert.equal(airflow.minEmitDistance >= 0, true)
  assert.equal(airflow.capacity >= airflow.maxSamples, true)
  assert.equal(airflow.maxSamples > 1, true)
  assert.equal(airflow.minSpeedRatio >= 0, true)
  assert.equal(airflow.breakAngleDeg > 0, true)
  assert.equal(airflow.width > 0, true)
  assert.equal(airflow.opacity > 0, true)
  assert.equal(airflow.color, '#f7fbff')
})
