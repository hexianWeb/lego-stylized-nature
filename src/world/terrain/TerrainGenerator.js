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
    const { width, depth } = this.config.terrain
    return this.generateForBounds({ x: 0, z: 0 }, width, depth, {
      origin: { x: 0, z: 0 },
      visibleSize: width,
      halo: 0
    })
  }

  generateChunk({ origin, size, halo = 1 }) {
    const sampleWidth = size + halo * 2
    const sampleDepth = size + halo * 2
    const sampleOrigin = { x: origin.x - halo, z: origin.z - halo }

    return this.generateForBounds(sampleOrigin, sampleWidth, sampleDepth, {
      origin,
      visibleSize: size,
      halo
    })
  }

  generateForBounds(sampleOrigin, sampleWidth, sampleDepth, chunkMeta) {
    this.noise2D = createNoise2D(mulberry32(this.config.seed))
    const biomeCells = this.biomeMaskGenerator.generateForBounds(
      sampleOrigin,
      sampleWidth,
      sampleDepth
    )
    const heightField = this.generateHeightFieldForBounds(
      sampleOrigin,
      sampleWidth,
      sampleDepth,
      biomeCells
    )
    const surfaceCells = this.surfaceClassifier.classify(heightField)
    this.volcanoSurfaceFeatureGenerator.apply(biomeCells, surfaceCells)

    return new TerrainMap({
      heightField,
      biomeCells,
      surfaceCells,
      origin: chunkMeta.origin,
      visibleSize: chunkMeta.visibleSize,
      halo: chunkMeta.halo
    })
  }

  generateHeightField(biomeCells) {
    const terrain = this.config.terrain
    const field = new HeightField(terrain.width, terrain.depth)

    for (let z = 0; z < terrain.depth; z++) {
      for (let x = 0; x < terrain.width; x++) {
        this.writeHeightSample(field, x, z, biomeCells[z][x])
      }
    }

    return field
  }

  generateHeightFieldForBounds(sampleOrigin, sampleWidth, sampleDepth, biomeCells) {
    const field = new HeightField(sampleWidth, sampleDepth)

    for (let z = 0; z < sampleDepth; z++) {
      for (let x = 0; x < sampleWidth; x++) {
        this.writeHeightSample(
          field,
          x,
          z,
          biomeCells[z][x],
          sampleOrigin.x + x,
          sampleOrigin.z + z
        )
      }
    }

    return field
  }

  writeHeightSample(field, x, z, biomeCell, worldX = x, worldZ = z) {
    const terrain = this.config.terrain
    const heightOffset = this.biomeBlender.blendTerrainParam(biomeCell.weights, 'heightOffset', 0)
    const heightMagnitude = this.biomeBlender.blendTerrainParam(biomeCell.weights, 'heightMagnitude', 1)

    const n01 = 0.5 + 0.5 * this.fbm(worldX, worldZ)
    const shaped = Math.max(0, Math.min(1, (n01 - terrain.seaClip) / (1 - terrain.seaClip)))
    const height = Math.floor(shaped * terrain.maxHeight * heightMagnitude + terrain.waterLevel + heightOffset)

    field.set(x, z, Math.max(0, Math.min(terrain.maxHeight, height)))
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
