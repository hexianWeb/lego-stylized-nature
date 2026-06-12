export function createTerrainPanel(debug, config, onRegenerate) {
    const folder = debug.addFolder({ title: 'Terrain', expanded: false })
    if (!folder) {
        return
    }

    folder.addBinding(config, 'seed', { label: 'Seed' }).on('change', onRegenerate)
    folder.addBinding(config.terrain, 'maxHeight', { min: 4, max: 32, step: 1 }).on('change', onRegenerate)
    folder.addBinding(config.terrain, 'waterLevel', { min: 0, max: 12, step: 1 }).on('change', onRegenerate)
    folder.addBinding(config.terrain, 'noiseScale', { min: 8, max: 80, step: 1 }).on('change', onRegenerate)
    folder.addBinding(config.terrain, 'seaClip', { min: 0, max: 0.7, step: 0.01 }).on('change', onRegenerate)
}
