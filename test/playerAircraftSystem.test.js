import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import PlayerAircraft from '../src/world/player/PlayerAircraft.js'

function createExperience({ asset = createAsset(), config = {} } = {}) {
  let followCall = null
  let speedLineOpacity = 0
  return {
    resources: {
      items: {
        playerAircraftModel: asset
      }
    },
    renderer: {
      setSpeedLineOpacity(value) {
        speedLineOpacity = value
      },
      get speedLineOpacity() {
        return speedLineOpacity
      }
    },
    time: {
      _elapsed: 0,
      getDelta() {
        return 0.1
      },
      getElapsed() {
        return this._elapsed
      }
    },
    worldCamera: {
      followTarget(target, delta, smoothing) {
        followCall = { target: target.clone(), delta, smoothing }
      },
      get followCall() {
        return followCall
      }
    },
    config: {
      player: {
        aircraft: {
          enabled: true,
          assetName: 'playerAircraftModel',
          height: 3,
          scale: 2,
          thrust: 10,
          reverseThrust: 5,
          turnTorque: 4,
          linearDrag: 0,
          angularDrag: 0,
          maxSpeed: 100,
          maxAngularSpeed: 100,
          cameraFollow: {
            enabled: true,
            smoothing: 6
          },
          wingAirflow: {
            enabled: false
          },
          ...config
        }
      }
    }
  }
}

function createAsset() {
  const scene = new THREE.Group()
  scene.name = 'aircraftRoot'
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
  body.name = 'aircraft'
  scene.add(body)
  return { scene }
}

function createDebugFolder(title = 'root') {
  return {
    title,
    folders: [],
    bindings: [],
    addFolder(options) {
      const folder = createDebugFolder(options.title)
      folder.options = options
      this.folders.push(folder)
      return folder
    },
    addBinding(target, key, options) {
      const binding = {
        target,
        key,
        options,
        handlers: new Map(),
        on(event, handler) {
          this.handlers.set(event, handler)
          return this
        }
      }
      this.bindings.push(binding)
      return binding
    }
  }
}

test('clones the configured aircraft asset into its group', () => {
  const experience = createExperience()
  const player = new PlayerAircraft(experience)

  assert.equal(player.enabled, true)
  assert.equal(player.group.children.length, 1)
  assert.notEqual(player.group.children[0], experience.resources.items.playerAircraftModel.scene)
  assert.equal(player.group.scale.x, 2)
  assert.equal(player.group.position.y, 3)

  const body = player.group.children[0].children[0].children[0]
  assert.equal(body.castShadow, true)
  assert.equal(body.receiveShadow, true)
})

test('missing asset disables player and warns once', () => {
  const warnings = []
  const originalWarn = console.warn
  console.warn = (message) => warnings.push(message)

  try {
    const player = new PlayerAircraft(createExperience({ asset: null }))
    player.update()
    player.update()

    assert.equal(player.enabled, false)
    assert.equal(player.group.children.length, 0)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /Missing aircraft asset/)
  } finally {
    console.warn = originalWarn
  }
})

test('update applies thrust motion and camera follow', () => {
  const experience = createExperience()
  const player = new PlayerAircraft(experience, { inputTarget: null })

  player.input.handleKeyDown({ code: 'KeyW', repeat: false })
  player.update()

  assert.equal(player.group.position.x > 0, true)
  assert.equal(player.group.position.y, 3)
  assert.equal(experience.worldCamera.followCall.target.x, player.group.position.x)
  assert.equal(experience.worldCamera.followCall.delta, 0.1)
  assert.equal(experience.worldCamera.followCall.smoothing, 6)
})

test('camera follow can be disabled', () => {
  const experience = createExperience({
    config: {
      cameraFollow: {
        enabled: false,
        smoothing: 6
      }
    }
  })
  const player = new PlayerAircraft(experience, { inputTarget: null })

  player.update()

  assert.equal(experience.worldCamera.followCall, null)
})

test('creates and disposes wing airflow when configured', () => {
  const player = new PlayerAircraft(createExperience({
    config: {
      wingAirflow: {
        enabled: true,
        capacity: 4,
        maxSamples: 4
      }
    }
  }), { inputTarget: null })

  assert.equal(player.wingAirflow?.root?.name, 'WingAirflowVFX')
  assert.equal(player.wingAirflow.root.parent, player.modelRoot)
  assert.equal(player.modelRoot.parent, player.visualRoot)
  assert.equal(player.modelRoot.rotation.y, Math.PI / 2)

  player.dispose()

  assert.equal(player.wingAirflow, null)
})

test('debugger exposes wing airflow tuning bindings', () => {
  const player = new PlayerAircraft(createExperience({
    config: {
      wingAirflow: {
        enabled: true,
        capacity: 6,
        maxSamples: 4
      }
    }
  }), { inputTarget: null })
  const debug = createDebugFolder()

  player.debuggerInit(debug)

  const playerFolder = debug.folders.find((folder) => folder.title === 'Player Aircraft')
  const airflowFolder = playerFolder.folders.find((folder) => folder.title === 'Wing Airflow')
  const bindingKeys = airflowFolder.bindings.map((binding) => binding.key)

  assert.equal(airflowFolder.options.expanded, false)
  assert.deepEqual(bindingKeys, [
    'enabled',
    'outwardOffset',
    'backOffset',
    'upOffset',
    'sampleLife',
    'emitInterval',
    'minEmitDistance',
    'maxSamples',
    'breakAngleDeg',
    'width',
    'opacity',
    'speedOpacity',
    'accelerationBoost',
    'color',
    'additive',
    'showAnchors'
  ])
  assert.equal(
    airflowFolder.bindings.find((binding) => binding.key === 'maxSamples').options.max,
    player.wingAirflowConfig.capacity
  )

  airflowFolder.bindings[0].handlers.get('change')({ value: false })
  assert.equal(player.wingAirflow.root.visible, false)

  airflowFolder.bindings[0].handlers.get('change')({ value: true })
  assert.equal(player.wingAirflow.root.visible, true)

  player.wingAirflow.left.count = 6
  player.wingAirflow.right.count = 6
  player.wingAirflowConfig.maxSamples = 2
  airflowFolder.bindings.find((binding) => binding.key === 'maxSamples')
    .handlers.get('change')({ value: 2 })
  assert.equal(player.wingAirflow.left.count, 2)
  assert.equal(player.wingAirflow.right.count, 2)

  player.wingAirflow.left.count = 2
  airflowFolder.bindings.find((binding) => binding.key === 'outwardOffset')
    .handlers.get('change')({ value: 0.24 })
  assert.equal(player.wingAirflow.left.count, 0)
})

test('dispose removes input listeners and scene children', () => {
  const target = {
    listeners: new Map(),
    addEventListener(type, listener) {
      this.listeners.set(type, listener)
    },
    removeEventListener(type, listener) {
      if (this.listeners.get(type) === listener) {
        this.listeners.delete(type)
      }
    }
  }
  const player = new PlayerAircraft(createExperience(), { inputTarget: target })

  assert.equal(target.listeners.size, 3)

  player.dispose()

  assert.equal(target.listeners.size, 0)
  assert.equal(player.group.children.length, 0)
})
