export function createEnvironmentPanel(debug, environment) {
    const folder = debug.addFolder({ title: 'Environment', expanded: false })
    if (!folder) {
        return
    }

    folder.addBinding(environment, 'environmentIntensity', {
        min: 0,
        max: 2,
        step: 0.05,
        label: 'envIntensity'
    }).on('change', () => {
        environment.syncEnvironmentIntensity()
    })

    folder.addBinding(environment, 'useEnvBackground', {
        label: 'envBackground'
    }).on('change', () => {
        environment.syncBackground()
    })

    const fogFolder = folder.addFolder({ title: 'Fog', expanded: true })
    fogFolder.addBinding(environment.fogRange, 'near', {
        min: 0.1,
        max: 200,
        step: 1,
        label: 'near'
    }).on('change', () => {
        environment._rebuildFog()
    })
    fogFolder.addBinding(environment.fogRange, 'far', {
        min: 0.1,
        max: 300,
        step: 1,
        label: 'far'
    }).on('change', () => {
        environment._rebuildFog()
    })
}
