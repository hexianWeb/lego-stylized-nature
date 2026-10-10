export function createBiomePanel(debug, config, onRegenerate) {
    const folder = debug.addFolder({ title: 'Biomes', expanded: false })
    if (!folder) {
        return
    }

    const biomes = config.biomes
    folder.addBinding(biomes, 'cellSize', { min: 32, max: 512, step: 1 }).on('change', onRegenerate)
    folder.addBinding(biomes, 'jitter', { min: 0, max: 1, step: 0.01 }).on('change', onRegenerate)
    folder.addBinding(biomes, 'blendWidth', { min: 1, max: 192, step: 1 }).on('change', onRegenerate)
    folder.addBinding(biomes.warp, 'amplitude', { min: 0, max: 128, step: 1, label: 'Warp amplitude' }).on('change', onRegenerate)

    for (const entry of biomes.table) {
        folder.addBinding(entry, 'weight', { min: 0, max: 10, step: 1, label: entry.id }).on('change', onRegenerate)
    }
}
