const WIDTH = 248
const HEIGHT = 180
const MAP_PADDING = 20
const REFRESH_INTERVAL = 500
const SAMPLE_SIZE = 3
const BACKGROUND = '#c9d8c3'

const BIOME_COLORS = {
  forest: [105, 145, 100],
  autumnForest: [184, 151, 89],
  desert: [217, 194, 140],
  volcano: [126, 122, 104],
  snowForest: [211, 225, 211],
  meadow: [149, 174, 112],
  wetland: [109, 156, 138],
}

function getMapBounds(map) {
  const halo = map.halo ?? 0
  const width = map.heightField?.width ?? map.surfaceCells?.[0]?.length ?? 0
  const depth = map.heightField?.depth ?? map.surfaceCells?.length ?? 0
  return {
    map,
    halo,
    x: map.origin?.x ?? 0,
    z: map.origin?.z ?? 0,
    width: width - halo * 2,
    depth: depth - halo * 2,
  }
}

function getLoadedMaps(world) {
  const slots = world?.terrainChunkManager?.activeSlots
  if (slots) {
    return Array.from(slots.values(), slot => slot.terrainMap)
      .filter(Boolean).map(getMapBounds)
  }
  return world?.terrainMap ? [getMapBounds(world.terrainMap)] : []
}

function sampleMaps(maps, blockX, blockZ) {
  for (const bounds of maps) {
    const x = blockX - bounds.x
    const z = blockZ - bounds.z
    if (x < 0 || z < 0 || x >= bounds.width || z >= bounds.depth)
      continue
    const localX = x + bounds.halo
    const localZ = z + bounds.halo
    return {
      surface: bounds.map.getSurfaceCell(localX, localZ),
      biome: bounds.map.getBiomeCell(localX, localZ),
    }
  }
  return null
}

function getSampleColor(sample, config) {
  if (!sample)
    return null
  const { surface, biome } = sample
  if (surface?.isLava)
    return '#ce9168'
  if (surface?.isWater && config.water?.enableWater !== false)
    return '#79b7bd'
  if (surface?.isShore)
    return '#ddce9d'

  const base = BIOME_COLORS[biome?.biomeId] ?? BIOME_COLORS.forest
  const height = surface?.height ?? 0
  const maxHeight = Math.max(1, config.terrain?.maxHeight ?? 32)
  const shade = 0.9 + Math.min(1, height / maxHeight) * 0.25
  return `rgb(${base.map(value => Math.round(value * shade)).join(',')})`
}

/** A north-up map drawn only from terrain already loaded by the world. */
export default class TerrainMinimap {
  constructor(canvas, experience) {
    this.canvas = canvas
    this.experience = experience
    this.context = canvas.getContext('2d')
    this.mapCanvas = canvas.ownerDocument.createElement('canvas')
    this.mapContext = this.mapCanvas.getContext('2d')
    this.lastRefresh = -Infinity
    this.center = { x: 0, z: 0 }
    this.width = WIDTH
    this.height = HEIGHT
    this.dpr = 0
    this.worldPerPixel = 1
    this.disposed = false
    this.resize()
  }

  resize() {
    const dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1))
    const width = this.canvas.clientWidth || WIDTH
    const height = this.canvas.clientHeight || HEIGHT
    if (dpr === this.dpr && width === this.width && height === this.height)
      return
    this.width = width
    this.height = height
    this.dpr = dpr
    this.canvas.width = Math.round(width * dpr)
    this.canvas.height = Math.round(height * dpr)
    this.mapCanvas.width = Math.round((width + MAP_PADDING * 2) * dpr)
    this.mapCanvas.height = Math.round((height + MAP_PADDING * 2) * dpr)
    this.lastRefresh = -Infinity
  }

  getCurrentBiomeId() {
    const world = this.experience.world
    const position = world?.playerAircraft?.state?.position
    if (!position)
      return null
    const cellSize = world.config?.terrain?.cellSize || 1
    return sampleMaps(
      getLoadedMaps(world),
      Math.floor(position.x / cellSize),
      Math.floor(position.z / cellSize),
    )?.biome?.biomeId ?? null
  }

  refreshMap(position, now) {
    const world = this.experience.world
    const config = world?.config ?? {}
    const cellSize = config.terrain?.cellSize || 1
    const span = Math.max(32, (config.chunks?.size ?? 64) * 1.8) * cellSize
    this.worldPerPixel = span / this.width
    this.center.x = position.x
    this.center.z = position.z
    this.lastRefresh = now

    const context = this.mapContext
    const width = this.width + MAP_PADDING * 2
    const height = this.height + MAP_PADDING * 2
    const maps = getLoadedMaps(world)
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    context.fillStyle = BACKGROUND
    context.fillRect(0, 0, width, height)

    for (let y = 0; y < height; y += SAMPLE_SIZE) {
      const blockZ = Math.floor((position.z + (y + SAMPLE_SIZE / 2 - height / 2) * this.worldPerPixel) / cellSize)
      for (let x = 0; x < width; x += SAMPLE_SIZE) {
        const blockX = Math.floor((position.x + (x + SAMPLE_SIZE / 2 - width / 2) * this.worldPerPixel) / cellSize)
        const color = getSampleColor(sampleMaps(maps, blockX, blockZ), config)
        if (!color)
          continue
        context.fillStyle = color
        context.fillRect(x, y, SAMPLE_SIZE, SAMPLE_SIZE)
      }
    }
  }

  update() {
    if (this.disposed || !this.context || !this.mapContext)
      return
    this.resize()
    const state = this.experience.world?.playerAircraft?.state
    const position = state?.position ?? { x: 0, z: 0 }
    const now = performance.now()
    const offsetX = (position.x - this.center.x) / this.worldPerPixel
    const offsetZ = (position.z - this.center.z) / this.worldPerPixel
    if (now - this.lastRefresh >= REFRESH_INTERVAL
      || Math.max(Math.abs(offsetX), Math.abs(offsetZ)) >= MAP_PADDING - SAMPLE_SIZE) {
      this.refreshMap(position, now)
    }

    const context = this.context
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    context.fillStyle = BACKGROUND
    context.fillRect(0, 0, this.width, this.height)
    context.imageSmoothingEnabled = false
    context.drawImage(
      this.mapCanvas,
      -MAP_PADDING - (position.x - this.center.x) / this.worldPerPixel,
      -MAP_PADDING - (position.z - this.center.z) / this.worldPerPixel,
      this.width + MAP_PADDING * 2,
      this.height + MAP_PADDING * 2,
    )

    context.strokeStyle = 'rgba(248, 246, 221, 0.17)'
    context.lineWidth = 1
    context.beginPath()
    for (let x = 0.5; x < this.width; x += 24) {
      context.moveTo(x, 0)
      context.lineTo(x, this.height)
    }
    for (let y = 0.5; y < this.height; y += 24) {
      context.moveTo(0, y)
      context.lineTo(this.width, y)
    }
    context.stroke()

    context.fillStyle = '#f9f4df'
    context.font = '600 9px system-ui, sans-serif'
    context.textAlign = 'center'
    context.fillText('N', this.width / 2, 13)
    context.save()
    context.translate(this.width / 2, this.height / 2)
    // Canvas +Y follows world +Z; aircraft yaw 0 points along +X (east).
    context.rotate(state?.yaw ?? 0)
    context.shadowColor = 'rgba(37, 66, 47, 0.45)'
    context.shadowBlur = 4
    context.beginPath()
    context.moveTo(8, 0)
    context.lineTo(-5, -5)
    context.lineTo(-2.5, 0)
    context.lineTo(-5, 5)
    context.closePath()
    context.fillStyle = '#fff7d9'
    context.strokeStyle = '#486849'
    context.lineWidth = 1.5
    context.fill()
    context.stroke()
    context.restore()
  }

  dispose() {
    this.disposed = true
    this.mapCanvas.width = 0
    this.mapCanvas.height = 0
    this.mapContext = null
    this.context = null
    this.experience = null
  }
}
