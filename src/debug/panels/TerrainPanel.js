export function createTerrainPanel(debug, config, onRegenerate) {
    const folder = debug.addFolder({ title: 'Terrain', expanded: false })
    if (!folder) {
        return
    }

    folder.addBinding(config, 'seed', { label: 'Seed' }).on('change', onRegenerate)
    folder.addBinding(config.terrain, 'maxHeight', { min: 4, max: 128, step: 1 }).on('change', onRegenerate)
    folder.addBinding(config.terrain, 'waterLevel', { min: 0, max: 12, step: 1 }).on('change', onRegenerate)
    folder.addBinding(config.terrain, 'noiseScale', { min: 8, max: 80, step: 1 }).on('change', onRegenerate)

    const curveFolder = folder.addFolder({ title: 'Height curve (n ascending)', expanded: false })
    config.terrain.heightCurve.forEach((point, i) => {
        curveFolder.addBinding(point, 'n', { label: `n${i}`, min: 0, max: 1, step: 0.01 }).on('change', onRegenerate)
        curveFolder.addBinding(point, 'h', { label: `h${i}`, min: 0, max: 48, step: 1 }).on('change', onRegenerate)
    })
}
