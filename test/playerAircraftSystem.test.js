import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import WorldCamera from '../src/world/camera.js'
import PlayerAircraft from '../src/world/player/PlayerAircraft.js'

function createAsset() {
  const scene = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.17, 0.57), new THREE.MeshStandardMaterial())
  body.name = 'aircraft'
  scene.add(body)
  for (const name of ['left_engine', 'right_engine']) {
    const socket = new THREE.Object3D()
    socket.name = name
    body.add(socket)
  }
  return { scene }
}

function createPlayer(options = {}, sampleSurface = () => 0, asset = createAsset()) {
  const experience = {
    resources: { items: { playerAircraftModel: asset } },
    worldCamera: new WorldCamera({ width: 960, height: 580 }),
    time: { getDelta: () => 1 / 60 },
  }
  return new PlayerAircraft(experience, {
    inputTarget: new EventTarget(), sampleSurface,
    config: { terrain: { width: 100, depth: 80, cellSize: 0.2 }, player: { aircraft: options } },
  })
}

test('the original airframe spawns above the local surface and follows the simulated position and pose', () => {
  const p = createPlayer({}, () => 6)
  assert.deepEqual(p.state.position.toArray(), [10, 6 + p.motionConfig.clearance, 8])
  assert.ok(p.enabled && p.modelRoot.getObjectByProperty('isMesh', true))
  p.input.handleKeyDown({ code: 'KeyS' })
  for (let i = 0; i < 30; i++) p.update()
  assert.ok(p.state.velocity.y > 0 && p.state.position.y > 7)
  assert.ok(p.group.position.equals(p.state.position))
  const nose = new THREE.Vector3(1, 0, 0).applyQuaternion(p.group.quaternion)
  assert.ok(Math.abs(nose.y - Math.sin(p.state.pitch)) < 1e-8)
  assert.ok(Math.abs(p.state.velocity.clone().normalize().y - Math.sin(p.state.pathPitch)) < 1e-8)
  p.dispose()
})

test('banking lifts the model nose while the course stays level', () => {
  const p = createPlayer()
  const height = p.state.position.y
  p.input.handleKeyDown({ code: 'KeyD' })
  for (let i = 0; i < 60; i++) p.update()

  const nose = new THREE.Vector3(1, 0, 0).applyQuaternion(p.group.quaternion)
  assert.ok(p.state.bank > 0.5 && nose.y > 0.025)
  assert.ok(Math.abs(p.state.position.y - height) < 1e-8)
  assert.equal(p.state.velocity.y, 0)
  p.dispose()
})

test('the model and cockpit camera share the right axis in a banking climb', () => {
  const p = createPlayer()
  p.input.handleKeyDown({ code: 'KeyD' })
  p.input.handleKeyDown({ code: 'KeyS' })
  for (let i = 0; i < 50; i++) p.update()
  assert.ok(p.state.bank > 0.5 && p.state.pitch > 0.2)

  p.view = 'cockpit'
  p.syncCamera(0)
  const modelRight = new THREE.Vector3(0, 0, 1).applyQuaternion(p.group.quaternion)
  const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(p.experience.worldCamera.instance.quaternion)
  assert.ok(cameraRight.distanceTo(modelRight) < 1e-8)
  p.dispose()
})

test('changing views mid-loop preserves the track and uses the renderer camera throughout', () => {
  const p = createPlayer({ wingAirflow: { enabled: false } })
  const comparison = createPlayer({ wingAirflow: { enabled: false } })
  const rig = p.experience.worldCamera, camera = rig.instance
  const offsets = []
  for (const jet of [p, comparison]) jet.input.request('backLoop')
  for (const view of ['top', 'chase', 'cockpit', 'top']) {
    if (view !== p.view) p.input.request('view')
    for (let i = 0; i < 46; i++) {
      p.update()
      comparison.update()
      assert.ok(p.state.position.distanceTo(comparison.state.position) < 1e-8)
      assert.equal(p.state.pathPitch, comparison.state.pathPitch)
      assert.equal(p.state.pitch, comparison.state.pitch)
    }
    assert.equal(rig.instance, camera)
    assert.equal(rig.flightView, view)
    assert.equal(p.visualRoot.visible, view !== 'cockpit')
    offsets.push(camera.position.distanceTo(p.state.position))
  }
  assert.ok(offsets[0] > offsets[1] && offsets[1] > offsets[2] && offsets[2] < 1)
  p.dispose()
  comparison.dispose()
})

test('disabled follow leaves the camera in place and disabling the player does not attach input', () => {
  const p = createPlayer({ cameraFollow: { enabled: false } })
  const camera = p.experience.worldCamera.instance
  const before = camera.position.clone()
  p.update()
  assert.ok(camera.position.equals(before))
  p.dispose()
  const off = createPlayer({ enabled: false })
  assert.equal(off.input.isAttached, false)
  assert.equal(off.airframe, undefined)
  off.dispose()
})

test('the finite-map flight crosses an edge without leaving terrain or drawing a connecting ribbon', () => {
  const p = createPlayer()
  p.worldConfig.chunks = { enabled: false }
  p.state.position.x = 19.99
  for (let i = 0; i < 4; i++) p.update()
  assert.ok(p.state.position.x > 0 && p.state.position.x < 1)
  assert.equal(p.state.yaw, 0)
  assert.equal(p.state.speed, p.motionConfig.cruiseSpeed)
  for (const wing of [p.wingAirflow.left, p.wingAirflow.right]) {
    for (let i = 0; i < wing.count; i++)
      assert.ok(Math.abs(wing.getPosition(wing.logicalIndex(i), new THREE.Vector3()).x) < 2)
  }
  p.dispose()
})

test('a paused stunt and its trail resume from the same pose; reset clears the trail', () => {
  const p = createPlayer()
  p.input.request('roll')
  for (let i = 0; i < 15; i++) p.update()
  assert.ok(p.wingAirflow.left.count > 0)
  const progress = p.state.stunt.elapsed
  p.setPaused(true)
  p.update()
  assert.equal(p.state.stunt.elapsed, progress)
  assert.equal(p.input.isAttached, false)
  p.setPaused(false)
  p.update()
  assert.ok(p.state.stunt.elapsed > progress)
  p.reset()
  assert.equal(p.wingAirflow.left.count, 0)
  assert.equal(p.state.stunt, null)
  p.dispose()
})

test('the original plane uses the GLB paint and engine sockets without taking ownership of the asset', () => {
  const asset = createAsset()
  const p = createPlayer({}, () => 0, asset)
  const source = asset.scene.getObjectByName('aircraft')
  const body = p.modelRoot.getObjectByName('aircraft')
  assert.notEqual(source, body)
  assert.equal(source.geometry, body.geometry)
  assert.equal(source.material, body.material)
  assert.equal(p.modelRoot.rotation.y, Math.PI / 2)
  assert.ok(body.castShadow && body.receiveShadow)
  let released = 0
  for (const name of ['left_engine', 'right_engine']) {
    const flame = body.getObjectByName(name).getObjectByName('EngineFlameVFX')
    assert.ok(flame)
    assert.equal(source.getObjectByName(name).children.length, 0)
    flame.getObjectByProperty('isMesh', true).material.addEventListener('dispose', () => released++)
  }
  source.geometry.addEventListener('dispose', () => assert.fail('resource-owned geometry disposed'))
  source.material.addEventListener('dispose', () => assert.fail('resource-owned paint disposed'))
  p.dispose()
  p.dispose()
  assert.equal(released, 2)
})

test('retiring the sprite variant releases its own pixels, geometry, materials and listeners exactly once', () => {
  const p = createPlayer({ appearance: 'sprite' })
  const [body, plume] = p.modelRoot.children
  const owners = [body.geometry, body.material, body.material.map, plume.geometry, plume.material]
  const disposals = owners.map(() => 0)
  owners.forEach((owner, i) => owner.addEventListener('dispose', () => disposals[i]++))
  p.dispose()
  p.dispose()
  assert.deepEqual(disposals, owners.map(() => 1))
  assert.equal(p.wingAirflow, null)
  assert.equal(p.input.isAttached, false)
  assert.equal(p.group.children.length, 0)
})
