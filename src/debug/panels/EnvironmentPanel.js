export function createEnvironmentPanel(debug, environment) {
  const folder = debug.addFolder({ title: 'Environment', expanded: false })
  if (!folder) {
    return
  }

  folder.addBinding(environment, 'environmentIntensity', {
    min: 0,
    max: 2,
    step: 0.05,
    label: 'envIntensity',
  }).on('change', () => {
    environment.syncEnvironmentIntensity()
  })

  folder.addBinding(environment, 'backgroundColor', {
    label: 'background',
    view: 'color',
  }).on('change', () => {
    environment.syncBackground()
  })

  folder.addBinding(environment, 'useEnvBackground', {
    label: 'envBackground',
  }).on('change', () => {
    environment.syncBackground()
  })

  const settings = environment.atmosphereSettings
  if (settings) {
    const atmosphere = folder.addFolder({ title: '大气散射', expanded: false })
    const sync = () => environment.syncAtmosphere()
    atmosphere.addBinding(settings, 'enabled', { label: '启用' }).on('change', sync)
    atmosphere.addBinding(settings, 'sunElevation', {
      label: '太阳高度', min: 2, max: 85, step: 0.1,
    }).on('change', sync)
    atmosphere.addBinding(settings, 'turbidity', {
      label: '浑浊度', min: 1, max: 10, step: 0.1,
    }).on('change', sync)
    atmosphere.addBinding(settings, 'hazeDensity', {
      label: '雾密度', min: 0, max: 0.1, step: 0.001,
    }).on('change', sync)
  }
}
