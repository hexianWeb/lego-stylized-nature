const WIDTH = 254
const HEIGHT = 180
const MAP_PADDING = 20
const REFRESH_INTERVAL = 500
const SAMPLE_SIZE = 3
const BACKGROUND = '#173b40'

const BIOME_COLORS = {
  forest: [74, 151, 65],
  autumnForest: [183, 136, 55],
  desert: [203, 159, 64],
  volcano: [120, 108, 81],
  snowForest: [199, 220, 206],
  meadow: [128, 168, 65],
  wetland: [65, 147, 94],
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
    return '#e78248'
  if (surface?.isWater && config.water?.enableWater !== false)
    return '#4dbed1'
  if (surface?.isShore)
    return '#f4e2a0'

  const base = BIOME_COLORS[biome?.biomeId] ?? BIOME_COLORS.forest
  const height = surface?.height ?? 0
  const maxHeight = Math.max(1, config.terrain?.maxHeight ?? 32)
  const shade = 0.84 + Math.min(1, height / maxHeight) * 0.3
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

    context.strokeStyle = 'rgba(248, 251, 234, 0.26)'
    context.lineWidth = 1
    context.beginPath()
    for (let column = 1; column < 10; column++) {
      const x = Math.floor(column * this.width / 10) + 0.5
      context.moveTo(x, 0)
      context.lineTo(x, this.height)
    }
    for (let row = 1; row < 8; row++) {
      const y = Math.floor(row * this.height / 8) + 0.5
      context.moveTo(0, y)
      context.lineTo(this.width, y)
    }
    context.stroke()

    const markerSize = Math.max(0.7, Math.min(1.3, this.width / WIDTH))
    context.fillStyle = '#f9fcf6'
    context.font = `900 ${Math.round(18 * markerSize)}px Arial, sans-serif`
    context.textAlign = 'center'
    context.fillText('N', this.width / 2, 24 * markerSize)
    context.save()
    context.translate(this.width / 2, this.height / 2)
    // Canvas +Y follows world +Z; aircraft yaw 0 points along +X (east).
    context.rotate(state?.yaw ?? 0)
    context.scale(markerSize, markerSize)
    context.shadowColor = 'rgba(37, 66, 47, 0.45)'
    context.shadowBlur = 4
    context.beginPath()
    context.moveTo(12, 0)
    context.lineTo(-8, -9)
    context.lineTo(-4.5, 0)
    context.lineTo(-8, 9)
    context.closePath()
    context.fillStyle = '#fafcf4'
    context.strokeStyle = '#456b60'
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
