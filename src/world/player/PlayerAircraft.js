import * as THREE from 'three/webgpu'
import { FLIGHT_VIEWS } from '../camera.js'
import AircraftInput from './AircraftInput.js'
import { createAircraftState, normalizeAircraftConfig, stepAircraftMotion } from './aircraftMotion.js'
import { computeFlightTurbulence, normalizeVisualAttitudeConfig } from './aircraftVisualAttitude.js'
import { createModelAircraft } from './modelAircraft.js'
import { createSpriteAircraft } from './spriteAircraft.js'
import { createWingAirflowVFX, normalizeWingAirflowConfig } from './wingAirflowVFX.js'

export default class PlayerAircraft {
  constructor(experience, options = {}) {
    this.experience = experience
    this.worldConfig = options.config ?? experience.config ?? {}
    const config = this.worldConfig.player?.aircraft ?? {}
    this.motionConfig = normalizeAircraftConfig(config)
    this.sampleSurface = options.sampleSurface
    this.spawn = options.spawn
    this.cameraFollow = { enabled: config.cameraFollow?.enabled !== false }
    this.initialView = FLIGHT_VIEWS.includes(config.view) ? config.view : 'top'
    this.view = this.initialView
    this.invertY = config.invertY !== false
    this.turbulence = normalizeVisualAttitudeConfig(config.visualAttitude).turbulence
    this.wingAirflow = null
    this.enabled = config.enabled !== false
    this.paused = false
    this.input = new AircraftInput(options.inputTarget === undefined ? globalThis.window : options.inputTarget, experience.canvas)
    this.group = new THREE.Group()
    this.group.name = 'PlayerAircraft'
    this.visualRoot = new THREE.Group()
    this.group.add(this.visualRoot)
    this.visualRoot.scale.setScalar(this.motionConfig.scale)
    if (this.enabled) {
      if (config.appearance === 'sprite') this.airframe = createSpriteAircraft()
      else {
        const name = config.assetName ?? 'playerAircraftModel'
        const scene = experience.resources?.items?.[name]?.scene
        if (scene) this.airframe = createModelAircraft(scene, config.engineFlame)
        else {
          console.warn(`[PlayerAircraft] Missing aircraft asset "${name}"; player disabled.`)
          this.enabled = false
        }
      }
    }
    this.reset()
    if (!this.enabled) return
    this.modelRoot = this.airframe.root
    this.visualRoot.add(this.modelRoot)
    this.wingAirflowConfig = normalizeWingAirflowConfig({
      ...config.wingAirflow,
      anchors: { ...this.airframe.wingAnchors, ...config.wingAirflow?.anchors },
    })
    if (this.wingAirflowConfig.enabled) {
      this.wingAirflow = createWingAirflowVFX(this.modelRoot, this.wingAirflowConfig)
      this.wingAirflowConfig = this.wingAirflow.config
    }
    this.input.attach()
  }

  reset() {
    const { width = 0, depth = 0, cellSize = 1 } = this.worldConfig.terrain ?? {}
    const position = this.spawn?.position ?? [width * cellSize / 2, this.motionConfig.height, depth * cellSize / 2]
    this.state = createAircraftState({ position, yaw: this.spawn?.yaw, speed: this.motionConfig.cruiseSpeed })
    this.view = this.initialView
    this.elapsed = this.turbulencePhase = 0
    this.input.clear()
    this.wingAirflow?.clear()
    this.visualRoot.rotation.set(0, 0, 0)
    this.visualRoot.position.y = 0
    this.snapToSurface()
    this.airframe?.update(0, 0, this.state.speed / this.motionConfig.maxSpeed)
  }

  snapToSurface() {
    const s = this.state
    const surface = this.sampleSurface?.(s.position.x, s.position.z)
    if (Number.isFinite(surface)) {
      s.groundHeight = surface
      s.surfaceKnown = true
      s.position.y = Math.max(s.position.y, surface + this.motionConfig.clearance)
    }
    this._applyTransform()
    this.syncCamera(0)
  }

  _applyTransform() {
    const { position, roll, yaw, pitch } = this.state
    this.group.position.copy(position)
    this.group.rotation.set(roll, -yaw, pitch, 'YZX')
  }

  syncCamera(delta) {
    if (!this.enabled || !this.cameraFollow.enabled) return
    const rig = this.experience.worldCamera
    rig?.followFlight?.(this.state, this.view, delta, this.sampleSurface, (this.airframe?.framing ?? 1) * this.motionConfig.scale)
    this.visualRoot.visible = !rig?.insideCockpit
  }

  update(flightPose) {
    if (!this.enabled || this.paused) return
    const delta = Math.min(0.15, Math.max(0, this.experience.time.getDelta()))
    if (!delta) return
    const input = this.input.consume(this.invertY)
    if (flightPose) {
      const { x, y, z, yaw, speed } = flightPose
      const state = this.state
      state.position.set(x, y, z)
      state.yaw = yaw
      state.speed = speed
      state.velocity.set(Math.cos(yaw) * speed, 0, Math.sin(yaw) * speed)
      const surface = this.sampleSurface?.(x, z)
      state.surfaceKnown = Number.isFinite(surface)
      if (state.surfaceKnown) state.groundHeight = surface
    }
    else {
      if (input.view) this.view = FLIGHT_VIEWS[(FLIGHT_VIEWS.indexOf(this.view) + 1) % FLIGHT_VIEWS.length]
      stepAircraftMotion(this.state, input, this.motionConfig, delta, this.sampleSurface)
    }
    // The alternate finite-map scene has no streaming neighbors. Re-enter at
    // the opposite edge with the same course, without drawing a trail across it.
    if (this.worldConfig.chunks?.enabled === false) {
      const { width, depth, cellSize } = this.worldConfig.terrain
      const p = this.state.position
      const w = width * cellSize, d = depth * cellSize
      if (p.x < 0 || p.x >= w || p.z < 0 || p.z >= d) {
        p.x = THREE.MathUtils.euclideanModulo(p.x, w)
        p.z = THREE.MathUtils.euclideanModulo(p.z, d)
        this.wingAirflow?.clear()
        this.snapToSurface()
      }
    }
    this.elapsed += delta
    this._applyTransform()
    const wobble = computeFlightTurbulence(this.state.speed / this.motionConfig.maxSpeed, this.turbulencePhase, this.turbulence, delta)
    this.turbulencePhase = wobble.nextPhase
    this.visualRoot.rotation.set(wobble.roll, wobble.yaw, wobble.pitch)
    this.visualRoot.position.y = wobble.vertical
    this.airframe?.update(this.state.boost, this.elapsed, this.state.speed / this.motionConfig.maxSpeed)
    this.syncCamera(delta)
    this.wingAirflow?.update({
      delta, elapsed: this.elapsed, camera: this.experience.worldCamera?.instance,
      state: this.state, maxSpeed: this.motionConfig.maxSpeed, input: { thrustInput: this.state.boost },
    })
  }

  setPaused(paused) {
    this.paused = Boolean(paused)
    this.input.clear()
    if (this.paused) this.input.dispose()
    else if (this.enabled) this.input.attach()
  }

  debuggerInit(debug) {
    const folder = debug.addFolder({ title: 'Player Aircraft', expanded: false })
    if (!folder || !this.enabled) return
    folder.addBinding(this, 'invertY', { label: 'Pull back to climb' })
    folder.addBinding(this.motionConfig, 'cruiseSpeed', { min: 2, max: this.motionConfig.maxSpeed, step: 0.1 })
    folder.addBinding(this.motionConfig, 'turnRate', { min: 0.5, max: 3, step: 0.05 })
    folder.addBinding(this.motionConfig, 'bankMax', { min: 0.2, max: 1.2, step: 0.05 })
    folder.addBinding(this.turbulence, 'enabled', { label: 'Turbulence' })
    if (!this.wingAirflow) return
    const flow = folder.addFolder({ title: 'Wing Airflow', expanded: false })
    const c = this.wingAirflowConfig
    flow.addBinding(c, 'enabled').on('change', ({ value }) => this.wingAirflow.setVisible(value))
    for (const key of ['outwardOffset', 'backOffset', 'upOffset'])
      flow.addBinding(c.anchors, key, { step: 0.01 }).on('change', () => this.wingAirflow.clear())
    for (const key of ['sampleLife', 'emitInterval', 'minEmitDistance', 'breakAngleDeg', 'width', 'opacity', 'speedOpacity', 'accelerationBoost', 'color', 'additive', 'showAnchors'])
      flow.addBinding(c, key)
    flow.addBinding(c, 'maxSamples', { min: 2, max: c.capacity, step: 1 }).on('change', () => this.wingAirflow.clampSamples())
  }

  dispose() {
    this.input.dispose()
    this.wingAirflow?.dispose()
    this.wingAirflow = null
    this.airframe?.dispose()
    this.airframe = this.modelRoot = null
    this.group.clear()
    this.enabled = false
  }
}
