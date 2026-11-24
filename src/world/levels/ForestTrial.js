import * as THREE from 'three/webgpu'
import ForestTrialHUD from '../../ui/ForestTrialHUD.js'
import ForestTrialBenchmark from './forestTrialBenchmark.js'

const FLIGHT_HEIGHT = 5.5
const GATE_RADIUS = 3
const START = { x: 13, z: 36 }
const WAYPOINTS = [
  { x: 42, z: 24, label: '飞出林缘', detail: '保持巡航，飞向湖岸航标。' },
  { x: 74, z: 19, label: '沿湖岸转向', detail: '越过航标后，向右转入开阔水面。' },
  { x: 123, z: 28, label: '穿过开阔湖面', detail: '沿前方航向穿过视野开阔的遭遇区。' },
  { x: 151, z: 28, label: '越过台地', detail: '保持高度，飞越高地上的终点航标。' },
]

export function readForestTrial(search) {
  const params = new URLSearchParams(search)
  const mode = params.get('trial')
  return mode === 'forest' || mode === 'mixed'
    ? { mode, benchmark: params.get('benchmark') === '1' }
    : null
}

export function getForestTrialConfig(config, mode) {
  return {
    ...config,
    seed: 20260608,
    biomes: { ...config.biomes, previewBiome: mode === 'forest' ? 'autumnForest' : '' },
  }
}

export const forestTrialSpawn = {
  position: [START.x, FLIGHT_HEIGHT, START.z],
  yaw: Math.atan2(WAYPOINTS[0].z - START.z, WAYPOINTS[0].x - START.x),
}

export default class ForestTrial {
  constructor(world, options) {
    this.world = world
    this.player = world.playerAircraft
    this.state = this.player.state
    this.waypointIndex = 0
    this.active = false
    this.pose = null
    this.mode = options.mode
    const mount = world.experience.ui?.root
    const title = options.mode === 'forest' ? '秋林湖岸试飞' : '混合生态对照'
    if (mount) this.hud = new ForestTrialHUD({ mount, title })

    if (options.benchmark) {
      this.benchmark = new ForestTrialBenchmark({
        points: [START, ...WAYPOINTS],
        speed: this.player.motionConfig.cruiseSpeed,
        onComplete: result => console.table({ [this.mode]: result }),
      })
      this.events = new AbortController()
      document.addEventListener('visibilitychange', () => this.benchmark.pause(), { signal: this.events.signal })
    }
    else {
      this.group = new THREE.Group()
      this.group.visible = false
      this.material = new THREE.MeshBasicMaterial({ color: 0xffcf61 })
      this.ring = new THREE.Mesh(new THREE.TorusGeometry(GATE_RADIUS, 0.055, 6, 48), this.material)
      this.ring.rotation.x = -Math.PI / 2
      this.beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), this.material)
      this.beacon.position.y = 0.65
      this.group.add(this.ring, this.beacon)
      world.group.add(this.group)
    }
  }

  activate() {
    this.active = true
    this.benchmark?.start()
  }

  getFlightPose(timestamp) {
    if (!this.active || !this.benchmark) return null
    if (this.player.paused || document.hidden) {
      this.benchmark.pause()
      return this.pose
    }
    const next = this.benchmark.update(timestamp)
    if (next) this.pose = { ...next, y: FLIGHT_HEIGHT }
    return this.pose
  }

  update() {
    if (!this.active) return
    const state = this.player.state
    if (this.state !== state) {
      this.state = state
      this.waypointIndex = 0
    }

    const { position, yaw } = state
    const current = WAYPOINTS[this.waypointIndex]
    const finalBenchmarkGate = this.benchmark && this.waypointIndex === WAYPOINTS.length - 1
    if (current && !finalBenchmarkGate && Math.hypot(current.x - position.x, current.z - position.z) <= GATE_RADIUS) {
      this.waypointIndex++
    }
    const target = WAYPOINTS[this.waypointIndex]
    if (this.group) {
      this.group.visible = Boolean(target)
      if (target) this.group.position.set(target.x, FLIGHT_HEIGHT, target.z)
    }

    const dx = target ? target.x - position.x : 0
    const dz = target ? target.z - position.z : 0
    const turn = Math.atan2(dz, dx) - yaw
    const result = this.benchmark?.result
    let detail = target?.detail
    if (this.benchmark) detail = '自动试飞中，正在记录帧间隔。'
    if (result) {
      detail = `P95 ${result.p95Ms.toFixed(1)} ms · 最长 ${result.maxMs.toFixed(1)} ms · 超过 33.3 ms ${result.over33_3Ms}/${result.frames} 帧`
    }
    this.hud?.update({
      waypointLabel: target?.label,
      waypointIndex: this.waypointIndex,
      waypointCount: WAYPOINTS.length,
      distance: Math.hypot(dx, dz) / this.world.config.terrain.cellSize,
      bearing: Math.atan2(Math.sin(turn), Math.cos(turn)),
      complete: this.benchmark ? Boolean(result) : !target,
      detail,
    })
  }

  dispose() {
    this.events?.abort()
    this.hud?.dispose()
    this.group?.removeFromParent()
    this.ring?.geometry.dispose()
    this.beacon?.geometry.dispose()
    this.material?.dispose()
  }
}
