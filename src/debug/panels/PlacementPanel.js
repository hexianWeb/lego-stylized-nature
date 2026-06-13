export function createPlacementPanel(debug, config, onRegenerate) {
    const folder = debug.addFolder({ title: 'Placement', expanded: false })
    if (!folder) {
        return
    }

    folder.addBinding(config.placement, 'enableTrees', { label: 'Trees' }).on('change', onRegenerate)
    folder.addBinding(config.placement, 'rotationStep', { min: Math.PI / 8, max: Math.PI, step: Math.PI / 8 }).on('change', onRegenerate)
}
