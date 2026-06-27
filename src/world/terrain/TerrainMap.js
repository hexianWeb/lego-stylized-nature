export default class TerrainMap {
  constructor({
    heightField,
    biomeCells,
    surfaceCells,
    origin = { x: 0, z: 0 },
    visibleSize = null,
    halo = 0
  }) {
    this.heightField = heightField
    this.biomeCells = biomeCells
    this.surfaceCells = surfaceCells
    this.origin = origin
    this.halo = halo
    this.visibleSize = visibleSize ?? heightField.width - halo * 2
  }

  getHeight(x, z) {
    return this.heightField.get(x, z)
  }

  getBiomeCell(x, z) {
    return this.biomeCells[z]?.[x]
  }

  getSurfaceCell(x, z) {
    return this.surfaceCells[z]?.[x]
  }
}
