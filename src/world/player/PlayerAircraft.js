import * as THREE from 'three/webgpu'

import AircraftInput from './AircraftInput.js'

import {

  createAircraftState,

  normalizeAircraftConfig,

  resolveAircraftInput,

  stepAircraftMotion

} from './aircraftMotion.js'

import {

  createVisualAttitudeState,

  normalizeVisualAttitudeConfig,

  stepVisualAttitude

} from './aircraftVisualAttitude.js'



function resolveInitialPosition(config) {

  const terrain = config.terrain ?? {}

  const width = Number.isFinite(terrain.width) ? terrain.width : 0

  const depth = Number.isFinite(terrain.depth) ? terrain.depth : 0

  const cellSize = Number.isFinite(terrain.cellSize) ? terrain.cellSize : 1

  return [width * cellSize * 0.5, 0, depth * cellSize * 0.5]

}



export default class PlayerAircraft {

  constructor(experience, options = {}) {

    this.experience = experience

    this.group = new THREE.Group()

    this.group.name = 'PlayerAircraft'

    this.enabled = false

    this._missingAssetWarned = false



    this.worldConfig = options.config ?? experience.config ?? {}

    const playerConfig = this.worldConfig.player?.aircraft ?? {}

    this.rawConfig = playerConfig

    this.motionConfig = normalizeAircraftConfig(playerConfig)

    this.visualConfig = normalizeVisualAttitudeConfig(playerConfig.visualAttitude)

    this.attitudeState = createVisualAttitudeState()

    this.visualRoot = null

    this.engineNodes = { left: null, right: null }

    this._engineBaseEmissive = new WeakMap()

    this.cameraFollow = {

      enabled: playerConfig.cameraFollow?.enabled === true,

      smoothing: Number.isFinite(playerConfig.cameraFollow?.smoothing)

        ? playerConfig.cameraFollow.smoothing

        : 8

    }

    this.input = new AircraftInput(options.inputTarget ?? globalThis.window ?? null)

    const initialPosition = resolveInitialPosition(this.worldConfig)

    this.state = createAircraftState({

      position: [initialPosition[0], this.motionConfig.height, initialPosition[2]]

    })



    if (playerConfig.enabled === false) {

      return

    }



    this._buildModel()

    if (this.enabled) {

      this.input.attach()

      this._applyTransform()

    }

  }



  _buildModel() {

    const assetName = this.rawConfig.assetName || 'playerAircraftModel'

    const asset = this.experience.resources?.items?.[assetName]

    const sourceScene = asset?.scene



    if (!sourceScene) {

      if (!this._missingAssetWarned) {

        console.warn(`[PlayerAircraft] Missing aircraft asset "${assetName}"; player disabled.`)

        this._missingAssetWarned = true

      }

      this.enabled = false

      return

    }



    const model = sourceScene.clone(true)

    model.rotation.y = Math.PI / 2



    this.visualRoot = new THREE.Group()

    this.visualRoot.name = 'AircraftVisualRoot'

    this.visualRoot.add(model)

    this.group.add(this.visualRoot)

    this.group.scale.setScalar(this.motionConfig.scale)



    this._resolveEngineNodes(model)
    this._enableModelShadows(model)

    this.enabled = true
  }

  _enableModelShadows(root) {
    root.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true
        node.receiveShadow = true
      }
    })
  }

  _resolveEngineNodes(root) {

    const leftName = this.visualConfig.thrusters.leftNodeName

    const rightName = this.visualConfig.thrusters.rightNodeName



    root.traverse((node) => {

      if (node.name === leftName) {

        this.engineNodes.left = node

      }

      if (node.name === rightName) {

        this.engineNodes.right = node

      }

    })



    for (const node of [this.engineNodes.left, this.engineNodes.right]) {

      const material = node?.material

      if (!material?.emissive) {

        continue

      }

      this._engineBaseEmissive.set(material, material.emissive.clone())

    }

  }



  _applyTransform() {

    this.group.position.copy(this.state.position)

    this.group.rotation.set(0, -this.state.yaw, 0)



    if (!this.visualRoot) {

      return

    }



    // Aircraft forward is +X after model.rotation.y = PI/2, so pitch = Z and roll = X.
    this.visualRoot.rotation.set(this.attitudeState.roll, 0, this.attitudeState.pitch)

    this.visualRoot.position.y = this.attitudeState.hoverOffset

  }



  _applyThrusterVisuals() {

    if (!this.visualConfig.thrusters.enabled) {

      return

    }



    this._setEngineIntensity(this.engineNodes.left, this.attitudeState.leftThruster)

    this._setEngineIntensity(this.engineNodes.right, this.attitudeState.rightThruster)

  }



  _setEngineIntensity(node, intensity) {

    const material = node?.material

    const base = this._engineBaseEmissive.get(material)

    if (!material || !base) {

      return

    }



    material.emissive.copy(base).multiplyScalar(intensity)

    material.emissiveIntensity = intensity

    material.needsUpdate = true

  }



  update() {

    if (!this.enabled) {

      return

    }



    const delta = this.experience.time.getDelta()

    const input = resolveAircraftInput(this.input.getKeys())

    stepAircraftMotion(this.state, input, this.motionConfig, delta)

    stepVisualAttitude(

      this.state,

      this.attitudeState,

      input,

      this.motionConfig,

      this.visualConfig,

      delta

    )

    this._applyThrusterVisuals()

    this._applyTransform()



    if (this.cameraFollow.enabled) {

      this.experience.worldCamera.followTarget(

        this.state.position,

        delta,

        this.cameraFollow.smoothing

      )

    }

  }



  debuggerInit(debug) {

    const folder = debug.addFolder({ title: 'Player Aircraft', expanded: false })

    if (!folder) {

      return

    }

    folder.addBinding(this.motionConfig, 'thrust', { min: 0, max: 40, step: 0.5, label: 'Thrust' })

    folder.addBinding(this.motionConfig, 'turnTorque', { min: 0, max: 20, step: 0.1, label: 'Turn' })

    folder.addBinding(this.motionConfig, 'linearDrag', { min: 0, max: 10, step: 0.1, label: 'Drag' })

    folder.addBinding(this.motionConfig, 'maxSpeed', { min: 1, max: 30, step: 0.5, label: 'Max Speed' })



    const attitudeFolder = folder.addFolder({ title: 'Visual Attitude', expanded: false })

    attitudeFolder.addBinding(this.visualConfig, 'pitchMax', { min: 0, max: 0.5, step: 0.01, label: 'Pitch Max' })

    attitudeFolder.addBinding(this.visualConfig, 'rollMax', { min: 0, max: 0.8, step: 0.01, label: 'Roll Max' })

    attitudeFolder.addBinding(this.visualConfig, 'pitchSmoothing', { min: 1, max: 30, step: 0.5, label: 'Pitch Smooth' })

    attitudeFolder.addBinding(this.visualConfig, 'rollSmoothing', { min: 1, max: 30, step: 0.5, label: 'Roll Smooth' })

    attitudeFolder.addBinding(this.visualConfig.hover, 'amplitude', { min: 0, max: 0.2, step: 0.005, label: 'Hover Amp' })

    attitudeFolder.addBinding(this.visualConfig.hover, 'frequency', { min: 0.2, max: 4, step: 0.1, label: 'Hover Hz' })

  }



  dispose() {

    this.input.dispose()

    this.group.clear()

    this.enabled = false

  }

}


