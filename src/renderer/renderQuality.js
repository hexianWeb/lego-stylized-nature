export const DESKTOP_QUALITY = Object.freeze({
  name: 'desktop',
  maxPixelRatio: 2,
  maxGeometryPixelRatio: Infinity,
  supersamplePixelBudget: Infinity,
  antialias: true,
  postProcessing: true,
  shadowMapSize: 2048,
})

const MOBILE_QUALITY = Object.freeze({
  name: 'mobile',
  maxPixelRatio: 1.5,
  maxGeometryPixelRatio: 1,
  supersamplePixelBudget: 1_000_000,
  antialias: true,
  postProcessing: false,
  shadowMapSize: 1024,
})

// Spend spare pixels on reconstruction without going below the original 1x on tablets.
export function getRenderPixelRatio(quality, { width, height }, devicePixelRatio) {
  const budgetRatio = Math.sqrt(quality.supersamplePixelBudget / Math.max(1, width * height))
  return Math.min(devicePixelRatio || 1, quality.maxPixelRatio, Math.max(1, budgetRatio))
}

// Select before creating the renderer: MSAA is a construction-time setting.
// Use the same primary-pointer signal as the flight joystick, including in landscape.
export function selectRenderQuality(browser = globalThis.window) {
  const requested = new URLSearchParams(browser?.location?.search).get('quality')
  if (requested === 'desktop') return DESKTOP_QUALITY
  if (requested === 'mobile') return MOBILE_QUALITY
  return browser?.matchMedia?.('(pointer: coarse)').matches ? MOBILE_QUALITY : DESKTOP_QUALITY
}
