import { eventBus } from '../utils/event-bus.js'

export const BIOME_RADAR_HUD_UPDATE_EVENT = 'hud:biome-radar:update'

const DEFAULT_COLORS = {
  forest: '#53D86A',
  autumnForest: '#F4A13D',
  desert: '#E8D45A',
  volcano: '#FF513D'
}

export default class BiomeRadarHUD {
  constructor({ config, parent = null } = {}) {
    this.config = config
    this.radarConfig = config?.ui?.biomeRadar ?? {}
    this.enabled = this.radarConfig.enabled !== false
    this.parent = parent ?? (typeof document !== 'undefined' ? document.body : null)
    this.targets = this.buildTargets(config?.biomes?.regions ?? [])
    this.scanAngle = -Math.PI * 0.5
    this.pulseTime = 0
    this.playerPosition = { x: 0, z: 0 }
    this.playerYaw = 0
    this.cellSize = this.resolveCellSize(config)
    this.pixelRatio = 1
    this.size = this.radarConfig.size ?? 300
    this.radius = this.size * 0.43
    this.center = this.size * 0.5
    this._onPlayerStateUpdate = (payload) => {
      this.setPlayerState(payload)
    }

    if (!this.enabled || typeof document === 'undefined' || !this.parent) {
      return
    }

    eventBus.on(BIOME_RADAR_HUD_UPDATE_EVENT, this._onPlayerStateUpdate)

    this.element = document.createElement('div')
    this.element.className = 'biome-radar-hud'
    this.element.style.width = `${this.size}px`
    this.element.style.height = `${this.size}px`
    this.element.style.opacity = String(this.radarConfig.opacity ?? 0.9)

    this.canvas = document.createElement('canvas')
    this.canvas.className = 'biome-radar-hud__canvas'
    this.element.appendChild(this.canvas)
    this.createCompassLabels()
    this.parent.appendChild(this.element)

    this.context = this.canvas.getContext('2d')
    this.resizeCanvas()
    this.draw()
  }

  createCompassLabels() {
    const labels = [
      { direction: 'n', text: 'N' },
      { direction: 'e', text: 'E' },
      { direction: 's', text: 'S' },
      { direction: 'w', text: 'W' }
    ]

    for (const { direction, text } of labels) {
      const label = document.createElement('span')
      label.className = `biome-radar-hud__compass-label biome-radar-hud__compass-label--${direction}`
      label.textContent = text
      this.element.appendChild(label)
    }
  }

  buildTargets(regions) {
    const colors = {
      ...DEFAULT_COLORS,
      ...(this.radarConfig.colors ?? {})
    }

    return regions
      .filter((region) => Array.isArray(region.center) && region.center.length >= 2)
      .map((region) => ({
        id: region.id,
        x: Number(region.center[0]),
        z: Number(region.center[1]),
        color: colors[region.id] ?? '#DFFBFF'
      }))
      .filter((target) => Number.isFinite(target.x) && Number.isFinite(target.z))
  }

  resolveCellSize(config) {
    const cellSize = config?.terrain?.cellSize
    return Number.isFinite(cellSize) && cellSize > 0 ? cellSize : 1
  }

  setPlayerState({ position, yaw } = {}) {
    if (!this.enabled) {
      return
    }

    if (position) {
      this.playerPosition.x = this.toBiomeCoordinate(position.x, this.playerPosition.x)
      this.playerPosition.z = this.toBiomeCoordinate(position.z, this.playerPosition.z)
    }

    if (Number.isFinite(yaw)) {
      this.playerYaw = yaw
    }
  }

  update(delta = 1 / 60) {
    if (!this.enabled) {
      return
    }

    if (!this.context) {
      return
    }

    const scanSpeed = this.radarConfig.scanSpeed ?? 0.9
    const frameDelta = Number.isFinite(delta) ? delta : 1 / 60
    this.scanAngle = (this.scanAngle + frameDelta * scanSpeed * Math.PI * 2) % (Math.PI * 2)
    this.pulseTime += frameDelta
    this.draw()
  }

  toBiomeCoordinate(worldCoordinate, fallback) {
    if (!Number.isFinite(worldCoordinate)) {
      return fallback
    }

    return worldCoordinate / this.cellSize
  }

  resizeCanvas() {
    if (!this.canvas) {
      return
    }

    this.pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))
    this.canvas.width = Math.round(this.size * this.pixelRatio)
    this.canvas.height = Math.round(this.size * this.pixelRatio)
    this.context?.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0)
  }

  projectTarget(target) {
    const range = Math.max(1, this.radarConfig.range ?? 360)
    const dx = target.x - this.playerPosition.x
    const dz = target.z - this.playerPosition.z
    const distance = Math.sqrt(dx * dx + dz * dz)

    if (distance <= 1e-6) {
      return { x: this.center, y: this.center, clamped: false }
    }

    const radarDistance = Math.min(distance / range, 1) * this.radius
    const nx = dx / distance
    const nz = dz / distance

    return {
      x: this.center + nx * radarDistance,
      y: this.center + nz * radarDistance,
      clamped: distance > range
    }
  }

  draw() {
    const ctx = this.context
    if (!ctx) {
      return
    }

    ctx.clearRect(0, 0, this.size, this.size)
    this.drawBackground(ctx)
    this.drawScanLine(ctx)
    this.drawTargets(ctx)
    this.drawPlayer(ctx)
  }

  drawBackground(ctx) {
    const { center, radius } = this
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius)
    gradient.addColorStop(0, 'rgba(53, 196, 212, 0.10)')
    gradient.addColorStop(0.72, 'rgba(53, 196, 212, 0.05)')
    gradient.addColorStop(1, 'rgba(4, 12, 16, 0.58)')

    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(center, center, radius + 10, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = 'rgba(116, 223, 255, 0.68)'
    ctx.lineWidth = 2
    for (const scale of [0.38, 0.68, 1]) {
      ctx.beginPath()
      ctx.arc(center, center, radius * scale, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.strokeStyle = 'rgba(116, 223, 255, 0.18)'
    ctx.beginPath()
    ctx.moveTo(center - radius, center)
    ctx.lineTo(center + radius, center)
    ctx.moveTo(center, center - radius)
    ctx.lineTo(center, center + radius)
    ctx.stroke()
  }

  drawScanLine(ctx) {
    const endX = this.center + Math.cos(this.scanAngle) * this.radius
    const endY = this.center + Math.sin(this.scanAngle) * this.radius

    ctx.strokeStyle = 'rgba(53, 196, 212, 0.72)'
    ctx.lineWidth = 1.5
    ctx.shadowColor = 'rgba(53, 196, 212, 0.8)'
    ctx.shadowBlur = 12
    ctx.beginPath()
    ctx.moveTo(this.center, this.center)
    ctx.lineTo(endX, endY)
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  drawTargets(ctx) {
    const pulseSpeed = this.radarConfig.pulseSpeed ?? 1.1
    const pulseRingCount = 2

    for (let index = 0; index < this.targets.length; index++) {
      const target = this.targets[index]
      const point = this.projectTarget(target)
      const dotRadius = point.clamped ? 4.5 : 5.5
      const phaseOffset = index * 0.38
      const pulsePhase = this.pulseTime * pulseSpeed + phaseOffset

      for (let ring = 0; ring < pulseRingCount; ring++) {
        const ringT = (pulsePhase + ring / pulseRingCount) % 1
        const ringRadius = dotRadius + 4 + ringT * 18
        const alpha = (1 - ringT) * 0.55

        ctx.save()
        ctx.globalAlpha = alpha
        ctx.strokeStyle = target.color
        ctx.lineWidth = 1.5
        ctx.shadowColor = target.color
        ctx.shadowBlur = 10
        ctx.beginPath()
        ctx.arc(point.x, point.y, ringRadius, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      const coreScale = 1 + Math.sin(pulsePhase * Math.PI * 2) * 0.12
      const coreRadius = dotRadius * coreScale

      ctx.fillStyle = target.color
      ctx.shadowColor = target.color
      ctx.shadowBlur = 12 + Math.sin(pulsePhase * Math.PI * 2) * 4
      ctx.beginPath()
      ctx.arc(point.x, point.y, coreRadius, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }
  }

  drawPlayer(ctx) {
    ctx.strokeStyle = 'rgba(236, 255, 255, 0.95)'
    ctx.lineWidth = 1.5
    ctx.shadowColor = 'rgba(236, 255, 255, 0.85)'
    ctx.shadowBlur = 10

    ctx.beginPath()
    ctx.arc(this.center, this.center, 8, 0, Math.PI * 2)
    ctx.stroke()

    ctx.save()
    ctx.translate(this.center, this.center)
    ctx.rotate(this.playerYaw + Math.PI * 0.5)

    ctx.fillStyle = 'rgba(236, 255, 255, 0.16)'
    ctx.beginPath()
    ctx.moveTo(0, -14)
    ctx.lineTo(8, 9)
    ctx.lineTo(0, 5)
    ctx.lineTo(-8, 9)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()

    ctx.shadowBlur = 0
  }

  dispose() {
    if (this._onPlayerStateUpdate) {
      eventBus.off(BIOME_RADAR_HUD_UPDATE_EVENT, this._onPlayerStateUpdate)
    }
    this.element?.remove()
    this.context = null
    this.canvas = null
    this.element = null
  }
}
