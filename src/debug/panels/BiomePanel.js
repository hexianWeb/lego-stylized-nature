export function createBiomePanel(debug, config, onRegenerate) {
    const folder = debug.addFolder({ title: 'Biomes', expanded: false })
    if (!folder) {
        return
    }

    for (const region of config.biomes.regions) {
        folder.addBinding(region, 'radius', { min: 8, max: 60, step: 1, label: region.id }).on('change', onRegenerate)
    }
}
