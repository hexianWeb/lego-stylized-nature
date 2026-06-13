export function createShadowPanel(debug, environment) {
    const folder = debug.addFolder({ title: 'Shadow', expanded: true })
    if (!folder) {
        return
    }

    folder.addBinding(environment, 'shadowFill', {
        min: 0,
        max: 1,
        step: 0.01,
        label: 'shadowFill'
    }).on('change', () => {
        environment.applyShadowFill()
    })

    folder.addBinding(environment, 'showShadowHelper', { label: 'showCameraHelper' })
        .on('change', () => {
            environment.syncShadowHelperVisibility()
        })

    folder.addBinding(environment, 'showLightHelper', { label: 'showLightHelper' })
        .on('change', () => {
            environment.syncShadowHelperVisibility()
        })

    folder.addBinding(environment.shadowBounds, 'halfExtent', {
        min: 4,
        max: 40,
        step: 0.5,
        label: 'halfExtent'
    }).on('change', () => {
        environment.applyShadowBounds()
    })

    const shadow = environment.directionalLight.shadow
    folder.addBinding(shadow, 'intensity', { min: 0, max: 1, step: 0.01, label: 'intensity' })
    folder.addBinding(shadow, 'radius', { min: 0, max: 4, step: 0.1, label: 'radius' })
    folder.addBinding(shadow, 'bias', { min: -0.01, max: 0.01, step: 0.0001, label: 'bias' })
    folder.addBinding(shadow, 'normalBias', { min: 0, max: 0.1, step: 0.001, label: 'normalBias' })
    folder.addBinding(shadow.mapSize, 'width', {
        min: 512,
        max: 4096,
        step: 512,
        label: 'mapSize'
    }).on('change', (ev) => {
        shadow.mapSize.set(ev.value, ev.value)
        shadow.needsUpdate = true
    })
}
