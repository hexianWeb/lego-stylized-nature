import { createNoise2D } from 'simplex-noise'
import HeightField from './HeightField.js'
import TerrainMap from './TerrainMap.js'
import SurfaceClassifier from './SurfaceClassifier.js'
import VolcanoSurfaceFeatureGenerator from './VolcanoSurfaceFeatureGenerator.js'
import { mulberry32 } from '../../utils/random.js'

export default class TerrainGenerator {
  constructor({ config, biomeMaskGenerator, biomeBlender, biomeRegistry }) {
    this.config = config
    this.biomeMaskGenerator = biomeMaskGenerator
    this.biomeBlender = biomeBlender
    this.surfaceClassifier = new SurfaceClassifier(config)
    this.volcanoSurfaceFeatureGenerator = new VolcanoSurfaceFeatureGenerator({
      config,
      biomeRegistry
    })
  }

  generate() {
    this.noise2D = createNoise2D(mulberry32(this.config.seed))
    const biomeCells = this.biomeMaskGenerator.generate()
    const heightField = this.generateHeightField(biomeCells)
    const surfaceCells = this.surfaceClassifier.classify(heightField)
    this.volcanoSurfaceFeatureGenerator.apply(biomeCells, surfaceCells)
    return new TerrainMap({ heightField, biomeCells, surfaceCells })
  }

  generateHeightField(biomeCells) {
    const terrain = this.config.terrain
    const field = new HeightField(terrain.width, terrain.depth)

    for (let z = 0; z < terrain.depth; z++) {
      for (let x = 0; x < terrain.width; x++) {
        const biomeCell = biomeCells[z][x]
        const heightOffset = this.biomeBlender.blendTerrainParam(biomeCell.weights, 'heightOffset', 0)
        const heightMagnitude = this.biomeBlender.blendTerrainParam(biomeCell.weights, 'heightMagnitude', 1)

        const n01 = 0.5 + 0.5 * this.fbm(x, z)
        const shaped = Math.max(0, Math.min(1, (n01 - terrain.seaClip) / (1 - terrain.seaClip)))
        const height = Math.floor(shaped * terrain.maxHeight * heightMagnitude + terrain.waterLevel + heightOffset)

        field.set(x, z, Math.max(0, Math.min(terrain.maxHeight, height)))
      }
    }

    return field
  }

  fbm(x, z) {
    const terrain = this.config.terrain
    let value = 0
    let amplitude = 1
    let frequency = 1 / terrain.noiseScale
    let totalAmplitude = 0

    for (let octave = 0; octave < terrain.noiseOctaves; octave++) {
      value += this.noise2D(x * frequency, z * frequency) * amplitude
      totalAmplitude += amplitude
      amplitude *= terrain.noiseGain
      frequency *= terrain.noiseLacunarity
    }

    return value / totalAmplitude
  }
}
