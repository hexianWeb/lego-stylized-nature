import { createLiquidMaterial } from './liquidMaterial.js'

const LAVA_COLORS = {
  darkColor: '#C2410C',
  midColor: '#F15A24',
  lightColor: '#FFB020'
}

export function createLavaMaterial(lavaConfig = {}, noiseTexture = null, sharedUniforms = null) {
  return createLiquidMaterial({
    ...lavaConfig,
    darkColor: lavaConfig.darkColor ?? LAVA_COLORS.darkColor,
    midColor: lavaConfig.midColor ?? LAVA_COLORS.midColor,
    lightColor: lavaConfig.lightColor ?? LAVA_COLORS.lightColor
  }, noiseTexture, sharedUniforms)
}
