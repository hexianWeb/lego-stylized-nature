import {
  TILT_SHIFT_RANGES
} from '../../renderer/postprocessing/tiltShiftConfig.js'
import {
  SPEED_LINES_RANGES
} from '../../renderer/postprocessing/speedLinesConfig.js'

export function createPostProcessingPanel(debug, config, controller) {
  const tiltShift = config.postProcessing?.tiltShift
  const speedLines = config.postProcessing?.speedLines
  if (!tiltShift && !speedLines) {
    return
  }

  const folder = debug.addFolder({
    title: 'Post Processing',
    expanded: false
  })
  if (!folder) {
    return
  }

  if (tiltShift) {
    folder
      .addBinding(tiltShift, 'enabled', { label: 'tiltShift enabled' })
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

  if (speedLines) {
    const speedLinesFolder = folder.addFolder({
      title: 'Speed Lines',
      expanded: false
    })

    speedLinesFolder
      .addBinding(speedLines, 'enabled', { label: 'enabled' })
      .on('change', ({ value }) => {
        speedLines.enabled = value
        controller.setSpeedLinesEnabled(value)
      })

    speedLinesFolder
      .addBinding(speedLines, 'opacity', {
        ...SPEED_LINES_RANGES.opacity,
        label: 'opacity'
      })
      .on('change', ({ value }) => {
        speedLines.opacity = value
        controller.setSpeedLineOpacity(value)
      })

    for (const key of [
      'density',
      'speed',
      'thickness',
      'minRadius',
      'maxRadius',
      'randomness'
    ]) {
      speedLinesFolder
        .addBinding(speedLines, key, {
          ...SPEED_LINES_RANGES[key],
          label: key
        })
        .on('change', () => {
          controller.syncSpeedLines(speedLines)
        })
    }

    speedLinesFolder
      .addBinding(speedLines, 'color', { label: 'color', color: { type: 'int' } })
      .on('change', () => {
        controller.syncSpeedLines(speedLines)
      })
  }
}
