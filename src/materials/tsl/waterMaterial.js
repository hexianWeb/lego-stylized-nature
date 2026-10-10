import { createLiquidMaterial } from './liquidMaterial.js'

const WATER_COLORS = {
  darkColor: '#0757A6',
  midColor: '#168FD2',
  lightColor: '#42DDEB'
}

export function createWaterMaterial(waterConfig = {}, noiseTexture = null, sharedUniforms = null) {
  return createLiquidMaterial({
    ...WATER_COLORS,
    ...waterConfig
  }, noiseTexture, sharedUniforms)
}
