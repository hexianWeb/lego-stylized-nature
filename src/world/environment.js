import * as THREE from 'three/webgpu'
import { color, fog, rangeFogFactor, uniform } from 'three/tsl'
import { createEnvironmentPanel } from '../debug/panels/EnvironmentPanel.js'
import { createFogPanel } from '../debug/panels/FogPanel.js'
import { createLightPanel } from '../debug/panels/LightPanel.js'
import { createShadowPanel } from '../debug/panels/ShadowPanel.js'

const PLAYER_SHADOW_LIGHT_OFFSET = new THREE.Vector3(
    14.48,
    20.78,
    8.48
)
const PLAYER_SHADOW_TARGET_OFFSET = new THREE.Vector3(
    -1.63,
    -10,
    -1.63
)
const PLAYER_SHADOW_FAR_PADDING = 8
const PLAYER_SHADOW_MIN_CAMERA_DEPTH =
    PLAYER_SHADOW_LIGHT_OFFSET.distanceTo(PLAYER_SHADOW_TARGET_OFFSET) + PLAYER_SHADOW_FAR_PADDING

export default class Environment {
    /**
     * @param {THREE.Scene} scene
     */
    constructor(scene) {
        this.scene = scene
        this.envMap = null
        this.environmentIntensity = 0.22
        this.useEnvBackground = true
        /** 0 = darker shadows, 1 = more ambient/env fill */
        this.shadowFill = 0.25
        this.shadowBounds = {
            halfExtent: 14,
            maxHeight: 10
        }
        this.directionalTarget = { x: 12, y: 12, z: 12}
        this.autoTargetToTerrain = true

        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.08)
        this.scene.add(this.ambientLight)

        this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.85)
        this.directionalLight.position.set(8, 23, 10)
        this.directionalLight.castShadow = true
        this.directionalLight.shadow.mapSize.set(1024, 1024)
        this.directionalLight.shadow.bias = -0.0002
        this.directionalLight.shadow.normalBias = 0.015
        this.directionalLight.shadow.radius = 0
        this.scene.add(this.directionalLight)
        this.scene.add(this.directionalLight.target)

        this.fogColor = uniform(color('#333'))
        this.fogControl = { color: '#333' }
        this.fogRange = { near: 60, far: 80 }
        this.renderer = null
        this._rebuildFog()
        this.applyShadowFill()
    }

    applyShadowFill() {
        const fill = THREE.MathUtils.clamp(this.shadowFill, 0, 1)
        this.ambientLight.intensity = fill * 0.16 + 0.04
        this.environmentIntensity = fill * 0.38 + 0.12
        this.syncEnvironmentIntensity()
    }

    _rebuildFog() {
        this.scene.fogNode = fog(this.fogColor, rangeFogFactor(this.fogRange.near, this.fogRange.far))
    }

    /**
     * @param {string} hex
     */
    setFogColor(hex) {
        this.fogColor.value.set(hex)
        this.renderer?.setClearColor(this.fogColor.value)
    }

    /**
     * @param {THREE.WebGPURenderer} renderer
     * @param {THREE.Texture | null} equirectTexture
     */
    applyEnvironmentMap(renderer, equirectTexture) {
        this.renderer = renderer

        if (!equirectTexture) {
            console.warn('[Environment] Missing HDR texture; scene.environment skipped.')
            return
        }

        this.envMap?.dispose()
        this.envMap = null

        equirectTexture.mapping = THREE.EquirectangularReflectionMapping

        const pmremGenerator = new THREE.PMREMGenerator(renderer)
        pmremGenerator.compileEquirectangularShader()
        this.envMap = pmremGenerator.fromEquirectangular(equirectTexture).texture
        pmremGenerator.dispose()

        this.scene.environment = this.envMap
        this.syncEnvironmentIntensity()
        this.syncBackground()
    }

    syncEnvironmentIntensity() {
        this.scene.environmentIntensity = this.environmentIntensity
    }

    syncBackground() {
        this.scene.background = this.useEnvBackground ? this.envMap : null
    }

    /**
     * @param {{ centerX: number, centerZ: number, halfExtent: number, maxHeight: number }} bounds
     */
    configureShadows({ centerX, centerZ, halfExtent, maxHeight }) {
        this.shadowBounds.halfExtent = halfExtent
        this.shadowBounds.maxHeight = maxHeight

        if (this.autoTargetToTerrain) {
            this.directionalTarget.x = centerX
            this.directionalTarget.y = 12
            this.directionalTarget.z = centerZ
        }

        this.applyShadowBounds()
    }

    /**
     * @param {THREE.Vector3 | { x: number, y: number, z: number }} playerPosition
     * @param {{ halfExtent: number, maxHeight: number }} shadowConfig
     */
    followPlayerShadow(playerPosition, { halfExtent, maxHeight }) {
        this.shadowBounds.halfExtent = halfExtent
        this.directionalTarget.x = playerPosition.x + PLAYER_SHADOW_TARGET_OFFSET.x
        this.directionalTarget.y = playerPosition.y + PLAYER_SHADOW_TARGET_OFFSET.y
        this.directionalTarget.z = playerPosition.z + PLAYER_SHADOW_TARGET_OFFSET.z

        this.directionalLight.position.set(
            playerPosition.x + PLAYER_SHADOW_LIGHT_OFFSET.x,
            playerPosition.y + PLAYER_SHADOW_LIGHT_OFFSET.y,
            playerPosition.z + PLAYER_SHADOW_LIGHT_OFFSET.z
        )

        this.shadowBounds.maxHeight = Math.max(maxHeight, PLAYER_SHADOW_MIN_CAMERA_DEPTH)

        this.applyShadowBounds()
    }

    syncDirectionalTarget() {
        this.directionalLight.target.position.set(
            this.directionalTarget.x,
            this.directionalTarget.y,
            this.directionalTarget.z
        )
        this.directionalLight.target.updateMatrixWorld()
        this.directionalLight.shadow.needsUpdate = true
        this.directionalLight.shadow.updateMatrices(this.directionalLight)
    }

    applyShadowBounds() {
        const { halfExtent, maxHeight } = this.shadowBounds

        this.syncDirectionalTarget()

        const shadowCamera = this.directionalLight.shadow.camera
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
        createFogPanel(debug, this)
    }

    dispose() {
        this.scene.environment = null
        this.scene.background = null
        this.envMap?.dispose()
        this.envMap = null
        this.scene.remove(this.ambientLight)
        this.scene.remove(this.directionalLight)
        this.scene.remove(this.directionalLight.target)
    }
}
