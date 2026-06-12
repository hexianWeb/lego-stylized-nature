export function createLightPanel(debug, environment) {
    const folder = debug.addFolder({ title: '灯光💡', expanded: false })
    if (!folder) {
        return
    }

    folder.addBinding(environment.ambientLight, 'intensity', {
        min: 0,
        max: 3,
        step: 0.05,
        label: 'ambient'
    })

    folder.addBinding(environment.directionalLight, 'intensity', {
        min: 0,
        max: 4,
        step: 0.05,
        label: 'directional'
    })

    const dirPos = environment.directionalLight.position
    const dirFolder = folder.addFolder({ title: 'directionalPosition', expanded: false })
    dirFolder.addBinding(dirPos, 'x', { min: -40, max: 40, step: 0.5, label: 'x' })
    dirFolder.addBinding(dirPos, 'y', { min: 0, max: 40, step: 0.5, label: 'y' })
    dirFolder.addBinding(dirPos, 'z', { min: -40, max: 40, step: 0.5, label: 'z' })

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
