export function createChunksPanel(debug, config, chunkManager) {
    const folder = debug.addFolder({ title: 'Chunks', expanded: false })
    if (!folder || !config.chunks) {
        return
    }

    folder.addBinding(config.chunks, 'debugSpacing', {
        label: 'Debug Spacing',
        min: 0,
        max: 32,
        step: 0.5
    }).on('change', () => {
        chunkManager?.setDebugSpacing(config.chunks.debugSpacing)
    })
}
