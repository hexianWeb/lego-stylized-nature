export function createPlacementPanel(debug, config, onRegenerate) {
    const folder = debug.addFolder({ title: 'Placement', expanded: false })
    if (!folder) {
        return
    }

    folder.addBinding(config.placement, 'rotationStep', { min: Math.PI / 8, max: Math.PI, step: Math.PI / 8 }).on('change', onRegenerate)
    folder.addBinding(config.placement, 'scaleStep', { min: 0.01, max: 0.2, step: 0.01 }).on('change', onRegenerate)
}
