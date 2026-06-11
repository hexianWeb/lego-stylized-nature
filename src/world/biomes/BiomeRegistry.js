import forest from './definitions/forest.js'
import autumnForest from './definitions/autumnForest.js'
import desert from './definitions/desert.js'
import volcano from './definitions/volcano.js'

export default class BiomeRegistry {
  constructor(definitions = [forest, autumnForest, desert, volcano]) {
    this.definitions = new Map()
    for (const biome of definitions) {
      this.definitions.set(biome.id, biome)
    }
  }

  get(id) {
    return this.definitions.get(id) ?? this.definitions.get('forest')
  }

  getAll() {
    return [...this.definitions.values()]
  }
}
