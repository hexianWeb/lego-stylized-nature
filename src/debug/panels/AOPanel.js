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

    folder.addBinding(ao, 'strength', { min: 0, max: 2, step: 0.05, label: 'strength' })
        .on('change', onRegenerate)
    folder.addBinding(ao, 'min', { min: 0.2, max: 0.95, step: 0.01, label: 'minBrightness' })
        .on('change', onRegenerate)

    const weights = folder.addFolder({ title: 'weights', expanded: false })
    weights.addBinding(ao, 'horizonWeight', { min: 0, max: 1, step: 0.01, label: 'horizon' })
        .on('change', onRegenerate)
    weights.addBinding(ao, 'creviceWeight', { min: 0, max: 1, step: 0.01, label: 'crevice' })
        .on('change', onRegenerate)
    weights.addBinding(ao, 'depthWeight', { min: 0, max: 1, step: 0.01, label: 'depth' })
        .on('change', onRegenerate)
    weights.addBinding(ao, 'sideWeight', { min: 0, max: 1, step: 0.01, label: 'sideGap' })
        .on('change', onRegenerate)

    const scales = folder.addFolder({ title: 'scales', expanded: false })
    scales.addBinding(ao, 'horizonScale', { min: 1, max: 8, step: 0.5, label: 'horizon' })
        .on('change', onRegenerate)
    scales.addBinding(ao, 'creviceScale', { min: 1, max: 6, step: 0.5, label: 'crevice' })
        .on('change', onRegenerate)
    scales.addBinding(ao, 'depthScale', { min: 1, max: 10, step: 0.5, label: 'depth' })
        .on('change', onRegenerate)
}
