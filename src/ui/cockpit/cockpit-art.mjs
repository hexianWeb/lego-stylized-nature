export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

const TAU = 2 * Math.PI
const PITCH_PIXELS_PER_DEGREE = 3.6
const radians = degrees => degrees * Math.PI / 180
const mono = 'ui-monospace, Consolas, monospace'
const green = '#a8ffb1'

function trace(ctx, points) {
  ctx.beginPath()
  ctx.moveTo(...points[0])
  for (const point of points.slice(1)) ctx.lineTo(...point)
  ctx.closePath()
}

function circle(ctx, x, y, radius) {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, TAU)
}

function line(ctx, x0, y0, x1, y1) {
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}

function text(ctx, value, x, y, size, align = 'center') {
  ctx.font = '600 ' + size + 'px ' + mono
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(value, x, y)
}

function sprite(ctx, image, { bounds: [x, y, width, height] }) {
  ctx.drawImage(image, x, y, width, height)
}

function glass(ctx, polygon, x, y, width, height) {
  trace(ctx, polygon)
  ctx.clip()
  const base = ctx.createLinearGradient(x, y, x + width * 0.5, y + height)
  base.addColorStop(0, '#154741')
  base.addColorStop(0.44, '#062f28')
  base.addColorStop(1, '#051c1b')
  ctx.fillStyle = base
  ctx.fillRect(x, y, width, height)
}

function scanLines(ctx, x, y, width, height) {
  ctx.fillStyle = 'rgba(0, 14, 11, .20)'
  for (let offset = 1; offset < height; offset += 5) {
    ctx.fillRect(x, y + offset, width, 1.3)
  }
}

function renderRadar(ctx, art, assets, flight) {
  const { center: [x, y], polygon } = art.radar
  ctx.save()
  glass(ctx, polygon, 145, 604, 334, 187)
  ctx.save()
  ctx.globalAlpha = 0.80
  sprite(ctx, assets.radarTerrain, art.radarTerrain)
  ctx.restore()

  ctx.strokeStyle = '#438a65a3'
  ctx.lineWidth = 1.65
  for (const radius of [29, 57, 85, 113]) {
    circle(ctx, x, y, radius)
    ctx.stroke()
  }
  line(ctx, x - 113, y, x + 113, y)
  line(ctx, x, y - 113, x, y + 113)

  const angle = flight.radarAngle
  const arc = ctx.createConicGradient(angle - 0.85, x, y)
  arc.addColorStop(0, '#6afca000')
  arc.addColorStop(0.13, '#6afca079')
  arc.addColorStop(0.136, '#6afca000')
  arc.addColorStop(1, '#6afca000')
  ctx.fillStyle = arc
  circle(ctx, x, y, 113)
  ctx.fill()

  ctx.strokeStyle = '#b6ffc6'
  ctx.lineWidth = 2.9
  ctx.shadowColor = '#5cff92'
  ctx.shadowBlur = 8
  line(ctx, x, y, x + 113 * Math.cos(angle), y + 113 * Math.sin(angle))
  ctx.shadowBlur = 0
  const contacts = [[-50, -39], [43, 26], [53, -68], [-68, 29]]
  for (const [dx, dy] of contacts) {
    const behindSweep = (angle - Math.atan2(dy, dx) + TAU * 2) % TAU
    ctx.globalAlpha = 0.32 + 0.68 * Math.exp(-behindSweep * 0.8)
    ctx.fillStyle = green
    circle(ctx, x + dx, y + dy, 3.5)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = green
  circle(ctx, x, y, 4.5)
  ctx.fill()
  ctx.fillStyle = '#bdf2c6'
  text(ctx, 'RADAR DEMO', 172, 636, 12, 'left')
  scanLines(ctx, 148, 607, 330, 186)
  ctx.restore()
}

function segmentedColumn(ctx, x, y, amount, label) {
  const width = 42
  const count = 8
  const gap = 4
  const segmentHeight = 9.5
  const height = count * (segmentHeight + gap) + gap
  ctx.strokeStyle = '#4ecda891'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, 5)
  ctx.stroke()
  for (let i = 0; i < count; i++) {
    const fill = clamp(amount * count - i, 0, 1)
    const segmentY = y + height - gap - segmentHeight - i * (segmentHeight + gap)
    ctx.fillStyle = '#164f43'
    ctx.fillRect(x + 5, segmentY, width - 10, segmentHeight)
    if (fill > 0) {
      ctx.fillStyle = i < 5 ? 'rgba(130, 255, 170, ' + fill + ')' : 'rgba(255, 193, 103, ' + fill + ')'
      ctx.fillRect(x + 5, segmentY + segmentHeight * (1 - fill), width - 10, segmentHeight * fill)
    }
  }
  ctx.fillStyle = '#a8ebc7'
  text(ctx, label, x + width / 2, y - 7, 12)
}

function renderSystems(ctx, art, assets, flight, speedRatio) {
  ctx.save()
  glass(ctx, art.systems.polygon, 1206, 603, 337, 191)
  ctx.strokeStyle = '#4bddbcab'
  ctx.lineWidth = 2
  line(ctx, 1232, 634, 1254, 634)
  line(ctx, 1232, 634, 1232, 652)
  line(ctx, 1232, 766, 1254, 766)
  line(ctx, 1232, 766, 1232, 748)
  sprite(ctx, assets.plane, art.plane)
  segmentedColumn(ctx, 1404, 653, flight.thrust / 100, 'PWR')
  segmentedColumn(ctx, 1470, 653, speedRatio, 'SPD')
  scanLines(ctx, 1205, 603, 339, 191)
  ctx.restore()
}

function renderAttitude(ctx, attitude, roll, pitch, altitude) {
  const { center: [x, y], radius } = attitude
  ctx.save()
  circle(ctx, x, y, radius + 1)
  ctx.clip()
  ctx.translate(x, y)
  ctx.save()
  const pitchShift = pitch * PITCH_PIXELS_PER_DEGREE
  const faceExtent = radius + Math.abs(pitchShift) + 4
  ctx.rotate(radians(roll))
  ctx.translate(0, pitchShift)
  const sky = ctx.createLinearGradient(0, -radius, 0, 0)
  sky.addColorStop(0, '#07518c')
  sky.addColorStop(0.6, '#168eca')
  sky.addColorStop(1, '#73cdf1')
  const terrain = ctx.createLinearGradient(0, 0, 0, radius)
  terrain.addColorStop(0, '#deac51')
  terrain.addColorStop(0.57, '#af7118')
  terrain.addColorStop(1, '#744615')
  ctx.fillStyle = sky
  ctx.fillRect(-faceExtent, -faceExtent, faceExtent * 2, faceExtent)
  ctx.fillStyle = terrain
  ctx.fillRect(-faceExtent, 0, faceExtent * 2, faceExtent)

  ctx.strokeStyle = '#fff9e9'
  ctx.lineWidth = 3
  line(ctx, -135, 0, 135, 0)
  ctx.fillStyle = '#fff9e9'
  for (const degrees of [-20, -15, -10, -5, 5, 10, 15, 20]) {
    const y = -degrees * PITCH_PIXELS_PER_DEGREE
    const major = degrees % 10 === 0
    const width = major ? 46 : 31
    ctx.lineWidth = major ? 2.2 : 1.4
    for (const side of [-1, 1]) {
      line(ctx, side * 15, y, side * width, y)
      if (major) text(ctx, String(Math.abs(degrees)), side * 59, y + 4.2, 12)
    }
  }
  ctx.restore()
  const vignette = ctx.createRadialGradient(-14, -14, 33, 0, 0, radius + 1)
  vignette.addColorStop(0, '#050d1400')
  vignette.addColorStop(0.85, '#050d1426')
  vignette.addColorStop(1, '#040b14d0')
  ctx.fillStyle = vignette
  ctx.fillRect(-104, -104, 208, 208)

  renderAttitudeReference(ctx, radius, roll, altitude)
  ctx.restore()
}

function renderAttitudeReference(ctx, radius, roll, altitude) {
  ctx.strokeStyle = '#ebf7fa'
  const rim = radius - 9
  for (const mark of [-45, -30, -20, -10, 0, 10, 20, 30, 45]) {
    const angle = radians(mark - 90)
    const start = rim - (mark % 30 === 0 ? 9 : 5)
    ctx.lineWidth = mark % 30 === 0 ? 2.1 : 1.4
    line(ctx, start * Math.cos(angle), start * Math.sin(angle), rim * Math.cos(angle), rim * Math.sin(angle))
  }
  ctx.save()
  ctx.rotate(radians(roll))
  trace(ctx, [[-5, -rim + 14], [0, -rim + 6], [5, -rim + 14]])
  ctx.fillStyle = '#ffd884'
  ctx.fill()
  ctx.restore()

  ctx.beginPath()
  for (const side of [-1, 1]) {
    ctx.moveTo(side * 63, -1)
    ctx.lineTo(side * 22, -1)
    ctx.lineTo(side * 15, 7)
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#191917'
  ctx.lineWidth = 8
  ctx.stroke()
  ctx.strokeStyle = '#ffdb86'
  ctx.lineWidth = 4.5
  ctx.stroke()
  ctx.strokeStyle = '#2f2519'
  ctx.lineWidth = 5
  circle(ctx, 0, 0, 4.5)
  ctx.stroke()
  ctx.strokeStyle = '#ffe5a8'
  ctx.lineWidth = 2.6
  ctx.stroke()

  ctx.beginPath()
  ctx.roundRect(-35, 61, 70, 24, 5)
  ctx.fillStyle = '#191f25'
  ctx.fill()
  ctx.lineWidth = 1.1
  ctx.strokeStyle = '#ffd98ba3'
  ctx.stroke()
  ctx.fillStyle = '#fff1cb'
  text(ctx, Math.round(altitude) + ' m', 0, 78, 15)
}

function renderSteering(ctx, art, assets, roll, pitch) {
  const { bounds: [x, y, width, height], pivot: [pivotX, pivotY] } = art.yoke
  const turn = clamp(-roll * 1.55, -13, 13)
  const pushPull = clamp(pitch, -8, 8)
  ctx.save()
  ctx.translate(x + pivotX, y + pivotY + pushPull * 1.7)
  ctx.rotate(radians(turn))
  ctx.scale(1, 1 + pushPull * 0.010)
  ctx.drawImage(assets.yoke, -pivotX, -pivotY, width, height)
  ctx.restore()

  ctx.save()
  trace(ctx, art.yokeHub)
  ctx.clip()
  sprite(ctx, assets.console, art.console)
  ctx.restore()
}

function renderGauge(ctx, gauge, needle, definition, amount) {
  const { center: [x, y], radius, channel } = gauge
  ctx.save()
  circle(ctx, x, y, radius + 1)
  ctx.clip()
  const face = ctx.createRadialGradient(x - 4, y - 7, 2, x, y, radius + 1)
  face.addColorStop(0, '#354150')
  face.addColorStop(0.76, '#222a35')
  face.addColorStop(1, '#12161d')
  ctx.fillStyle = face
  ctx.fillRect(x - 45, y - 45, 90, 90)
  ctx.lineCap = 'round'
  for (let i = 0; i <= 12; i++) {
    const angle = radians(140 + i * (260 / 12))
    const sin = Math.sin(angle)
    const cos = Math.cos(angle)
    const inner = i % 3 === 0 ? 30.5 : 34.5
    ctx.lineWidth = i % 3 === 0 ? 2.25 : 1.4
    ctx.strokeStyle = i >= 11 ? '#ed9f5c' : '#e4e9eb'
    line(ctx, x + inner * cos, y + inner * sin, x + 38.2 * cos, y + 38.2 * sin)
  }
  ctx.fillStyle = '#c5d2dd'
  text(ctx, channel, x, y + 25, 9)
  ctx.translate(x, y)
  const angle = 140 + 260 * clamp(amount, 0, 1)
  ctx.rotate(radians(angle - definition.angle))
  const [pivotX, pivotY] = definition.pivot
  ctx.drawImage(needle, -pivotX, -pivotY)
  ctx.restore()
}

function renderLamps(ctx, art, strip, power) {
  for (const [index, [x, y, width, height]] of art.lamps.entries()) {
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(x, y, width, height, 5)
    ctx.clip()
    const on = clamp(power * 3 / 100 - index, 0, 1)
    ctx.filter = 'brightness(' + (0.32 + 0.76 * on) + ')'
    sprite(ctx, strip, art.lampStrip)
    ctx.restore()
  }
}

function drawTape(ctx, value, spacing, step, x, invert) {
  const side = invert ? -1 : 1
  ctx.save()
  ctx.beginPath()
  ctx.rect(x - 42, 204, 84, 137)
  ctx.clip()
  line(ctx, x, 204, x, 341)
  const tickOffset = value % step / step * spacing
  for (let i = -5; i <= 4; i++) {
    const y = 272 + i * spacing + tickOffset
    const wide = (Math.floor(value / step) + i) % 2 === 0
    line(ctx, x, y, x + side * (wide ? 18 : 10), y)
  }
  ctx.restore()
  trace(ctx, [[x - side * 10, 272], [x - side * 24, 264], [x - side * 24, 280]])
  ctx.stroke()
}

function renderHud(ctx, flight, roll, alpha) {
  if (alpha <= 0) return
  ctx.save()
  ctx.globalAlpha = alpha
  const glassFrame = [[549, 143], [1123, 143], [1094, 441], [578, 441]]
  trace(ctx, glassFrame)
  ctx.fillStyle = '#0c394d17'
  ctx.fill()
  ctx.strokeStyle = '#dcf2dd51'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.strokeStyle = '#204041bf'
  ctx.lineWidth = 5
  line(ctx, 577, 432, 577, 454)
  line(ctx, 1095, 432, 1095, 454)

  ctx.strokeStyle = green
  ctx.fillStyle = green
  ctx.shadowColor = '#133f3ddd'
  ctx.shadowBlur = 4
  ctx.lineWidth = 2.5
  const speed = Math.round(flight.speed)
  const altitude = Math.round(flight.altitude)
  drawTape(ctx, flight.speed, 18, 10, 642, false)
  drawTape(ctx, flight.altitude, 18, 10, 1030, true)
  text(ctx, String(speed).padStart(3, '0'), 642, 191, 28)
  text(ctx, String(altitude).padStart(3, '0'), 1030, 191, 28)
  text(ctx, 'KM/H', 642, 160, 13)
  text(ctx, 'ALT M', 1030, 160, 13)

  ctx.save()
  trace(ctx, glassFrame)
  ctx.clip()
  ctx.translate(836, 271)
  ctx.rotate(radians(roll))
  ctx.translate(0, flight.pitch * PITCH_PIXELS_PER_DEGREE)
  ctx.globalAlpha = alpha * 0.7
  for (const y of [-48, 0, 48]) {
    const width = y === 0 ? 111 : 68
    line(ctx, -width, y, -39, y)
    line(ctx, 39, y, width, y)
    if (y !== 0) {
      const tail = y < 0 ? 8 : -8
      line(ctx, -width, y, -width, y + tail)
      line(ctx, width, y, width, y + tail)
    }
  }
  ctx.restore()

  for (const side of [-1, 1]) {
    line(ctx, 836 + side * 44, 271, 836 + side * 19, 271)
    line(ctx, 836 + side * 19, 271, 836 + side * 13, 279)
  }
  circle(ctx, 836, 271, 3.75)
  ctx.stroke()

  const compassY = 394
  text(ctx, String(Math.round(flight.heading) % 360).padStart(3, '0') + '°', 836, 369, 22)
  line(ctx, 727, compassY, 945, compassY)
  ctx.save()
  ctx.beginPath()
  ctx.rect(728, 375, 216, 22)
  ctx.clip()
  const headingOffset = (flight.heading % 5) * 4.4
  const headingMark = Math.floor(flight.heading / 5)
  for (let i = -5; i <= 6; i++) {
    const x = 836 + i * 22 - headingOffset
    line(ctx, x, compassY, x, compassY - ((headingMark + i) % 2 === 0 ? 12 : 7))
  }
  ctx.restore()
  trace(ctx, [[829, 408], [843, 408], [836, 400]])
  ctx.stroke()
  ctx.restore()
}

export function drawCockpit(ctx, art, assets, flight, entry, ranges, viewportHeight, hudScale) {
  const [width, height] = art.size
  const extraHeight = viewportHeight - height
  ctx.clearRect(0, 0, width, viewportHeight)

  if (entry.canopy > 0) {
    ctx.save()
    ctx.translate(0, -art.canopy.bounds[3] * (1 - entry.canopy))
    sprite(ctx, assets.canopy, art.canopy)
    ctx.restore()
  }

  if (entry.console > 0) {
    ctx.save()
    ctx.translate(0, extraHeight + art.console.bounds[3] * (1 - entry.console))
    renderRadar(ctx, art, assets, flight)
    renderAttitude(ctx, art.attitude, entry.roll, flight.pitch, flight.altitude)
    const speedRatio = flight.speed / ranges.speed
    renderSystems(ctx, art, assets, flight, speedRatio)
    const readings = [speedRatio, flight.thrust / 100, flight.altitude / ranges.altitude, (flight.climb + ranges.climb) / (2 * ranges.climb)]
    for (const [index, gauge] of art.gauges.entries()) {
      renderGauge(ctx, gauge, assets.needle, art.needle, readings[index])
    }
    sprite(ctx, assets.console, art.console)
    renderLamps(ctx, art, assets.lampStrip, flight.thrust)
    renderSteering(ctx, art, assets, entry.roll, flight.pitch)
    ctx.restore()
  }

  ctx.save()
  // Enlarge the HUD about its aiming mark on small screens to keep the readouts legible.
  const hudCenterY = 271
  ctx.translate(width / 2, hudCenterY + extraHeight / 2)
  ctx.scale(hudScale, hudScale)
  ctx.translate(-width / 2, -hudCenterY)
  renderHud(ctx, flight, entry.roll, entry.hud)
  ctx.restore()
}
