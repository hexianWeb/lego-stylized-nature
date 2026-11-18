import autumnForest from './definitions/autumnForest.js'
import desert from './definitions/desert.js'
import forest from './definitions/forest.js'
import meadow from './definitions/meadow.js'
import snowForest from './definitions/snowForest.js'
import volcano from './definitions/volcano.js'
import wetland from './definitions/wetland.js'

export default class BiomeRegistry {
  constructor(definitions = [forest, autumnForest, desert, volcano, snowForest, meadow, wetland]) {
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
