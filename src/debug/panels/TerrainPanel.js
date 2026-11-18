export function createTerrainPanel(debug, config, onRegenerate) {
  const folder = debug.addFolder({ title: 'Terrain', expanded: false })
  if (!folder) {
    return
  }

  folder.addBinding(config, 'seed', { label: 'Seed' }).on('change', onRegenerate)
  folder.addBinding(config.terrain, 'maxHeight', { min: 4, max: 128, step: 1 }).on('change', onRegenerate)
  folder.addBinding(config.terrain, 'waterLevel', { min: 0, max: 12, step: 1 }).on('change', onRegenerate)
  folder.addBinding(config.terrain, 'noiseScale', { min: 8, max: 80, step: 1 }).on('change', onRegenerate)

  const lod = folder.addFolder({ title: 'Brick LOD', expanded: false })
  const settings = config.terrain.brickLOD
  lod.addBinding(settings, 'enabled', { label: 'Enabled' })
  lod.addBinding(settings, 'fullDetailPixels', { min: 4, max: 24, step: 0.5, label: 'Full stud px' })
  lod.addBinding(settings, 'studPixels', { min: 1, max: 8, step: 0.5, label: 'Min stud px' })
  lod.addBinding(settings, 'hysteresis', { min: 0, max: 0.4, step: 0.01, label: 'Hysteresis' })
}
