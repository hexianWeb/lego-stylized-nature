import { clamp, drawCockpit } from './cockpit-art.mjs'

const manifestUrl = new URL('./assets/sprites.json', import.meta.url)
const spriteUrls = {
  canopy: new URL('./assets/canopy.png', import.meta.url),
  console: new URL('./assets/console-frame.png', import.meta.url),
  radarTerrain: new URL('./assets/radar-terrain.png', import.meta.url),
  plane: new URL('./assets/plane-icon.png', import.meta.url),
  needle: new URL('./assets/needle.png', import.meta.url),
  lampStrip: new URL('./assets/power-lamps.png', import.meta.url),
  yoke: new URL('./assets/yoke.png', import.meta.url),
}

const defaultRanges = { speed: 240, altitude: 260, climb: 24 }
const defaultRates = { speed: 32, thrust: 22, altitude: 16, climb: 48 }
const fullTurn = 2 * Math.PI

/**
 * @typedef {object} FlightTelemetry
 * @property {number} speedKmh
 * @property {number} thrustPercent
 * @property {number} altitudeM
 * @property {number} verticalSpeedMps
 * @property {number} pitchDeg Nose-up is positive.
 * @property {number} horizonRollDeg Clockwise on screen is positive.
 * @property {number} headingDeg Compass heading, north at 0°.
 */

async function loadArt() {
  const response = await fetch(manifestUrl)
  if (!response.ok) throw new Error('Could not load cockpit sprite manifest: ' + response.status)
  const art = await response.json()
  const sprites = await Promise.all(Object.entries(spriteUrls).map(async ([name, url]) => {
    const image = new Image()
    image.src = url.href
    await image.decode()
    const [, , width, height] = art[name].bounds
    if (image.naturalWidth !== width || image.naturalHeight !== height) {
      throw new Error('Unexpected cockpit sprite size: ' + name)
    }
    return [name, image]
  }))
  return { art, assets: Object.fromEntries(sprites) }
}

function approach(current, target, rate, dt) {
  const distance = target - current
  const step = rate * dt
  return Math.abs(distance) <= step ? target : current + Math.sign(distance) * step
}

function ramp(time, delay, duration) {
  const t = clamp((time - delay) / duration, 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Create a Canvas 2D overlay. Call render from the host project's frame loop.
 * @param {HTMLCanvasElement} canvas
 * @param {{ animateEntry?: boolean, showHud?: boolean,
 *   gaugeRanges?: Partial<typeof defaultRanges>,
 *   needleRates?: Partial<typeof defaultRates> }} [options]
 */
export async function createCockpitOverlay(canvas, {
  animateEntry = true,
  showHud = true,
  gaugeRanges = {},
  needleRates = {},
} = {}) {
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) throw new Error('Could not create a cockpit Canvas 2D context')
  const { art, assets } = await loadArt()
  const [width, height] = art.size
  const ranges = { ...defaultRanges, ...gaugeRanges }
  const rates = { ...defaultRates, ...needleRates }
  if ([...Object.values(ranges), ...Object.values(rates)].some(value => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError('Cockpit gauge ranges and needle rates must be positive finite numbers')
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const flight = { speed: 0, thrust: 0, altitude: 0, climb: 0, pitch: 0, heading: 0, radarAngle: -0.55 }
  const entry = { console: 1, canopy: 1, hud: 1, roll: 0 }
  let elapsed = 0
  let initialized = false

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const pixelWidth = Math.max(1, Math.round(canvas.clientWidth * dpr))
    const pixelHeight = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (canvas.width === pixelWidth && canvas.height === pixelHeight) return
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }

  function clear() {
    ctx.resetTransform()
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  /**
   * @param {number} dt Seconds since the previous render.
   * @param {FlightTelemetry} telemetry
   */
  function render(dt, telemetry) {
    resize()
    const scaleX = canvas.width / width
    // Keep the canopy and dashboard at their original proportions on taller screens.
    const viewportHeight = Math.max(height, canvas.height / scaleX)
    ctx.setTransform(scaleX, 0, 0, canvas.height / viewportHeight, 0, 0)
    const hudScale = clamp(720 / canvas.clientWidth, 1, Math.min(2, viewportHeight / height))
    const step = Number.isFinite(dt) ? clamp(dt, 0, 0.05) : 0
    const speed = Math.max(0, telemetry.speedKmh)
    const thrust = clamp(telemetry.thrustPercent, 0, 100)

    if (!initialized) {
      flight.speed = speed
      flight.thrust = thrust
      flight.altitude = telemetry.altitudeM
      flight.climb = telemetry.verticalSpeedMps
      initialized = true
    } else {
      flight.speed = approach(flight.speed, speed, rates.speed, step)
      flight.thrust = approach(flight.thrust, thrust, rates.thrust, step)
      flight.altitude = approach(flight.altitude, telemetry.altitudeM, rates.altitude, step)
      flight.climb = approach(flight.climb, telemetry.verticalSpeedMps, rates.climb, step)
    }

    flight.pitch = telemetry.pitchDeg
    flight.heading = ((telemetry.headingDeg % 360) + 360) % 360

    if (!reducedMotion.matches) {
      const speedRatio = clamp(flight.speed / ranges.speed, 0, 1)
      flight.radarAngle = (flight.radarAngle + step * (0.9 + 3 * speedRatio)) % fullTurn
    }

    elapsed += step
    const time = animateEntry && !reducedMotion.matches ? elapsed : 2
    entry.console = ramp(time, 0.15, 0.8)
    entry.canopy = ramp(time, 0.43, 0.69)
    entry.hud = showHud ? ramp(time, 0.78, 0.57) : 0
    entry.roll = telemetry.horizonRollDeg
    drawCockpit(ctx, art, assets, flight, entry, ranges, viewportHeight, hudScale)
  }

  function reset() {
    clear()
    elapsed = 0
    initialized = false
    flight.radarAngle = -0.55
  }

  return { render, reset }
}
