export function createMaterialPanel(
    debug,
    config,
    { legoMaterial, waterMaterial }
) {
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

    if (waterMaterial) {
        const waterFolder = folder.addFolder({
            title: 'Water',
            expanded: true
        })
        const waterConfig = config.water

        waterFolder
            .addBinding(waterConfig, 'textureScale', {
                min: 0.05,
                max: 2,
                step: 0.01,
                label: 'textureScale'
            })
            .on('change', ({ value }) => {
                const uniform =
                    waterMaterial.userData.uniforms.uTextureScale
                if (uniform) {
                    uniform.value = value
                }
            })

        for (const key of [
            'roughness',
            'clearcoat',
            'clearcoatRoughness'
        ]) {
            waterFolder
                .addBinding(waterConfig, key, {
                    min: 0,
                    max: 1,
                    step: 0.01,
                    label: key
                })
                .on('change', ({ value }) => {
                    waterMaterial[key] = value
                })
        }
    }
}
