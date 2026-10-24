import * as THREE from 'three/webgpu'
import Experience from '../app/Experience.js'

// A naturally accepted site in the default seeded world, using the real
// worker/chunk/terrain/HUD pipeline rather than a separate model viewer.
const experience = new Experience(document.querySelector('canvas'))
const status = document.querySelector('#visit-status')
try {
  await experience.init()
  const { world, worldCamera, ui } = experience
  const manager = world.terrainChunkManager
  const player = world.playerAircraft
  const chunk = { x: 1, z: 5 }
  const slot = manager.loadCoordNow(chunk)
  const site = slot.terrainMap.landmarks?.[0]
  if (!site) throw new Error('当前种子的预览地标选址不可用')
  player.state.position.set(site.worldX, player.motionConfig.height, site.worldZ + 6)
  player.state.velocity.set(0, 0, 0)
  player.state.yaw = -Math.PI / 2
  player.cameraFollow.enabled = false
  player.update()
  world.regenerate()
  const liveSlot = manager.loadCoordNow(chunk)
  ui.flightPaused = true
  ui.syncPause()
  worldCamera.controls.maxPolarAngle = Math.PI * 0.42
  const target = new THREE.Vector3(site.worldX, site.baseY + 3.4, site.worldZ)
  worldCamera.instance.position.copy(target).add(new THREE.Vector3(10, 17, 34))
  worldCamera.lookAt(target)
  experience.start()
  const replay = document.querySelector('#replay-gate')
  const fly = document.querySelector('#fly-gate')
  const clean = document.querySelector('#clean-view')
  replay.disabled = false
  fly.disabled = false
  clean.disabled = false
  clean.addEventListener('click', () => {
    document.body.classList.add('clean-view')
    if (!ui.root.classList.contains('is-cinema')) ui.onAction('cinema')
  })
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Escape' || !document.body.classList.contains('clean-view')) return
    document.body.classList.remove('clean-view')
    if (ui.root.classList.contains('is-cinema')) ui.onAction('cinema')
  })
  replay.addEventListener('click', () => {
    liveSlot.resetTransition()
    liveSlot.startLoading({ x: 1, z: 0 }, manager.transitionSettings)
  })
  fly.addEventListener('click', () => {
    ui.flightPaused = !ui.flightPaused
    player.cameraFollow.enabled = !ui.flightPaused
    ui.syncPause()
    fly.textContent = ui.flightPaused ? '开始飞行' : '暂停飞行'
  })
  let disposed = false
  const frameTimes = []
  let previous = 0
  let lastMetrics = 0
  let maximumPreparation = 0
  const check = (time) => {
    if (disposed) return
    const reveal = liveSlot.landmarkRenderer
    status.textContent = liveSlot.columnTransition?.active ? '地形逐列升起' : reveal.progress < 1 ? '日轮门正在显现' : '日轮门已就绪 · 拖动环绕，滚轮缩放'
    if (previous && time - previous < 500) frameTimes.push(time - previous)
    previous = time
    if (frameTimes.length > 300) frameTimes.shift()
    if (time - lastMetrics > 500) {
      const sorted = [...frameTimes].sort((a, b) => a - b)
      const preparation = experience.renderer.prefabPreparation?.metrics
      maximumPreparation = Math.max(maximumPreparation, preparation?.maxSliceMs ?? 0)
      document.querySelector('#visit-metrics').textContent = [
        `区块 ${chunk.x}, ${chunk.z} · 世界 ${site.worldX.toFixed(1)}, ${site.worldZ.toFixed(1)}`,
        `建筑高度 ${world.config.landmarks.targetHeight} · 模型 5,580 三角面`,
        `基础 Y ${site.baseY.toFixed(3)} · 平台高 ${site.terraceHeight} 层`,
        `预分配模型网格 ${manager.slots.reduce((n, s) => n + (s.landmarkRenderer?.meshes.length ?? 0), 0)}`,
        `P95 帧间隔 ${(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(1)} ms`,
        `准备队列 ${preparation?.pending ?? 0} · 失败 ${preparation?.failed ?? 0}`,
        `准备最长切片 ${maximumPreparation.toFixed(1)} ms`,
      ].join('\n')
      lastMetrics = time
    }
    requestAnimationFrame(check)
  }
  requestAnimationFrame(check)
  window.addEventListener('pagehide', () => { disposed = true; experience.dispose() }, { once: true })
}
catch (error) {
  status.textContent = `实景加载失败：${error.message}`
  console.error(error)
  experience.dispose()
}
