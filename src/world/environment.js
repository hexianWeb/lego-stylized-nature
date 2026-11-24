import * as THREE from 'three/webgpu'
import { createEnvironmentPanel } from '../debug/panels/EnvironmentPanel.js'
import { createLightPanel } from '../debug/panels/LightPanel.js'
import { createShadowPanel } from '../debug/panels/ShadowPanel.js'
import { createAirPerspective } from './atmosphere/airPerspective.js'
import { createHosekWilkieSky } from './atmosphere/hosekWilkieSky.js'

const PLAYER_SHADOW_LIGHT_OFFSET = new THREE.Vector3(
  -14.48,
  20.78,
  -8.48,
)
const PLAYER_SHADOW_TARGET_OFFSET = new THREE.Vector3(
  -1.63,
  -10,
  -1.63,
)
const PLAYER_SHADOW_OFFSET = PLAYER_SHADOW_LIGHT_OFFSET.clone().sub(PLAYER_SHADOW_TARGET_OFFSET)
const PLAYER_SHADOW_DISTANCE = PLAYER_SHADOW_OFFSET.length()
const SUN_AZIMUTH = PLAYER_SHADOW_OFFSET.clone().setY(0).normalize()
const DEFAULT_SUN_ELEVATION = THREE.MathUtils.radToDeg(Math.asin(PLAYER_SHADOW_OFFSET.y / PLAYER_SHADOW_DISTANCE))
const PLAYER_SHADOW_FAR_PADDING = 8
const PLAYER_SHADOW_MIN_CAMERA_DEPTH = PLAYER_SHADOW_DISTANCE + PLAYER_SHADOW_FAR_PADDING
const SOLID_BACKGROUND = '#6aca97'
const DAYLIGHT_COLOR = new THREE.Color(0xFFF7EA)
const LOW_SUN_COLOR = new THREE.Color(0xFFAD77)

export default class Environment {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene, flightAtmosphere = null) {
    this.scene = scene
    this.envMap = null
    this.envMapRenderTarget = null
    this.disposed = false
    this.environmentIntensity = 0.3
    this.useEnvBackground = false
    this.backgroundColor = flightAtmosphere?.sky ?? SOLID_BACKGROUND
    this.atmosphereSettings = flightAtmosphere?.enabled === undefined
      ? null
      : { sunElevation: DEFAULT_SUN_ELEVATION, ...flightAtmosphere }
    this.atmosphereSunOffset = PLAYER_SHADOW_OFFSET.clone()
    this.sky = null
    this.airPerspective = null
    /** 0 = darker shadows, 1 = more ambient/env fill */
    this.shadowFill = 0.32
    this.shadowBounds = {
      halfExtent: 14,
      maxHeight: 10,
    }
    this.shadowEnvelope = null
    this._shadowCenter = new THREE.Vector3()
    this._shadowCorner = new THREE.Vector3()
    this._shadowViewBounds = new THREE.Box3()
    this._shadowLightDirection = new THREE.Vector3()
    this.directionalTarget = { x: 12, y: 12, z: 12 }

    this.ambientLight = new THREE.AmbientLight(0xDCECFF, 0.15)
    this.scene.add(this.ambientLight)

    this.directionalLight = new THREE.DirectionalLight(DAYLIGHT_COLOR, 1.45)
    this.directionalLight.position.set(-8, 23, -10)
    this.directionalLight.castShadow = true
    this.directionalLight.shadow.mapSize.set(1024 * 2, 1024 * 2)
    this.directionalLight.shadow.bias = -0.0011
    this.directionalLight.shadow.normalBias = 0.035
    this.directionalLight.shadow.radius = 2.0
    this.scene.add(this.directionalLight)
    this.scene.add(this.directionalLight.target)

    this.clearColor = new THREE.Color(this.backgroundColor)
    this.applyShadowFill()
    if (this.atmosphereSettings) {
      this.syncAtmosphere()
    }
    else {
      this.syncBackground()
    }
  }

  applyShadowFill() {
    const fill = THREE.MathUtils.clamp(this.shadowFill, 0, 1)
    this.ambientLight.intensity = fill * 0.16 + 0.09
    this.environmentIntensity = fill * 0.38 + 0.175
    this.syncEnvironmentIntensity()
  }

  /**
   * @param {THREE.WebGPURenderer} renderer
   * @param {THREE.Texture | null} equirectTexture
   */
  applyEnvironmentMap(renderer, equirectTexture) {
    if (!equirectTexture) {
      console.warn('[Environment] Missing HDR texture; scene.environment skipped.')
      return
    }

    equirectTexture.mapping = THREE.EquirectangularReflectionMapping

    const pmremGenerator = new THREE.PMREMGenerator(renderer)
    let renderTarget
    try {
      pmremGenerator.compileEquirectangularShader()
      renderTarget = pmremGenerator.fromEquirectangular(equirectTexture)
    }
    finally {
      pmremGenerator.dispose()
    }
    this.envMapRenderTarget?.dispose()
    this.envMapRenderTarget = renderTarget
    this.envMap = renderTarget.texture

    this.scene.environment = this.envMap
    this.syncEnvironmentIntensity()
    this.syncBackground()
  }

  syncEnvironmentIntensity() {
    this.scene.environmentIntensity = this.environmentIntensity
  }

  syncBackground() {
    this.clearColor.set(this.backgroundColor)
    const envBackground = this.useEnvBackground ? this.envMap : null
    const useAtmosphere = this.atmosphereSettings?.enabled && !envBackground
    this.scene.backgroundNode = useAtmosphere ? this.sky.backgroundNode : null
    this.scene.fogNode = this.airPerspective?.fogNode ?? null
    if (this.airPerspective) {
      this.airPerspective.enabled.value = useAtmosphere ? 1 : 0
    }
    this.scene.background = envBackground ?? this.clearColor
  }

  syncAtmosphere() {
    const settings = this.atmosphereSettings
    const elevation = THREE.MathUtils.degToRad(settings.sunElevation)
    const sunDirection = SUN_AZIMUTH.clone().multiplyScalar(Math.cos(elevation)).setY(Math.sin(elevation))
    this.atmosphereSunOffset.copy(sunDirection).multiplyScalar(PLAYER_SHADOW_DISTANCE)

    const skyOptions = {
      sunDirection,
      turbidity: settings.turbidity,
      groundAlbedo: settings.groundAlbedo,
      intensity: settings.skyIntensity,
      sunDiskIntensity: settings.sunDiskIntensity,
    }
    if (this.sky) {
      this.sky.update(skyOptions)
    }
    else {
      this.sky = createHosekWilkieSky(skyOptions)
    }

    if (this.airPerspective) {
      this.airPerspective.color.value.copy(this.sky.horizonColor)
      this.airPerspective.density.value = settings.hazeDensity
      this.airPerspective.heightFalloff.value = settings.hazeHeightFalloff
      this.airPerspective.baseHeight.value = settings.hazeBaseHeight
      this.airPerspective.startDistance.value = settings.hazeStartDistance
      this.airPerspective.fadeStart.value = settings.hazeFadeStart ?? 0
      this.airPerspective.fadeEnd.value = settings.hazeFadeEnd ?? 0
    }
    else {
      this.airPerspective = createAirPerspective({
        color: this.sky.horizonColor,
        density: settings.hazeDensity,
        heightFalloff: settings.hazeHeightFalloff,
        baseHeight: settings.hazeBaseHeight,
        startDistance: settings.hazeStartDistance,
        fadeStart: settings.hazeFadeStart,
        fadeEnd: settings.hazeFadeEnd,
      })
    }

    const warmth = settings.enabled ? 1 - THREE.MathUtils.smoothstep(settings.sunElevation, 2, 30) : 0
    this.directionalLight.color.copy(DAYLIGHT_COLOR).lerp(LOW_SUN_COLOR, warmth)
    this.positionDirectionalLight()
    this.applyShadowBounds()
    this.syncBackground()
  }

  positionDirectionalLight() {
    const { x, y, z } = this.directionalTarget
    const offset = this.atmosphereSettings?.enabled ? this.atmosphereSunOffset : PLAYER_SHADOW_OFFSET
    this.directionalLight.position.set(x, y, z).add(offset)
  }

  /**
   * @param {{ halfExtent: number, maxHeight: number }} bounds
   */
  configureShadows({ halfExtent, maxHeight }) {
    this.shadowEnvelope = null
    this.shadowBounds.halfExtent = halfExtent
    this.shadowBounds.maxHeight = maxHeight
    this.applyShadowBounds()
  }

  /**
   * @param {THREE.Vector3 | { x: number, y: number, z: number }} playerPosition
   * @param {{ halfExtent: number, envelope?: { radius: number, minY: number, maxY: number } }} shadowConfig
   */
  followPlayerShadow(playerPosition, { halfExtent, envelope = null }) {
    this.shadowBounds.halfExtent = halfExtent
    this.shadowEnvelope = envelope && Number.isFinite(envelope.radius) && envelope.radius >= 0
      && Number.isFinite(envelope.minY) && Number.isFinite(envelope.maxY)
      && envelope.minY <= envelope.maxY
      ? envelope
      : null
    this._shadowCenter.copy(playerPosition)
    this.directionalTarget.x = playerPosition.x + PLAYER_SHADOW_TARGET_OFFSET.x
    this.directionalTarget.y = playerPosition.y + PLAYER_SHADOW_TARGET_OFFSET.y
    this.directionalTarget.z = playerPosition.z + PLAYER_SHADOW_TARGET_OFFSET.z

    this.positionDirectionalLight()

    this.shadowBounds.maxHeight = Math.max(
      this.shadowBounds.maxHeight,
      PLAYER_SHADOW_MIN_CAMERA_DEPTH,
    )

    this.applyShadowBounds()
  }

  syncDirectionalTarget() {
    this.directionalLight.target.position.set(
      this.directionalTarget.x,
      this.directionalTarget.y,
      this.directionalTarget.z,
    )
    this.directionalLight.target.updateMatrixWorld()
    this.directionalLight.updateMatrixWorld()
    this.directionalLight.shadow.needsUpdate = true
    this.directionalLight.shadow.updateMatrices(this.directionalLight)
  }

  applyShadowBounds() {
    const { halfExtent, maxHeight } = this.shadowBounds

    this.syncDirectionalTarget()

    const shadowCamera = this.directionalLight.shadow.camera
    if (this.shadowEnvelope) {
      this.fitShadowEnvelope(shadowCamera)
      shadowCamera.updateProjectionMatrix()
      this.directionalLight.shadow.updateMatrices(this.directionalLight)
      return
    }
    shadowCamera.left = -halfExtent
    shadowCamera.right = halfExtent
    shadowCamera.top = halfExtent
    shadowCamera.bottom = -halfExtent
    shadowCamera.near = 0.5
    shadowCamera.far = maxHeight + halfExtent * 2
    shadowCamera.updateProjectionMatrix()

    this.directionalLight.shadow.needsUpdate = true
    this.directionalLight.shadow.updateMatrices(this.directionalLight)
  }

  fitShadowEnvelope(shadowCamera) {
    const { radius, minY, maxY } = this.shadowEnvelope
    const center = this._shadowCenter
    const corner = this._shadowCorner
    const bounds = this._shadowViewBounds
    const measure = () => {
      bounds.makeEmpty()
      for (const x of [-radius, radius]) {
        for (const y of [minY, maxY]) {
          for (const z of [-radius, radius]) {
            corner.set(center.x + x, y, center.z + z)
              .applyMatrix4(shadowCamera.matrixWorldInverse)
            bounds.expandByPoint(corner)
          }
        }
      }
    }
    measure()
    // Tall geometry can sit behind the original light position. Move along
    // its existing direction so the fitted volume has positive depth.
    const nearestDepth = -bounds.max.z
    if (nearestDepth < 1) {
      this._shadowLightDirection.subVectors(
        this.directionalLight.position,
        this.directionalLight.target.position,
      ).normalize()
      this.directionalLight.position.addScaledVector(this._shadowLightDirection, 1 - nearestDepth)
      this.syncDirectionalTarget()
      measure()
    }
    const padding = 0.5
    shadowCamera.left = bounds.min.x - padding
    shadowCamera.right = bounds.max.x + padding
    shadowCamera.bottom = bounds.min.y - padding
    shadowCamera.top = bounds.max.y + padding
    shadowCamera.near = Math.max(0.1, -bounds.max.z - padding)
    shadowCamera.far = Math.max(shadowCamera.near + 1, -bounds.min.z + padding)
  }

  /**
   * @param {import('../debug/Debug.js').default} debug
   */
  debuggerInit(debug) {
    if (!debug.active) {
      return
    }

    createLightPanel(debug, this)
    createShadowPanel(debug, this)
    createEnvironmentPanel(debug, this)
  }

  dispose() {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.scene.environment = null
    this.scene.background = null
    this.scene.backgroundNode = null
    this.scene.fogNode = null
    this.envMapRenderTarget?.dispose()
    this.envMapRenderTarget = null
    this.envMap = null
    this.directionalLight.dispose()
    this.scene.remove(this.ambientLight)
    this.scene.remove(this.directionalLight)
    this.scene.remove(this.directionalLight.target)
  }
}
