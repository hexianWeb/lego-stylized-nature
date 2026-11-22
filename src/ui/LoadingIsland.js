const WIDTH = 540
const HEIGHT = 390
const TILE_HALF_WIDTH = 38.75
const TILE_HALF_HEIGHT = 19.375

const WATER = [
  [231, 204], [309, 204],
  [114, 223], [192, 223], [270, 223], [348, 223], [426, 223, true],
  [75, 242], [153, 242], [231, 242, true], [309, 242, true], [387, 242, true], [465, 242],
  [114, 261, true], [192, 261], [270, 261], [348, 261], [426, 261],
  [231, 281], [309, 281], [387, 281, true],
]

const SHORE = [
  [114, 176], [192, 176], [270, 176], [348, 176],
  [75, 195], [153, 195], [387, 195, true], [465, 195],
]

const HILLS = [
  [309, 58, 3], [153, 72, 1], [231, 72, 1], [270, 78, 3], [348, 78, 3],
  [114, 91, 1], [192, 91, 1], [387, 97, 2], [309, 98, 3], [231, 102, 2],
  [270, 108, 3], [75, 110, 1], [153, 110, 1], [426, 110, 1],
  [348, 120, 2], [114, 129, 1], [192, 129, 1], [426, 130, 1],
  [231, 141, 2], [309, 141, 2], [387, 141, 2],
  [75, 149, 1], [153, 149, 1], [465, 149, 1], [426, 168, 1],
]

const TREES = [
  [270, 106, 1.05], [387, 93, 0.96], [192, 94, 0.91],
  [270, 84, 0.93], [387, 135, 0.79], [114, 101, 0.71], [465, 153, 0.67],
]

const FLOWERS = [
  [347, 103, '#ff8564'], [191, 125, '#ffe681'],
  [307, 132, '#ffec99'], [151, 142, '#fffce3'],
]

const VEGETATION = [
  ...TREES.map(([x, y, size], index) => ({ x, y, size, start: 0.61 + index * 0.037 })),
  ...FLOWERS.map(([x, y, color], index) => ({ x, y, color, start: 0.76 + index * 0.028 })),
].sort((a, b) => a.y - b.y)

const LAKE_PALETTE = {
  top: '#6bdbe6', bottom: '#45b6d1', left: '#3096bc', right: '#267da4', edge: '#b1e9e9',
}
const DEEP_PALETTE = {
  top: '#54c3dd', bottom: '#3ba5c7', left: '#2d88b0', right: '#24749e', edge: '#98ddeb',
}
const SAND_PALETTE = {
  top: '#ffe9ae', bottom: '#eace8f', left: '#ccb581', right: '#b9a371', edge: '#ffedbf',
}
const BED_PALETTE = {
  top: '#a69a72', bottom: '#98906c', left: '#797458', right: '#69674f', edge: '#beb194',
}
const SOIL_PALETTE = {
  top: '#ba885a', bottom: '#9d6b44', left: '#896345', right: '#6c4d37', edge: '#d4ae83',
}
const GRASS_PALETTE = {
  top: '#a1cc66', bottom: '#77ac45', left: '#61933c', right: '#4f7b35', edge: '#b7d980',
}
const GRASS_SHADE_PALETTE = {
  top: '#94c45d', bottom: '#6ba53f', left: '#558638', right: '#467033', edge: '#a1cc6c',
}
const TREE_PALETTE = {
  top: '#59995c', bottom: '#3a7b4a', left: '#317349', right: '#255b3e', edge: '#79ab71',
}

const clamp = value => Math.min(1, Math.max(0, value))
const phase = (progress, start, span) => clamp((progress - start) / span)
const settle = amount => 1 - (1 - amount) ** 3

function polygon(context, points, fill, stroke) {
  context.beginPath()
  context.moveTo(points[0], points[1])
  for (let index = 2; index < points.length; index += 2) {
    context.lineTo(points[index], points[index + 1])
  }
  context.closePath()
  if (fill) {
    context.fillStyle = fill
    context.fill()
  }
  if (stroke) {
    context.strokeStyle = stroke
    context.stroke()
  }
}

function block(context, x, y, thickness, palette, halfWidth = TILE_HALF_WIDTH, halfHeight = TILE_HALF_HEIGHT) {
  const left = x - halfWidth
  const right = x + halfWidth
  const far = y - halfHeight
  const near = y + halfHeight

  polygon(context, [left, y, x, near, x, near + thickness, left, y + thickness], palette.left)
  polygon(context, [x, near, right, y, right, y + thickness, x, near + thickness], palette.right)

  const top = context.createLinearGradient(left, far, right, near)
  top.addColorStop(0, palette.top)
  top.addColorStop(1, palette.bottom)
  polygon(context, [x, far, right, y, x, near, left, y], top, palette.edge)
}

function oval(context, x, y, radiusX, radiusY, fill) {
  context.beginPath()
  context.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2)
  context.fillStyle = fill
  context.fill()
}

function stud(context, x, y, size, top, side) {
  oval(context, x, y + 1.4, size, size * 0.50, side)
  oval(context, x, y - 1, size, size * 0.49, top)
}

function fourStuds(context, x, y, top, side) {
  stud(context, x, y - 9.3, 7.5, top, side)
  stud(context, x - 18.5, y, 7.5, top, side)
  stud(context, x + 18.5, y, 7.5, top, side)
  stud(context, x, y + 9.3, 7.5, top, side)
}

function ground(context) {
  context.save()
  context.translate(270, 297)
  context.scale(1, 0.49)
  const shadow = context.createRadialGradient(0, 0, 3, 0, 0, 250)
  shadow.addColorStop(0, '#6d9a8d58')
  shadow.addColorStop(0.5, '#82ada030')
  shadow.addColorStop(0.90, '#92b6aa00')
  oval(context, 0, 0, 250, 250, shadow)
  const outline = context.createLinearGradient(0, -250, 0, 250)
  outline.addColorStop(0, '#6e9a8c2b')
  outline.addColorStop(0.7, '#6e9a8c29')
  outline.addColorStop(0.86, '#6e9a8c00')
  context.lineWidth = 1.3
  polygon(context, [0, -250, 247, 0, 0, 250, -247, 0], null, outline)
  polygon(context, [0, -216, 213, 0, 0, 216, -213, 0], null, outline)
  context.beginPath()
  context.strokeStyle = '#6e9a8c30'
  context.moveTo(-270, 0)
  context.lineTo(-258, 0)
  context.moveTo(259, 0)
  context.lineTo(270, 0)
  context.stroke()
  context.restore()
}

function water(context, progress) {
  for (const [index, [x, y, hasStud]] of WATER.entries()) {
    const entry = phase(progress, 0.10 + ((index * 9) % 19) * 0.005, 0.13)
    if (!entry) continue
    const landingY = y - (1 - settle(entry)) * 49
    context.globalAlpha = Math.min(1, entry * 2)
    block(context, x, landingY, 9, hasStud || index % 4 === 3 ? DEEP_PALETTE : LAKE_PALETTE)
    if (hasStud) stud(context, x, landingY, 10.5, '#65c3db', '#379bbb')
    if (!hasStud && index % 3 !== 0) {
      context.beginPath()
      context.moveTo(x - 12, landingY - 4)
      context.lineTo(x - 1, landingY + 1.5)
      context.strokeStyle = '#b6f0f02c'
      context.stroke()
    }
  }
  context.globalAlpha = 1
}

function shore(context, progress) {
  for (const [index, [x, y, oneStud]] of SHORE.entries()) {
    const bedEntry = phase(progress, 0.18 + index * 0.006, 0.12)
    if (bedEntry) {
      context.globalAlpha = Math.min(1, bedEntry * 2)
      block(context, x, y + 7 - (1 - settle(bedEntry)) * 36, 8, BED_PALETTE)
    }
    const entry = phase(progress, 0.32 + index * 0.008, 0.10)
    if (!entry) continue
    const landingY = y - (1 - settle(entry)) * 39
    context.globalAlpha = Math.min(1, entry * 2)
    block(context, x, landingY, 8, SAND_PALETTE)
    if (oneStud) stud(context, x, landingY, 10.5, '#ffe4ab', '#ccac72')
    else fourStuds(context, x, landingY, '#ffe6ac', '#cdb075')
  }
  context.globalAlpha = 1
}

function hills(context, progress) {
  for (const [index, [x, y, height]] of HILLS.entries()) {
    const entry = phase(progress, 0.105 + ((index * 7) % 23) * 0.005, 0.14)
    if (!entry) continue
    const landingY = y + 7 - (1 - settle(entry)) * 66
    context.globalAlpha = Math.min(1, entry * 2)
    block(context, x, landingY + 3 + height * 4, 5, BED_PALETTE)
    block(context, x, landingY, 4 + height * 4, SOIL_PALETTE)

    if (height > 1) {
      const seam = landingY + 5 + (height - 2) * 4
      context.beginPath()
      context.moveTo(x - TILE_HALF_WIDTH, seam)
      context.lineTo(x, seam + TILE_HALF_HEIGHT)
      context.lineTo(x + TILE_HALF_WIDTH, seam)
      context.strokeStyle = '#d2a88067'
      context.stroke()
    }

    const capEntry = phase(progress, 0.39 + ((index * 5) % 23) * 0.0048, 0.115)
    if (!capEntry) continue
    context.globalAlpha = Math.min(1, capEntry * 2)
    const capY = y - (1 - settle(capEntry)) * 42
    const shaded = index % 5 === 0 || index % 5 === 3
    block(context, x, capY, 7, shaded ? GRASS_SHADE_PALETTE : GRASS_PALETTE)
    fourStuds(context, x, capY, shaded ? '#9ac65c' : '#acd46b', '#5f913c')
  }
  context.globalAlpha = 1
}

function vegetation(context, progress) {
  for (const { x, y, size, color, start } of VEGETATION) {
    const entry = phase(progress, start, 0.09)
    if (!entry) continue
    const growth = settle(entry)
    context.save()
    context.globalAlpha = Math.min(1, entry * 1.75)
    context.translate(x, y)
    context.scale(growth, growth)
    if (color) {
      oval(context, 0, 1, 6, 2, '#3c783539')
      oval(context, -3.4, 0, 3, 1.8, color)
      oval(context, 3.4, 0, 3, 1.8, color)
      oval(context, 0, -2.65, 2.1, 2.7, color)
      oval(context, 0, 2.1, 2.1, 2.7, color)
      oval(context, 0, 0, 1.6, 1.25, '#f3c64e')
    }
    else {
      context.scale(size, size)
      oval(context, 4, 0, 29, 11, '#32694044')
      block(context, 0, -8, 7, SOIL_PALETTE, 8, 4)
      const tiers = [34, 25, 17, 9]
      for (const [index, width] of tiers.entries()) {
        block(context, 0, -24 - index * 13, 12, TREE_PALETTE, width, width * 0.5)
      }
      stud(context, 0, -65, 4.8, '#7baa60', '#549252')
    }
    context.restore()
  }
}

function aircraft(context, progress, flyout) {
  const entry = phase(progress, 0.92, 0.08)
  if (!entry) return
  const travel = entry * 0.68 + flyout * 0.42
  const x = -112 + 720 * travel
  const y = 205 - 165 * travel

  context.save()
  context.translate(x, y)
  context.rotate(-0.28)
  context.lineJoin = 'round'
  for (const offset of [-17, 19]) {
    const trail = context.createLinearGradient(-176, 0, -15, 0)
    trail.addColorStop(0, '#ffffff00')
    trail.addColorStop(1, '#ffffffba')
    context.strokeStyle = trail
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(-176, offset + (offset > 0 ? 4 : -3))
    context.quadraticCurveTo(-70, offset + 4, -18, offset)
    context.stroke()
  }

  context.lineWidth = 0.9
  const wingEdge = '#9bae9e'
  polygon(context, [10, -2, -10, -35, -21, -36, -16, -8, -23, -3, -25, 4, -14, 7, -18, 38, -7, 39, 10, 4], '#f5f2df', wingEdge)
  polygon(context, [-15, -30, -21, -36, -16, -36, -12, -29], '#ff973f')
  polygon(context, [-16, 31, -10, 31, -7, 39, -16, 39], '#ff973f')
  polygon(context, [-23, -1, -30, -13, -35, -12, -34, 13, -29, 14, -21, 2], '#fffbea', wingEdge)
  polygon(context, [-34, -2, -23, -6, 14, -7, 27, -5, 34, 0, 26, 5, 14, 7, -21, 5, -34, 2], '#fffdf0', wingEdge)
  polygon(context, [9, -5, 20, -4, 22, 0, 19, 4, 8, 4], '#173846')
  polygon(context, [24, -5, 30, -4, 34, 0, 28, 4, 23, 4], '#fc9f43')
  context.restore()
}

export default class LoadingIsland {
  constructor(canvas) {
    this.canvas = canvas
    this.context = canvas.getContext('2d')
    this.progress = -1
    this.flyout = -1
  }

  draw(progress, flyout = 0) {
    const { canvas, context } = this
    if (!context) return
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2)
    const width = Math.round((canvas.clientWidth || WIDTH) * dpr)
    const height = Math.round((canvas.clientHeight || HEIGHT) * dpr)
    const resized = width !== canvas.width || height !== canvas.height
    if (!resized && progress === this.progress && flyout === this.flyout) return
    if (resized) {
      canvas.width = width
      canvas.height = height
    }
    this.progress = clamp(progress)
    this.flyout = clamp(flyout)

    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, width, height)
    const scale = Math.min(width / WIDTH, height / HEIGHT)
    context.setTransform(scale, 0, 0, scale, (width - WIDTH * scale) / 2, (height - HEIGHT * scale) / 2)
    context.translate(0, -18)
    context.lineJoin = 'round'
    context.lineWidth = 0.75
    ground(context)
    water(context, this.progress)
    shore(context, this.progress)
    hills(context, this.progress)
    vegetation(context, this.progress)
    aircraft(context, this.progress, this.flyout)
  }
}
