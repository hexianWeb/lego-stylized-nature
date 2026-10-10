export function createAOPanel(debug, config, onRegenerate, onPreviewChange) {
    const ao = config.terrain.ao
    if (!ao) {
        return
    }

    const folder = debug.addFolder({ title: 'Heightfield AO', expanded: false })
    if (!folder) {
        return
    }

    folder.addBinding(ao, 'previewGrayscale', { label: 'grayscalePreview' })
        .on('change', onPreviewChange)

    folder.addBinding(ao, 'enabled', { label: 'enabled' }).on('change', onRegenerate)

    folder.addBinding(ao, 'strength', { min: 0, max: 3, step: 0.05, label: 'strength' })
        .on('change', onRegenerate)
    folder.addBinding(ao, 'min', { min: 0.2, max: 0.95, step: 0.01, label: 'minBrightness' })
        .on('change', onRegenerate)

    const weights = folder.addFolder({ title: 'weights', expanded: false })
    weights.addBinding(ao, 'horizonWeight', { min: 0, max: 1, step: 0.01, label: 'horizon' })
        .on('change', onRegenerate)
    weights.addBinding(ao, 'creviceWeight', { min: 0, max: 1, step: 0.01, label: 'footContact' })
        .on('change', onRegenerate)

    const scales = folder.addFolder({ title: 'scales', expanded: false })
    scales.addBinding(ao, 'distanceFalloff', { min: 0, max: 1, step: 0.05, label: 'distanceFalloff' })
        .on('change', onRegenerate)
    scales.addBinding(ao, 'creviceScale', { min: 1, max: 6, step: 0.5, label: 'footContact' })
        .on('change', onRegenerate)
}
