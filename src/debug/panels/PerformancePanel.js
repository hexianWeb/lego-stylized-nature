export function createPerformancePanel(debug, experience) {
    const folder = debug.addFolder({ title: 'Performance', expanded: false })
    if (!folder) {
        return
    }

    const labels = {
        frameMs: 'Frame (ms)',
        cpuMs: 'CPU (ms)',
        gpuMs: 'GPU (ms)',
        gpuTiming: 'GPU timing',
        drawCalls: 'Draw calls',
        triangles: 'Triangles',
        geometries: 'Geometries',
        textures: 'Textures',
        waterInstances: 'Water instances',
        chunkBuildMs: 'Chunk build (ms)',
        prefabBuildMs: 'Prefab build (ms)'
    }
    for (const [key, label] of Object.entries(labels)) {
        folder.addBinding(experience.performance, key, {
            label,
            readonly: true,
            interval: 500,
            ...(key.endsWith('Ms') ? { format: (value) => value.toFixed(2) } : {})
        })
    }
    folder.addButton({ title: 'Log snapshot' }).on('click', () => {
        console.info('[Performance]', JSON.stringify(experience.getPerformanceSnapshot()))
    })
}
