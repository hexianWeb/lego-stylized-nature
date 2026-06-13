export function createMaterialPanel(debug, config, { waterMaterial, legoMaterial }) {
    const folder = debug.addFolder({ title: 'Materials', expanded: false })
    if (!folder) {
        return
    }

    if (waterMaterial?.userData.uniforms) {
        folder.addBinding(config.water, 'rippleStrength', { min: 0, max: 0.3, step: 0.01 }).on('change', () => {
            waterMaterial.userData.uniforms.uRippleStrength.value = config.water.rippleStrength
        })
        folder.addBinding(config.water, 'rippleSpeed', { min: 0, max: 3, step: 0.05 }).on('change', () => {
            waterMaterial.userData.uniforms.uRippleSpeed.value = config.water.rippleSpeed
        })
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
