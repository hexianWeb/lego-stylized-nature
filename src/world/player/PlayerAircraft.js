import * as THREE from 'three/webgpu'

import AircraftInput from './AircraftInput.js'

import {

  createAircraftState,

  normalizeAircraftConfig,

  resolveAircraftInput,

  stepAircraftMotion

} from './aircraftMotion.js'

import {

  computeSpeedRatio,

  createVisualAttitudeState,

  normalizeVisualAttitudeConfig,

  stepVisualAttitude

} from './aircraftVisualAttitude.js'

import {

  applyFlameResponseScale,

  createEngineFlameVFX,

  normalizeEngineFlameConfig,

  resolveFlameResponseScale

} from './engineFlameVFX.js'

import {

  createWingAirflowVFX,

  normalizeWingAirflowConfig

} from './wingAirflowVFX.js'



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

    this.flameConfig = normalizeEngineFlameConfig(playerConfig.engineFlame)

    this.wingAirflowConfig = normalizeWingAirflowConfig(playerConfig.wingAirflow)

    this.wingAirflow = null

    this.attitudeState = createVisualAttitudeState()

    this.speedLineOpacity = 0

    this.visualRoot = null
    this.modelRoot = null

    this.engineNodes = { left: null, right: null }

    this.engineFlames = { left: null, right: null }

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
    this.modelRoot = model



    this.visualRoot = new THREE.Group()

    this.visualRoot.name = 'AircraftVisualRoot'

    this.visualRoot.add(model)

    this.group.add(this.visualRoot)

    this.group.scale.setScalar(this.motionConfig.scale)



    this._resolveEngineNodes(model)
    this._attachEngineFlames()
    this._attachWingAirflow()
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
    this.visualRoot.rotation.set(this.attitudeState.roll, this.attitudeState.yawWobble, this.attitudeState.pitch)

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



  _attachEngineFlames() {

    if (!this.flameConfig.enabled) {

      return

    }



    const attach = (node, key) => {

      if (!node) {

        return

      }

      this.engineFlames[key] = createEngineFlameVFX(node, this.flameConfig)

    }



    attach(this.engineNodes.left, 'left')

    attach(this.engineNodes.right, 'right')

  }

  _attachWingAirflow() {

    if (!this.wingAirflowConfig.enabled) {

      return

    }



    this.wingAirflow = createWingAirflowVFX(this.modelRoot ?? this.group, this.wingAirflowConfig)
    this.wingAirflowConfig = this.wingAirflow.config

  }



  _resolveFlameValues(thrusterIntensity) {

    const speedRatio = computeSpeedRatio(this.state, this.motionConfig.maxSpeed)

    const scale = resolveFlameResponseScale(this.flameConfig, speedRatio, thrusterIntensity)

    return applyFlameResponseScale(this.flameConfig, scale)

  }



  _updateEngineFlames(elapsed) {

    if (!this.flameConfig.enabled) {

      return

    }



    if (this.engineFlames.left) {

      this.engineFlames.left.update(

        elapsed,

        this._resolveFlameValues(this.attitudeState.leftThruster)

      )

    }



    if (this.engineFlames.right) {

      this.engineFlames.right.update(

        elapsed,

        this._resolveFlameValues(this.attitudeState.rightThruster)

      )

    }

  }

  _updateWingAirflow(input, delta) {

    if (!this.wingAirflow) {

      return

    }



    this.wingAirflow.update({

      delta,

      elapsed: this.experience.time.getElapsed(),

      camera: this.experience.worldCamera?.instance,

      state: this.state,

      maxSpeed: this.motionConfig.maxSpeed,

      input

    })

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

    this._updateWingAirflow(input, delta)

    this._updateEngineFlames(this.experience.time.getElapsed())

    this._updateSpeedLines(input, delta)



    if (this.cameraFollow.enabled) {

      this.experience.worldCamera.followTarget(

        this.state.position,

        delta,

        this.cameraFollow.smoothing

      )

    }

  }



  _updateSpeedLines(input, delta) {

    const speedRatio = computeSpeedRatio(this.state, this.motionConfig.maxSpeed)

    const isThrusting = input.thrustInput > 0

    const targetOpacity = THREE.MathUtils.clamp(

      speedRatio * (isThrusting ? 0.85 : 0),

      0,

      0.85

    )

    this.speedLineOpacity = THREE.MathUtils.damp(

      this.speedLineOpacity,

      targetOpacity,

      10,

      delta

    )

    this.experience.renderer.setSpeedLineOpacity(this.speedLineOpacity)

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

    const turbulenceFolder = attitudeFolder.addFolder({ title: 'Flight Turbulence', expanded: false })
    turbulenceFolder.addBinding(this.visualConfig.turbulence, 'enabled', { label: 'Enabled' })
    turbulenceFolder.addBinding(this.visualConfig.turbulence, 'frequency', { min: 0.2, max: 4, step: 0.05, label: 'Frequency' })
    turbulenceFolder.addBinding(this.visualConfig.turbulence, 'pitchAmplitude', { min: 0, max: 0.08, step: 0.001, label: 'Pitch' })
    turbulenceFolder.addBinding(this.visualConfig.turbulence, 'rollAmplitude', { min: 0, max: 0.08, step: 0.001, label: 'Roll' })
    turbulenceFolder.addBinding(this.visualConfig.turbulence, 'yawAmplitude', { min: 0, max: 0.05, step: 0.001, label: 'Yaw' })
    turbulenceFolder.addBinding(this.visualConfig.turbulence, 'verticalAmplitude', { min: 0, max: 0.08, step: 0.001, label: 'Vertical' })



    const flameFolder = folder.addFolder({ title: 'Engine Flame', expanded: false })

    flameFolder.addBinding(this.flameConfig, 'enabled', { label: 'Enabled' })

      .on('change', ({ value }) => {

        for (const flame of Object.values(this.engineFlames)) {

          flame?.setVisible(value)

        }

      })

    flameFolder.addBinding(this.flameConfig, 'intensity', { min: 0.2, max: 2.2, step: 0.01, label: 'Intensity' })

    flameFolder.addBinding(this.flameConfig, 'length', { min: 0.08, max: 0.8, step: 0.01, label: 'Length' })

    flameFolder.addBinding(this.flameConfig, 'radius', { min: 0.01, max: 0.12, step: 0.001, label: 'Radius' })

    flameFolder.addBinding(this.flameConfig, 'speed', { min: 0.2, max: 2.4, step: 0.01, label: 'Speed' })

    flameFolder.addBinding(this.flameConfig, 'respondToSpeed', { label: 'Speed React' })

    flameFolder.addBinding(this.flameConfig, 'respondToThrusters', { label: 'Thrust React' })

    flameFolder.addBinding(this.flameConfig, 'minIntensity', { min: 0, max: 1, step: 0.01, label: 'Min Scale' })

    const airflowFolder = folder.addFolder({ title: 'Wing Airflow', expanded: false })
    const clearWingAirflow = () => {
      this.wingAirflow?.clear()
    }

    airflowFolder.addBinding(this.wingAirflowConfig, 'enabled', { label: 'Enabled' })
      .on('change', ({ value }) => {
        this.wingAirflow?.setVisible(value)
      })
    airflowFolder.addBinding(this.wingAirflowConfig.anchors, 'outwardOffset', { min: 0, max: 0.8, step: 0.01, label: 'Outward' })
      .on('change', clearWingAirflow)
    airflowFolder.addBinding(this.wingAirflowConfig.anchors, 'backOffset', { min: -0.4, max: 0.2, step: 0.01, label: 'Back' })
      .on('change', clearWingAirflow)
    airflowFolder.addBinding(this.wingAirflowConfig.anchors, 'upOffset', { min: -0.1, max: 0.4, step: 0.01, label: 'Up' })
      .on('change', clearWingAirflow)
    airflowFolder.addBinding(this.wingAirflowConfig, 'sampleLife', { min: 0.16, max: 1.4, step: 0.02, label: 'Life' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'emitInterval', { min: 0.012, max: 0.12, step: 0.002, label: 'Interval' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'minEmitDistance', { min: 0, max: 0.18, step: 0.005, label: 'Min Dist' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'maxSamples', { min: 4, max: this.wingAirflowConfig.capacity, step: 1, label: 'Samples' })
      .on('change', () => {
        this.wingAirflow?.clampSamples()
      })
    airflowFolder.addBinding(this.wingAirflowConfig, 'breakAngleDeg', { min: 20, max: 180, step: 1, label: 'Break Angle' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'width', { min: 0.03, max: 0.28, step: 0.005, label: 'Width' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'opacity', { min: 0.02, max: 1, step: 0.01, label: 'Opacity' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'speedOpacity', { min: 0, max: 1, step: 0.01, label: 'Speed Opacity' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'accelerationBoost', { min: 0, max: 1, step: 0.01, label: 'Accel Boost' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'color', { label: 'Color' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'additive', { label: 'Additive' })
    airflowFolder.addBinding(this.wingAirflowConfig, 'showAnchors', { label: 'Show Anchors' })

  }



  dispose() {

    this.input.dispose()

    for (const flame of Object.values(this.engineFlames)) {

      flame?.dispose()

    }

    this.engineFlames = { left: null, right: null }

    this.wingAirflow?.dispose()

    this.wingAirflow = null
    this.modelRoot = null

    this.group.clear()

    this.enabled = false

  }

}


