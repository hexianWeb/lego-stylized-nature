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

    folder.addBinding(environment, 'autoTargetToTerrain', { label: 'autoTargetToTerrain' })

    const targetFolder = folder.addFolder({ title: 'directionalTarget', expanded: true })
    targetFolder.addBinding(environment.directionalTarget, 'x', { min: -40, max: 40, step: 0.1, label: 'x' })
        .on('change', () => environment.syncDirectionalTarget())
    targetFolder.addBinding(environment.directionalTarget, 'y', { min: -10, max: 20, step: 0.1, label: 'y' })
        .on('change', () => environment.syncDirectionalTarget())
    targetFolder.addBinding(environment.directionalTarget, 'z', { min: -40, max: 40, step: 0.1, label: 'z' })
        .on('change', () => environment.syncDirectionalTarget())
}
