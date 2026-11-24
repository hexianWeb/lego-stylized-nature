import { BufferAttribute, Color, InstancedBufferAttribute } from 'three/webgpu'

const layers = ['surface', 'subsurface', 'deep']
const sampleDepths = [0, 1, 3]
const componentsPerTile = layers.length * 3

export function createPlaceholderColorAttributes(mesh, count) {
  const Attribute = mesh.isInstancedMesh ? InstancedBufferAttribute : BufferAttribute
  const surface = new Attribute(new Float32Array(count * 3), 3)
  // Pack the original top coordinate (mesh) or box height (instance) in W.
  const subsurface = new Attribute(new Float32Array(count * 4), 4)
  const deep = new Attribute(new Float32Array(count * 3), 3)
  if (mesh.isInstancedMesh) {
    mesh.instanceColor = surface
  }
  else {
    mesh.geometry.setAttribute('color', surface)
  }
  mesh.geometry.setAttribute('subsurfaceColor', subsurface)
  mesh.geometry.setAttribute('deepColor', deep)
  return [surface, subsurface, deep]
}

export function samplePlaceholderPalette(resolver, tiles, palette = new Float32Array(tiles.length * componentsPerTile)) {
  const color = new Color()
  const sample = {}
  for (let i = 0; i < tiles.length; i++) {
    const source = tiles[i].sample
    Object.assign(sample, source)
    for (let layer = 0; layer < layers.length; layer++) {
      sample.layer = layers[layer]
      sample.y = Math.max(0, source.y - sampleDepths[layer])
      resolver.resolveColor(sample, color).toArray(palette, i * componentsPerTile + layer * 3)
    }
  }
  return palette
}

export function writePlaceholderColors(owner, tiles, palette, attributes, { start = 0, offsets } = {}) {
  const color = new Color()
  const subsurface = attributes[1]
  const instanced = subsurface.isInstancedBufferAttribute
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i]
    const haze = owner.hazeAt(tile.x, tile.z)
    const first = start + (offsets?.[i] ?? i)
    const end = start + (offsets?.[i + 1] ?? (i + 1))
    for (let layer = 0; layer < layers.length; layer++) {
      const attribute = attributes[layer]
      color.fromArray(palette, i * componentsPerTile + layer * 3).lerp(owner.background, haze)
      for (let j = first; j < end; j++) color.toArray(attribute.array, j * attribute.itemSize)
    }
    const height = instanced ? tile.sizeY : tile.top
    for (let j = first; j < end; j++) subsurface.setW(j, height)
  }
}
