export default class HeightField {
  constructor(width, depth) {
    this.width = width
    this.depth = depth
    this.values = Array.from({ length: depth }, () => Array.from({ length: width }, () => 0))
  }

  get(x, z) {
    return this.values[z]?.[x] ?? 0
  }

  set(x, z, value) {
    if (this.values[z]) {
      this.values[z][x] = value
    }
  }

  getSlope(x, z) {
    const center = this.get(x, z)
    const neighbors = [
      this.get(x + 1, z),
      this.get(x - 1, z),
      this.get(x, z + 1),
      this.get(x, z - 1)
    ]
    return Math.max(...neighbors.map((height) => Math.abs(center - height)))
  }
}
