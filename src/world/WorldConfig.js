import { TILT_SHIFT_DEFAULTS } from '../renderer/postprocessing/tiltShiftConfig.js'
import { SPEED_LINES_DEFAULTS } from '../renderer/postprocessing/speedLinesConfig.js'
import { createTerrainColorSettings } from './bricks/terrainColorScheme.js'

export const worldConfig = {
  seed: 20260608,
  postProcessing: {
    enabled: false,
    tiltShift: { ...TILT_SHIFT_DEFAULTS },
    speedLines: {
      ...SPEED_LINES_DEFAULTS,
      color: { ...SPEED_LINES_DEFAULTS.color }
    }
  },
  terrain: {
    width: 128,
    depth: 128,
    maxHeight: 64,
    layerHeight: 0.095,
    cellSize: 0.2,
    waterLevel: 3,
    noiseScale: 72,
    noiseOctaves: 4,
    noiseGain: 0.5,
    noiseLacunarity: 2,
    color: createTerrainColorSettings(),
    ao: {
      enabled: true,
      previewGrayscale: false,
      strength: 2,
      min: 0.2,
      /** Grid steps sampled along each of 8 directions. Max value must be ≤ chunks.halo. */
      sampleDistances: [1, 2, 4, 8],
      /** Softens far samples: atten = 1 / (1 + (dist - 1) * falloff). */
      distanceFalloff: 0.25,
      creviceScale: 2.5,
      horizonWeight: 0.61,
      creviceWeight: 0.42
    }
  },
  biomes: {
    cellSize: 192,
    jitter: 0.6,
    blendWidth: 24,
    warp: { amplitude: 40, scale: 160 },
    originBiome: 'autumnForest',
    table: [
      { id: 'forest', weight: 4 },
      { id: 'autumnForest', weight: 3 },
      { id: 'desert', weight: 2 },
      { id: 'volcano', weight: 1 }
    ]
  },
  placement: {
    enablePrefabs: true,
    enableTrees: true,
    rotationStep: Math.PI / 2,
    prefabCapacity: {
      default: 128,
      tree: 128,
      flora: 512,
      rock: 256,
      plant: 256,
      waterAccent: 32,
      waterPlant: 64,
      prop: 64
    }
  },
  chunks: {
    enabled: true,
    size: 72,
    /** Must cover terrain AO sampleDistances (max 8) and placement neighbor lookups. */
    halo: 8,
    windowRadius: 1,
    maxPendingBuildsPerFrame: 1,
    visibilityPadding: 1,
    /** World-unit gap between adjacent chunks. */
    debugSpacing: 0
  },
  player: {
    aircraft: {
      enabled: true,
      assetName: 'playerAircraftModel',
      height: 3,
      scale: 1,
      thrust: 16,
      reverseThrust: 8,
      turnTorque: 5,
      turnThrustBoost: 5,
      turnIdleBoost: 4,
      linearDrag: 2.2,
      angularDrag: 6,
      maxSpeed: 8,
      maxAngularSpeed: 2.8,
      cameraFollow: {
        enabled: true,
        smoothing: 8

      },
      visualAttitude: {
        enabled: true,
        pitchMax: 0.22,
        rollMax: 0.50,
        pitchSmoothing: 10,
        rollSmoothing: 8,
        rollSpeedBoost: 0.4,
        hover: {
          amplitude: 0.06,
          frequency: 0.7,
          fadeSpeedRatio: 0.25
        },
        turbulence: {
          enabled: true,
          pitchAmplitude: 0.018,
          rollAmplitude: 0.028,
          yawAmplitude: 0.012,
          verticalAmplitude: 0.022,
          frequency: 1.1,
          pitchFrequencyScale: 1,
          rollFrequencyScale: 1.35,
          yawFrequencyScale: 0.75,
          verticalFrequencyScale: 1.6,
          minSpeedRatio: 0.05,
          fullSpeedRatio: 0.45
        },
        thrusters: {
          enabled: true,
          baseIntensity: 0.35,
          thrustBoost: 0.65,
          turnBias: 0.25,
          leftNodeName: 'left_engine',
          rightNodeName: 'right_engine'
        }
      },
      engineFlame: {
        enabled: true,
        intensity: 1.15,
        length: 0.28,
        radius: 0.03,
        speed: 1.05,
        respondToThrusters: true,
        minIntensity: 0.15
      },
      wingAirflow: {
        enabled: true,
        anchors: {
          wingHalfWidth: 0.40,
          outwardOffset: 0.1,
          backOffset: -0.21,
          upOffset: 0.03
        },
        sampleLife: 0.56,
        emitInterval: 0.034,
        minEmitDistance: 0.050,
        capacity: 32,
        maxSamples: 15,
        minSpeedRatio: 0.04,
        breakAngleDeg: 62,
        width: 0.040,
        tipWidthRatio: 0,
        bellPower: 1.35,
        verticalOffset: 0.045,
        opacity: 0.54,
        speedOpacity: 0.48,
        accelerationBoost: 0.37,
        pulseStrength: 0.01,
        color: '#f7fbff',
        additive: true,
        showAnchors: false
      }
    }
  },
  water: {
    enableWater: true,
    castShadow: true,
    darkColor: '#0757A6',
    midColor: '#168FD2',
    lightColor: '#42DDEB',
    textureScale: 0.1,
    flowSpeed: 0.6,
    flowStrength: 0.72,
    flowVariance: 0.55,
    roughness: 0.3,
    clearcoat: 0.45,
    clearcoatRoughness: 0.2
  }
}
