export function createChunksPanel(debug, config, chunkManager) {
  const folder = debug.addFolder({ title: 'Chunks', expanded: false })
  if (!folder || !config.chunks) {
    return
  }

  folder.addBinding(config.chunks, 'debugSpacing', {
    label: 'Debug Spacing',
    min: 0,
    max: 32,
    step: 0.5,
  }).on('change', () => {
    chunkManager?.setDebugSpacing(config.chunks.debugSpacing)
  })

  const transition = config.chunks.transition
  if (transition) {
    const animationFolder = folder.addFolder({ title: 'Column Transition', expanded: true })
    animationFolder.addBinding(transition, 'enabled', { label: 'Enabled' })
    animationFolder.addBinding(transition, 'columnDuration', {
      label: 'Column Time',
      min: 0.05,
      max: 2,
      step: 0.05,
    })
    animationFolder.addBinding(transition, 'waveDuration', {
      label: 'Wave Time',
      min: 0,
      max: 3,
      step: 0.05,
    })
    animationFolder.addBinding(transition, 'riseDistance', {
      label: 'Rise Distance',
      min: 0,
      max: 12,
      step: 0.1,
    })
  }
}
