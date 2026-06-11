export default class SurfaceClassifier {
  constructor(config) {
    this.config = config
  }

  classify(heightField) {
    const { width, depth, waterLevel } = this.config.terrain
    const cells = []

    for (let z = 0; z < depth; z++) {
      const row = []
      for (let x = 0; x < width; x++) {
        const height = heightField.get(x, z)
        const slope = heightField.getSlope(x, z)
        const isWater = height <= waterLevel
        const isShore = !isWater && height <= waterLevel + 1
        row.push({ x, z, height, slope, isWater, isShore })
      }
      cells.push(row)
    }

    return cells
  }
}
