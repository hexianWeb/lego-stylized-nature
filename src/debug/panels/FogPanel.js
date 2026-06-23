export function createFogPanel(debug, environment) {
    const folder = debug.addFolder({ title: 'Fog', expanded: true })
    if (!folder) {
        return
    }

    folder.addBinding(environment.fogControl, 'color', {
        view: 'color',
        label: 'color'
    }).on('change', ({ value }) => {
        environment.setFogColor(value)
    })

    folder.addBinding(environment.fogRange, 'near', {
        min: 0.1,
        max: 200,
        step: 1,
        label: 'near'
    }).on('change', () => {
        environment._rebuildFog()
    })

    folder.addBinding(environment.fogRange, 'far', {
        min: 0.1,
        max: 300,
        step: 1,
        label: 'far'
    }).on('change', () => {
        environment._rebuildFog()
    })
}
