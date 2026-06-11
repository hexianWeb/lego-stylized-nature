export default class TerrainMap {
  constructor({ heightField, biomeCells, surfaceCells }) {
    this.heightField = heightField
    this.biomeCells = biomeCells
    this.surfaceCells = surfaceCells
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
