import BiomeMaskGenerator from '../biomes/BiomeMaskGenerator.js'
import BiomeRegistry from '../biomes/BiomeRegistry.js'
import HeightfieldAO from '../bricks/HeightfieldAO.js'
import HeightField from '../terrain/HeightField.js'
import LayeredTerrainBuilder, { VOLCANO_FILL_BIOME_CELL } from '../terrain/LayeredTerrainBuilder.js'
import TerrainGenerator from '../terrain/TerrainGenerator.js'
import TerrainMap from '../terrain/TerrainMap.js'

const LAYERS = ['surface', 'subsurface', 'deep']
const LAYER_MASK = 3
const VOLCANO_FILL_FLAG = 4
const WATER_FLAG = 1
const SHORE_FLAG = 2
const LAVA_FLAG = 4

/**
 * @param {{ seed: number, terrain: object, biomes: object }} config
 */
export function createChunkBuilder(config) {
  const biomeRegistry = new BiomeRegistry()
  return {
    terrainGenerator: new TerrainGenerator({
      config,
      biomeMaskGenerator: new BiomeMaskGenerator(config),
      biomeRegistry,
    }),
    layeredTerrainBuilder: new LayeredTerrainBuilder({ config }),
    heightfieldAO: new HeightfieldAO({ config }),
  }
}

export function buildPackedChunk(builder, { origin, size, halo }) {
  const started = performance.now()
  const terrainMap = builder.terrainGenerator.generateChunk({ origin, size, halo })
  const generated = performance.now()
  const placements = builder.layeredTerrainBuilder.buildPlacements(terrainMap)
  const placed = performance.now()
  builder.heightfieldAO.build(terrainMap, placements)
  const aoBuilt = performance.now()
  const packed = packChunkBuild({
    terrainMap,
    placements,
    aoValues: builder.heightfieldAO.getValues().slice(),
  })
  packed.timings = {
    generationMs: generated - started,
    placementMs: placed - generated,
    aoMs: aoBuilt - placed,
    packMs: performance.now() - aoBuilt,
  }
  return packed
}

/**
 * Structured-cloning the per-cell and per-placement objects costs more than generating them,
 * so builds cross the worker boundary as transferable typed arrays.
 */
export function packChunkBuild({ terrainMap, placements, aoValues }) {
  const { heightField, biomeCells, surfaceCells } = terrainMap
  const { width, depth } = heightField
  const cellCount = width * depth
  const heights = new Int16Array(cellCount)
  const surfaceHeights = new Int16Array(cellCount)
  const slopes = new Int16Array(cellCount)
  const lavaHeights = new Int16Array(cellCount)
  const surfaceFlags = new Uint8Array(cellCount)
  const dominantBiomes = new Uint8Array(cellCount)
  const biomeOffsets = new Uint32Array(cellCount + 1)
  const biomeEntryIds = []
  const biomeEntryWeights = []
  const biomeIds = []
  const biomeIndices = new Map()
  const getBiomeIndex = (biomeId) => {
    let index = biomeIndices.get(biomeId)
    if (index === undefined) {
      index = biomeIds.length
      biomeIds.push(biomeId)
      biomeIndices.set(biomeId, index)
    }
    return index
  }

  for (let z = 0, i = 0; z < depth; z++) {
    for (let x = 0; x < width; x++, i++) {
      const surfaceCell = surfaceCells[z][x]
      const biomeCell = biomeCells[z][x]
      heights[i] = heightField.get(x, z)
      surfaceHeights[i] = surfaceCell.height
      slopes[i] = surfaceCell.slope
      lavaHeights[i] = surfaceCell.lavaHeight ?? 0
      surfaceFlags[i] = (surfaceCell.isWater ? WATER_FLAG : 0)
        | (surfaceCell.isShore ? SHORE_FLAG : 0)
        | (surfaceCell.isLava ? LAVA_FLAG : 0)
      dominantBiomes[i] = getBiomeIndex(biomeCell.biomeId)
      biomeOffsets[i] = biomeEntryIds.length
      // Entry order is kept: dithered color picks walk the weights in insertion order.
      for (const [biomeId, weight] of Object.entries(biomeCell.weights)) {
        biomeEntryIds.push(getBiomeIndex(biomeId))
        biomeEntryWeights.push(weight)
      }
    }
  }
  biomeOffsets[cellCount] = biomeEntryIds.length

  const placementCoords = new Int16Array(placements.length * 3)
  const placementInfo = new Uint8Array(placements.length)
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]
    placementCoords[i * 3] = p.x
    placementCoords[i * 3 + 1] = p.y
    placementCoords[i * 3 + 2] = p.z
    placementInfo[i] = LAYERS.indexOf(p.layer)
      | (p.biomeCell === VOLCANO_FILL_BIOME_CELL ? VOLCANO_FILL_FLAG : 0)
  }

  return {
    width,
    depth,
    origin: { ...terrainMap.origin },
    visibleSize: terrainMap.visibleSize,
    halo: terrainMap.halo,
    biomeIds,
    heights,
    surfaceHeights,
    slopes,
    lavaHeights,
    surfaceFlags,
    dominantBiomes,
    biomeOffsets,
    biomeEntryIds: Uint8Array.from(biomeEntryIds),
    biomeEntryWeights: Float64Array.from(biomeEntryWeights),
    placementCoords,
    placementInfo,
    aoValues,
  }
}

export function getChunkBuildTransfer(packed) {
  return [
    packed.heights,
    packed.surfaceHeights,
    packed.slopes,
    packed.lavaHeights,
    packed.surfaceFlags,
    packed.dominantBiomes,
    packed.biomeOffsets,
    packed.biomeEntryIds,
    packed.biomeEntryWeights,
    packed.placementCoords,
    packed.placementInfo,
    packed.aoValues,
  ].map(array => array.buffer)
}

export function unpackChunkBuild(packed) {
  const {
    width,
    depth,
    halo,
    biomeIds,
    heights,
    surfaceHeights,
    slopes,
    lavaHeights,
    surfaceFlags,
    dominantBiomes,
    biomeOffsets,
    biomeEntryIds,
    biomeEntryWeights,
    placementCoords,
    placementInfo,
  } = packed
  const heightField = new HeightField(width, depth)
  const biomeCells = []
  const surfaceCells = []

  for (let z = 0, i = 0; z < depth; z++) {
    const heightRow = heightField.values[z]
    const biomeRow = []
    const surfaceRow = []
    for (let x = 0; x < width; x++, i++) {
      heightRow[x] = heights[i]

      const weights = {}
      for (let entry = biomeOffsets[i]; entry < biomeOffsets[i + 1]; entry++) {
        weights[biomeIds[biomeEntryIds[entry]]] = biomeEntryWeights[entry]
      }
      biomeRow.push({ biomeId: biomeIds[dominantBiomes[i]], weights })

      const flags = surfaceFlags[i]
      const isLava = (flags & LAVA_FLAG) !== 0
      surfaceRow.push({
        x,
        z,
        height: surfaceHeights[i],
        slope: slopes[i],
        isWater: (flags & WATER_FLAG) !== 0,
        isShore: (flags & SHORE_FLAG) !== 0,
        isLava,
        lavaType: isLava ? 'pool' : null,
        lavaHeight: isLava ? lavaHeights[i] : null,
      })
    }
    biomeCells.push(biomeRow)
    surfaceCells.push(surfaceRow)
  }

  const placements = Array.from({ length: placementInfo.length })
  for (let i = 0; i < placements.length; i++) {
    const x = placementCoords[i * 3]
    const z = placementCoords[i * 3 + 2]
    const info = placementInfo[i]
    placements[i] = {
      x,
      y: placementCoords[i * 3 + 1],
      z,
      layer: LAYERS[info & LAYER_MASK],
      biomeCell: info & VOLCANO_FILL_FLAG ? VOLCANO_FILL_BIOME_CELL : biomeCells[z + halo][x + halo],
      surfaceCell: surfaceCells[z + halo][x + halo],
    }
  }

  return {
    terrainMap: new TerrainMap({
      heightField,
      biomeCells,
      surfaceCells,
      origin: packed.origin,
      visibleSize: packed.visibleSize,
      halo,
    }),
    placements,
    aoValues: packed.aoValues,
    timings: packed.timings ?? null,
  }
}
