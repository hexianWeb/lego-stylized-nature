export function createMaterialPanel(
    debug,
    config,
    { legoMaterial, waterMaterial },
    onRegenerate = null
) {
    const folder = debug.addFolder({ title: 'Materials', expanded: false })
    if (!folder) {
        return
    }

    const waterToggle = folder.addBinding(config.water, 'enableWater', { label: 'Water' })
    if (onRegenerate) {
        waterToggle.on('change', onRegenerate)
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

        for (const key of [
            'textureScale',
            'flowSpeed',
            'flowStrength',
            'flowVariance'
        ]) {
            waterFolder
                .addBinding(waterConfig, key, {
                    min: key === 'textureScale' ? 0.05 : 0,
                    max: key === 'textureScale' ? 2 : key === 'flowSpeed' ? 2 : 1,
                    step: 0.01,
                    label: key
                })
                .on('change', ({ value }) => {
                    const uniformName =
                        key === 'textureScale'
                            ? 'uTextureScale'
                            : key === 'flowSpeed'
                              ? 'uFlowSpeed'
                              : key === 'flowStrength'
                                ? 'uFlowStrength'
                                : 'uFlowVariance'
                    const uniform =
                        waterMaterial.userData.uniforms[uniformName]
                    if (uniform) {
                        uniform.value = value
                    }
                })
        }

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
