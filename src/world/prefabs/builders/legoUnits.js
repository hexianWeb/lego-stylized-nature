import { worldConfig } from '../../WorldConfig.js'

const { cellSize, layerHeight } = worldConfig.terrain

export const STUD_PITCH = cellSize / 2
export const PLATE_HEIGHT = layerHeight / 3

// Measured from legoBlock2x2.glb. The visible brick top is about 0.006 above
// the prefab origin and the stud top about 0.025; bases must cover this radius.
export const STUD_RADIUS = 0.035
export const STUD_HEIGHT = 0.019

// Center each prefab on one of the terrain brick's four studs.
export const PREFAB_ORIGIN = [-STUD_PITCH / 2, 0, STUD_PITCH / 2]
