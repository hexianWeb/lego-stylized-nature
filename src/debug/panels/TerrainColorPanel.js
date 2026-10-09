import {
    TERRAIN_COLOR_LAYERS,
    ensureTerrainColorSettings,
    exportTerrainColorScheme,
    importTerrainColorScheme
} from '../../world/bricks/terrainColorScheme.js'

export function createTerrainColorPanel(debug, config, biomeRegistry, onChange, getHistogram) {
    const folder = debug.addFolder({ title: 'Terrain Colors', expanded: false })
    if (!folder || !biomeRegistry) return

    const biomes = biomeRegistry.getAll()
    const settings = ensureTerrainColorSettings(config, biomes)
    const state = { biome: biomes[0].id, layer: 'surface', status: '', samples: 0, histogram: '' }
    const distribution = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`bin${i}`, 0]))
    let refreshPending = false

    const refreshHistogram = () => {
        const bins = getHistogram()
        state.samples = bins.reduce((sum, count) => sum + count, 0)
        const max = Math.max(1, ...bins)
        const bars = '▁▂▃▄▅▆▇█'
        state.histogram = bins.map((count) => count === 0 ? '·' : bars[Math.round(count / max * 7)]).join('')
        bins.forEach((count, i) => {
            distribution[`bin${i}`] = state.samples === 0 ? 0 : Math.round(count / state.samples * 1000) / 10
        })
        histogramFolder.children.forEach((binding) => binding.refresh?.())
    }

    const refreshColors = () => {
        if (refreshPending) return
        refreshPending = true
        requestAnimationFrame(() => {
            refreshPending = false
            if (!debug.ui) return
            onChange()
            refreshHistogram()
        })
    }

    folder.addBinding(settings, 'name', { label: 'Scheme name' })
    folder.addBinding(settings, 'preview', {
        label: 'Preview',
        options: { 'Final material': 'final', 'Base colors': 'baseColor', 'Noise / tone': 'noise' }
    }).on('change', () => {
        if (config.terrain.ao) config.terrain.ao.previewGrayscale = false
        refreshColors()
        debug.ui.refresh()
    })
    folder.addBinding(state, 'biome', {
        label: 'Biome', options: Object.fromEntries(biomes.map((biome) => [biome.id, biome.id]))
    }).on('change', () => renderPalette())
    folder.addBinding(state, 'layer', {
        label: 'Layer', options: Object.fromEntries(TERRAIN_COLOR_LAYERS.map((layer) => [layer, layer]))
    }).on('change', () => renderPalette())

    const paletteFolder = folder.addFolder({ title: 'Discrete palette', expanded: true })
    const renderPalette = () => {
        for (const child of [...paletteFolder.children]) child.dispose()
        const palette = settings.palettes[state.biome][state.layer]
        paletteFolder.addButton({ title: 'Add color', disabled: palette.length >= 8 }).on('click', () => {
            let widest = 1
            for (let i = 2; i < palette.length; i++) {
                if (palette[i].at - palette[i - 1].at > palette[widest].at - palette[widest - 1].at) widest = i
            }
            const at = (palette[widest - 1].at + palette[widest].at) * 0.5
            palette.splice(widest, 0, { at, color: palette[widest - 1].color })
            renderPalette()
            refreshColors()
        })

        palette.forEach((entry, i) => {
            const colorFolder = paletteFolder.addFolder({ title: `Color ${i + 1}`, expanded: true })
            colorFolder.addBinding(entry, 'color', { label: 'Color', view: 'color' }).on('change', refreshColors)
            if (i === 0 || i === palette.length - 1) {
                colorFolder.addBinding(entry, 'at', { label: 'Tone center', readonly: true })
            } else {
                const position = colorFolder.addBinding(entry, 'at', {
                    label: 'Tone center', min: palette[i - 1].at, max: palette[i + 1].at, step: 0.001
                })
                position.on('change', (event) => {
                    const gap = Math.min(0.000001, (palette[i + 1].at - palette[i - 1].at) * 0.001)
                    entry.at = Math.max(palette[i - 1].at + gap, Math.min(palette[i + 1].at - gap, entry.at))
                    refreshColors()
                    if (event.last) renderPalette()
                })
                colorFolder.addButton({ title: 'Remove color' }).on('click', () => {
                    palette.splice(i, 1)
                    renderPalette()
                    refreshColors()
                })
            }
        })
    }

    const noiseFolder = folder.addFolder({ title: 'Noise · global grid', expanded: false })
    noiseFolder.addBinding(settings, 'seed', { label: 'Color seed', min: 0, max: 4294967295, step: 1 })
        .on('change', refreshColors)
    for (const [key, label, min, max, step] of [
        ['macroScale', 'Region size (cells)', 1, 256, 1],
        ['verticalScale', 'Rock size (layers)', 1, 128, 1],
        ['contrast', 'Tone contrast', 0, 2, 0.01],
        ['bias', 'Tone bias', -0.5, 0.5, 0.01],
        ['microVariation', 'Brick variation', 0, 0.1, 0.001]
    ]) {
        noiseFolder.addBinding(settings, key, { label, min, max, step }).on('change', refreshColors)
    }
    const heightFolder = noiseFolder.addFolder({ title: 'Terrain height influence', expanded: false })
    heightFolder.addBinding(settings, 'heightInfluence', { label: 'Influence', min: 0, max: 0.5, step: 0.01 })
        .on('change', refreshColors)
    const heightMin = heightFolder.addBinding(settings, 'heightMin', {
        label: 'From (layers)', min: 0, max: 255, step: 1
    })
    heightMin.on('change', () => {
        settings.heightMin = Math.min(settings.heightMin, settings.heightMax - 1)
        heightMin.refresh()
        refreshColors()
    })
    const heightMax = heightFolder.addBinding(settings, 'heightMax', {
        label: 'To (layers)', min: 1, max: 256, step: 1
    })
    heightMax.on('change', () => {
        settings.heightMax = Math.max(settings.heightMax, settings.heightMin + 1)
        heightMax.refresh()
        refreshColors()
    })
    const layersFolder = noiseFolder.addFolder({ title: 'Rock layers · subtle', expanded: false })
    for (const [key, label, min, max, step] of [
        ['layerStrength', 'Layer weight', 0, 0.5, 0.01],
        ['layerScale', 'Band size (layers)', 1, 128, 1],
        ['layerWarp', 'Bend (layers)', 0, 16, 0.1]
    ]) {
        layersFolder.addBinding(settings, key, { label, min, max, step }).on('change', refreshColors)
    }

    const histogramFolder = folder.addFolder({ title: 'Loaded bricks · all biomes/layers', expanded: false })
    histogramFolder.addBinding(state, 'samples', { label: 'Samples', readonly: true })
    histogramFolder.addBinding(state, 'histogram', { label: 't: 0 → 1', readonly: true })
    for (let i = 0; i < 10; i++) {
        histogramFolder.addBinding(distribution, `bin${i}`, {
            label: `${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)} (%)`, readonly: true
        })
    }
    histogramFolder.addButton({ title: 'Refresh distribution' }).on('click', refreshHistogram)

    const schemesFolder = folder.addFolder({ title: 'Scheme JSON', expanded: false })
    const status = schemesFolder.addBinding(state, 'status', { label: 'Status', readonly: true })
    schemesFolder.addButton({ title: 'Save scheme' }).on('click', () => {
        const document = exportTerrainColorScheme(settings)
        const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = window.document.createElement('a')
        link.href = url
        link.download = `${(settings.name.trim() || 'terrain-colors').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')}.json`
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 0)
        state.status = 'Scheme saved'
        status.refresh()
    })
    schemesFolder.addButton({ title: 'Load scheme' }).on('click', () => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json,application/json'
        input.addEventListener('change', async () => {
            try {
                const file = input.files?.[0]
                if (!file) return
                importTerrainColorScheme(settings, JSON.parse(await file.text()))
                renderPalette()
                refreshColors()
                state.status = 'Scheme loaded'
                debug.ui.refresh()
            } catch (error) {
                state.status = error.message
                status.refresh()
            }
        }, { once: true })
        input.click()
    })

    renderPalette()
    refreshHistogram()
}
