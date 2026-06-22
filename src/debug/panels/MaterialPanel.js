export function createMaterialPanel(debug, config, { legoMaterial, waterMaterials = [] }) {
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

    if (waterMaterials.length > 0) {
        const waterFolder = folder.addFolder({ title: 'Water', expanded: true })
        const waterConfig = config.water
        const uniformBindings = [
            ['rippleSpeed', 0, 3, 0.01, 'uRippleSpeed'],
            ['rippleScale', 0.1, 30, 0.1, 'uRippleScale'],
            ['rippleStrength', 0, 0.5, 0.005, 'uRippleStrength'],
            ['detailScale', 1, 40, 0.1, 'uDetailScale'],
            ['detailStrength', 0, 0.2, 0.005, 'uDetailStrength'],
            ['highlightStrength', 0, 0.6, 0.005, 'uHighlightStrength']
        ]

        for (const [key, min, max, step, uniformKey] of uniformBindings) {
            waterFolder
                .addBinding(waterConfig, key, { min, max, step, label: key })
                .on('change', ({ value }) => {
                    for (const material of waterMaterials) {
                        material.userData.uniforms[uniformKey].value = value
                    }
                })
        }

        const materialBindings = [
            ['roughness', 0, 1, 0.01],
            ['clearcoat', 0, 1, 0.01],
            ['clearcoatRoughness', 0, 1, 0.01]
        ]

        for (const [key, min, max, step] of materialBindings) {
            waterFolder
                .addBinding(waterConfig, key, { min, max, step, label: key })
                .on('change', ({ value }) => {
                    for (const material of waterMaterials) {
                        material[key] = value
                    }
                })
        }
    }
}
