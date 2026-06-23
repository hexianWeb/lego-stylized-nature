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
}
