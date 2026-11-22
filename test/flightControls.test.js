import assert from 'node:assert/strict'
import test from 'node:test'
import { PerspectiveCamera, Vector3 } from 'three/webgpu'
import { enemyBearing, projectEnemyMarker } from '../src/ui/AircraftWeaponHUD.js'
import { getCockpitTelemetry } from '../src/ui/FlightDeck.js'
import WorldCamera from '../src/world/camera.js'
import { createAircraftState } from '../src/world/player/aircraftMotion.js'
import PlayerAircraft from '../src/world/player/PlayerAircraft.js'

function createPlayer(sizes = { width: 390, height: 844 }) {
  const experience = {
    renderer: {},
    time: { getDelta: () => 0.05, getElapsed: () => 1 },
    worldCamera: new WorldCamera(sizes),
  }
  const player = new PlayerAircraft(experience, {
    inputTarget: new EventTarget(),
    config: { terrain: { width: 128, depth: 128, cellSize: 0.2 }, player: { aircraft: { enabled: false, height: 5.5 } } },
  })
  player.enabled = true
  experience.worldCamera.resetView(player.state.position)
  return player
}

test('enemy pointers keep the correct screen side before and after crossing behind the camera', () => {
  const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 100)
  camera.updateWorldMatrix(true, false)
  const cameraPoint = new Vector3()
  const marker = (x, y, z) => {
    const result = {}
    projectEnemyMarker(new Vector3(x, y, z), camera, cameraPoint, result)
    return result
  }
  assert.equal(marker(0, 0, -10).edge, false)
  assert.equal(marker(15, 0, -2).x, 1)
  assert.equal(marker(15, 0, 2).x, 1)
  assert.equal(marker(-15, 0, 2).x, -1)
  assert.equal(marker(0, 10, -2).y, -1)
  assert.equal(marker(0, 0, 10).y, 1)
  assert.ok(Number.isFinite(marker(0, 0, 0).angle))

  assert.equal(enemyBearing(1, 0, 0, 0), '正前')
  assert.equal(enemyBearing(-1, 0, 1, 0), '右后')
  assert.equal(enemyBearing(-1, 0, -1, 0), '左后')
  assert.equal(enemyBearing(1, 0, 0, Math.PI), '正后')
  assert.equal(enemyBearing(0, -3, 0, 0), '正下')
})

test('a pursuer behind the plane stays marked over its model if the chase camera can see it', () => {
  const player = createPlayer({ width: 1280, height: 720 })
  player.view = 'chase'
  player.syncCamera(0)
  const camera = player.experience.worldCamera.instance
  camera.updateWorldMatrix(true, false)
  const pursuer = player.state.position.clone().add(new Vector3(-0.4, 0, 0))
  const result = {}
  projectEnemyMarker(pursuer, camera, new Vector3(), result)
  assert.equal(result.edge, false)
  player.dispose()
})

test('the same held keys fly the same route in all three views and both screen orientations', () => {
  let pose
  for (const sizes of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    for (const view of ['top', 'chase', 'cockpit']) {
      const player = createPlayer(sizes)
      player.view = view
      player.input.handleKeyDown({ code: 'KeyD' })
      player.input.handleKeyDown({ code: 'KeyS' })
      for (let i = 0; i < 20; i++) player.update()
      assert.ok(player.state.bank > 0.3 && player.state.yaw > 0)
      assert.ok(player.state.position.y > player.motionConfig.height + 0.8)
      const { position, yaw, pathPitch } = player.state
      const nextPose = { position: position.toArray(), yaw, pathPitch }
      if (pose) assert.deepEqual(nextPose, pose)
      else pose = nextPose
      player.input.handleKeyUp({ code: 'KeyD' })
      player.input.handleKeyUp({ code: 'KeyS' })
      for (let i = 0; i < 100; i++) player.update()
      assert.ok(Math.abs(player.state.bank) < 0.001 && Math.abs(player.state.pitch) < 0.001)
      assert.ok(Math.abs(player.state.speed - player.motionConfig.cruiseSpeed) < 0.01)
      player.dispose()
    }
  }
})

test('pause freezes motion, drops held input and safely reconnects on resume', () => {
  const player = createPlayer()
  player.input.attach()
  player.input.handleKeyDown({ code: 'KeyW' })
  player.input.handleKeyDown({ code: 'ShiftLeft' })
  player.state.velocity.set(4, 0, 0)
  const before = player.state.position.clone()
  player.setPaused(true)
  player.update()
  assert.ok(player.state.position.equals(before))
  assert.equal(player.input.isAttached, false)
  assert.equal(player.input.getKeys().KeyW, false)
  assert.equal(player.input.consume().boost, false)
  player.setPaused(false)
  assert.equal(player.input.isAttached, true)
  assert.equal(player.input.getKeys().KeyW, false)
  assert.equal(player.input.consume().boost, false)
  player.dispose()
})

test('returning home clears motion and trails while preserving an explicit pause', () => {
  const player = createPlayer()
  let cleared = 0
  player.wingAirflow = { clear() { cleared++ }, dispose() {} }
  player.state.position.set(-100, 5.5, 280)
  player.state.velocity.set(4, 0, 2)
  player.state.yaw = 2
  player.state.angularVelocity = 1
  player.setPaused(true)
  player.reset()
  assert.deepEqual(player.state.position.toArray(), [12.8, 5.5, 12.8])
  assert.deepEqual(player.group.position.toArray(), [12.8, 5.5, 12.8])
  assert.equal(player.state.velocity.length(), player.motionConfig.cruiseSpeed)
  assert.equal(player.state.yaw, 0)
  assert.equal(player.state.angularVelocity, 0)
  assert.equal(player.paused, true)
  assert.equal(cleared, 1)
  player.dispose()
})

function cockpitTelemetry(state) {
  const rig = new WorldCamera({ width: 1280, height: 720 })
  rig.followFlight(state, 'cockpit', 0)
  return getCockpitTelemetry(state, 0.2, rig.instance)
}

test('cockpit reads flight speed, boost, world altitude, climb and map heading', () => {
  const state = createAircraftState({ position: [0, 5.5, 0], yaw: -Math.PI, speed: 5 })
  state.velocity.set(-4, 3, 0)
  state.boost = 0.65

  const telemetry = cockpitTelemetry(state)
  assert.equal(telemetry.speedKmh, 90)
  assert.equal(telemetry.thrustPercent, 65)
  assert.equal(telemetry.altitudeM, 27.5)
  assert.equal(telemetry.verticalSpeedMps, 15)
  assert.equal(telemetry.headingDeg, 270)
})

test('cockpit attitude uses the actual view during climbs, banks and inverted flight', () => {
  const state = createAircraftState()
  state.pitch = 0.4
  assert.ok(cockpitTelemetry(state).pitchDeg > 0)
  state.pitch = -0.4
  assert.ok(cockpitTelemetry(state).pitchDeg < 0)

  state.pitch = 0
  state.roll = -0.5
  assert.ok(cockpitTelemetry(state).horizonRollDeg > 0)
  state.roll = 0.5
  assert.ok(cockpitTelemetry(state).horizonRollDeg < 0)
  state.roll = Math.PI
  assert.ok(Math.abs(cockpitTelemetry(state).horizonRollDeg) > 179)
})
