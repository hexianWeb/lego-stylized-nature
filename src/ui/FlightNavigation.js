import TerrainMinimap from './TerrainMinimap.js'

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const TICK_DEGREES = 360 / DIRECTIONS.length / 16

export const flightNavigationMarkup = `
  <div class="flight-compass hud-part" data-flight-compass role="img" aria-label="航向">
    <div class="flight-compass-window flight-panel"><canvas class="flight-compass-strip" aria-hidden="true"></canvas></div>
    <i class="flight-compass-caret" aria-hidden="true"></i>
  </div>
  <section class="flight-map map-card hud-part flight-panel" data-flight-map aria-label="周边地形">
    <header class="flight-map-header">
      <strong>区域地图</strong>
      <span class="flight-map-coordinates"><span>X <b data-map-x>—</b></span><span>Z <b data-map-z>—</b></span></span>
    </header>
    <div class="flight-map-frame">
      <canvas class="flight-map-canvas" data-minimap aria-label="周边地形与飞行朝向"></canvas>
      <i class="flight-map-tick" data-edge="north" aria-hidden="true"></i>
      <i class="flight-map-tick" data-edge="east" aria-hidden="true"></i>
      <i class="flight-map-tick" data-edge="south" aria-hidden="true"></i>
      <i class="flight-map-tick" data-edge="west" aria-hidden="true"></i>
    </div>
    <button type="button" class="flight-map-toggle" data-action="map" aria-expanded="false" aria-label="放大小地图" title="放大小地图" disabled>
      <span class="flight-map-close" aria-hidden="true">×</span>
    </button>
  </section>`

export function getHeadingDegrees(yaw) {
  // The aircraft's local +X points east and the map's -Z points north.
  return ((yaw * (180 / Math.PI) + 90) % 360 + 360) % 360
}

function formatCoordinate(position, cellSize) {
  const cell = Math.floor(position / cellSize)
  const sign = cell < 0 ? '−' : ''
  return sign + String(Math.abs(cell)).padStart(4, '0')
}

export default class FlightNavigation {
  constructor(root, experience) {
    this.root = root
    this.compass = root.querySelector('[data-flight-compass]')
    this.compassCanvas = this.compass.querySelector('canvas')
    this.compassContext = this.compassCanvas.getContext('2d')
    this.minimap = new TerrainMinimap(root.querySelector('[data-minimap]'), experience)
    this.x = root.querySelector('[data-map-x]')
    this.z = root.querySelector('[data-map-z]')
  }

  drawCompass(heading) {
    const canvas = this.compassCanvas
    const context = this.compassContext
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (!context || !width || !height) return

    const dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1))
    const pixelWidth = Math.round(width * dpr)
    const pixelHeight = Math.round(height * dpr)
    const resized = canvas.width !== pixelWidth || canvas.height !== pixelHeight
    if (!resized && Math.abs(heading - this.heading) < 0.08) return
    this.heading = heading
    if (resized) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
    }

    const rounded = Math.round(heading) % 360
    if (this.roundedHeading !== rounded) {
      this.roundedHeading = rounded
      this.compass.setAttribute('aria-label', `航向 ${rounded}°`)
    }

    const scale = Math.min(width / 464, height / 46)
    const tickBase = height - Math.max(4, 8 * scale)
    const pixelsPerDegree = width * 0.38 / 45
    const tickRange = (width / 2 - Math.max(12, 28 * scale)) / pixelsPerDegree
    const start = Math.ceil((heading - tickRange) / TICK_DEGREES)
    const end = Math.floor((heading + tickRange) / TICK_DEGREES)

    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, height)
    context.fillStyle = '#f0f5f7'
    context.font = `900 ${Math.max(11, 22 * scale)}px Arial, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'

    for (let tick = start; tick <= end; tick++) {
      const x = width / 2 + (tick * TICK_DEGREES - heading) * pixelsPerDegree
      const major = tick % 16 === 0
      const length = (major ? 11 : tick % 8 === 0 ? 20 : tick % 2 === 0 ? 6 : 3) * scale
      const tickWidth = Math.max(0.8, (tick % 8 === 0 ? 2 : 1.15) * scale)
      context.globalAlpha = tick % 2 === 0 ? 1 : 0.58
      context.fillRect(x - tickWidth / 2, tickBase - Math.max(2, length), tickWidth, Math.max(2, length))
      if (major) {
        const direction = (tick / 16 % DIRECTIONS.length + DIRECTIONS.length) % DIRECTIONS.length
        context.fillText(DIRECTIONS[direction], x, height * 0.34)
      }
    }
    context.globalAlpha = 1
  }

  updateHeading(player) {
    if (player?.enabled && !this.root.classList.contains('has-cockpit-overlay')) {
      this.drawCompass(getHeadingDegrees(player.state.yaw))
    }
  }

  update(player, world) {
    if (!player?.enabled) return
    const { position } = player.state
    const cellSize = world.config.terrain.cellSize
    const x = formatCoordinate(position.x, cellSize)
    const z = formatCoordinate(position.z, cellSize)
    if (this.x.textContent !== x) this.x.textContent = x
    if (this.z.textContent !== z) this.z.textContent = z
    if (this.root.classList.contains('is-map-expanded') || !this.root.classList.contains('has-cockpit-overlay')) {
      this.updateMap()
    }
  }

  updateMap() {
    this.minimap.update()
  }

  getCurrentBiomeId() {
    return this.minimap.getCurrentBiomeId()
  }

  dispose() {
    this.minimap.dispose()
  }
}
