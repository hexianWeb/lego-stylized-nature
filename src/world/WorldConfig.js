import { TILT_SHIFT_DEFAULTS } from '../renderer/postprocessing/tiltShiftConfig.js'
import { SPEED_LINES_DEFAULTS } from '../renderer/postprocessing/speedLinesConfig.js'

export const worldConfig = {
  seed: 20260608,
  postProcessing: {
    tiltShift: { ...TILT_SHIFT_DEFAULTS },
    speedLines: {
      ...SPEED_LINES_DEFAULTS,
      color: { ...SPEED_LINES_DEFAULTS.color }
    }
  },
  terrain: {
    width: 128,
    depth: 128,
    maxHeight: 36,
    layerHeight: 0.095,
    cellSize: 0.2,
    waterLevel: 3,
    noiseScale: 34,
    noiseOctaves: 4,
    noiseGain: 0.5,
    noiseLacunarity: 2,
    seaClip: 0.35,
    ao: {
      enabled: true,
      previewGrayscale: false,
      strength: 1.4,
      min: 0.2,
      horizonScale: 2.5,
      creviceScale: 2.5,
      depthScale: 6.5,
      horizonWeight: 0.61,
      creviceWeight: 0.42,
      depthWeight: 0.32,
      sideWeight: 0.52
    }
  },
  biomes: {
    regions: [
      { id: 'forest', center: [0, 0], radius: 120, weight: 1 },
      { id: 'autumnForest', center: [200, 200], radius: 120, weight: 1 },
      { id: 'desert', center: [200, -200], radius: 120, weight: 1 },
      { id: 'volcano', center: [-200, 200], radius: 120, weight: 1 }
    ]
  },
  placement: {
    enablePrefabs: true,
    enableTrees: true,
    rotationStep: Math.PI / 2,
    prefabCapacity: {
      default: 12,
      tree: 128,
      flora: 512,
      rock: 128,
      plant: 256,
      waterAccent: 32,
      waterPlant: 64,
      prop: 64
    }
  },
  chunks: {
    enabled: true,
    size: 64,
    halo: 1,
    windowRadius: 1,
    maxPendingBuildsPerFrame: 1,
    visibilityPadding: 1
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
      }
    }
  },
  water: {
    enableWater: true,
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
