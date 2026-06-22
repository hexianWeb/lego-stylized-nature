export function createMaterialPanel(debug, config, { legoMaterial }) {
    const folder = debug.addFolder({ title: 'Materials', expanded: false })
    if (!folder) {
        return
    }

    if (legoMaterial) {
        const legoFolder = folder.addFolder({ title: 'Lego Brick', expanded: true })
        legoFolder.addBinding(legoMaterial, 'roughness', { min: 0, max: 1, step: 0.01, label: 'roughness' })
        legoFolder.addBinding(legoMaterial, 'clearcoat', { min: 0, max: 1, step: 0.01, label: 'clearcoat' })
        legoFolder.addBinding(legoMaterial, 'clearcoatRoughness', { min: 0, max: 1, step: 0.01, label: 'clearcoatRoughness' })
        legoFolder.addBinding(legoMaterial, 'envMapIntensity', { min: 0, max: 2, step: 0.05, label: 'envIntensity' })
        legoFolder.addBinding(legoMaterial, 'sheen', { min: 0, max: 1, step: 0.01, label: 'sheen' })
        legoFolder.addBinding(legoMaterial, 'sheenRoughness', { min: 0, max: 1, step: 0.01, label: 'sheenRoughness' })
        legoFolder.addBinding(legoMaterial, 'metalness', { min: 0, max: 1, step: 0.01, label: 'metalness' })
    }
}
