import test from 'node:test'
import assert from 'node:assert/strict'
import sources from '../src/assets/sources.js'
import { worldConfig } from '../src/world/WorldConfig.js'

test('free flight starts at cruise with room for a loop and the original aircraft selected', () => {
  const config = worldConfig.player.aircraft
  assert.equal(config.enabled, true)
  assert.ok(config.cruiseSpeed > 0 && config.maxSpeed > config.cruiseSpeed)
  assert.ok(config.ceiling - config.height > config.cruiseSpeed * config.loopSeconds / Math.PI)
  assert.ok(config.clearance < config.height)
  assert.equal(config.view, 'top')
  assert.equal(config.appearance, 'model')
  assert.equal(sources.find(item => item.name === config.assetName)?.path, 'model/player/fly.glb')
})

test('player aircraft wing airflow config has expected defaults', () => {
  const airflow = worldConfig.player.aircraft.wingAirflow

  assert.equal(airflow.enabled, true)
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
