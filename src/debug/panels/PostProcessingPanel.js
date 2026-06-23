import {
  TILT_SHIFT_RANGES
} from '../../renderer/postprocessing/tiltShiftConfig.js'

export function createPostProcessingPanel(debug, config, controller) {
  const tiltShift = config.postProcessing?.tiltShift
  if (!tiltShift) {
    return
  }

  const folder = debug.addFolder({
    title: 'Post Processing',
    expanded: false
  })
  if (!folder) {
    return
  }

  folder
    .addBinding(tiltShift, 'enabled', { label: 'enabled' })
    .on('change', ({ value }) => {
      tiltShift.enabled = value
      controller.setTiltShiftEnabled(value)
    })

  for (const key of [
    'focusCenter',
    'focusWidth',
    'falloff',
    'blurStrength'
  ]) {
    folder
      .addBinding(tiltShift, key, {
        ...TILT_SHIFT_RANGES[key],
        label: key
      })
      .on('change', ({ value }) => {
        tiltShift[key] = value
        controller.syncTiltShift(tiltShift)
      })
  }
}
