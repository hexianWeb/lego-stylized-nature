import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { BuildGrid } from './SandboxGrid.js'
import { eventBus } from '../utils/event-bus.js'
import { MODES, MODE_CHANGED_EVENT, ModeManager, currentHashQuery } from '../utils/mode.js'
import { SandboxBaseplate } from './SandboxBaseplate.js'
import { SandboxRuler } from './SandboxRuler.js'
import { SandboxBrickRenderer } from './SandboxBrickRenderer.js'
import { SandboxScene } from './SandboxScene.js'
import { SandboxInput } from './SandboxInput.js'
import { SandboxPersister } from './SandboxPersister.js'
import { SandboxSnapshotter } from './SandboxSnapshotter.js'
import { HistoryStack } from './HistoryStack.js'
import { partsCatalog as baseCatalog } from '../assets/manifests/partsCatalog.js'
import { BONUS_PARTS } from './missions.js'
import { SANDBOX_ALL_MISSIONS_COMPLETE_EVENT, SANDBOX_PARTS_UNLOCKED_EVENT } from './SandboxScene.js'
import { CONTROLS_LOCK_EVENT, CONTROLS_UNLOCK_EVENT } from '../world/world.js'
import { exportToLDR } from './exportLDR.js'
import { parseLDRWithDebug } from './parseLDR.js'
import { ShapeController } from './shapes/ShapeController.js'
import { SandboxThumbnailer } from './SandboxThumbnailer.js'
import { SandboxAchievementManager } from './SandboxAchievementManager.js'
import { SandboxMissionManager } from './SandboxMissionManager.js'
import { Sandbox2DView } from './Sandbox2DView.js'
import { PartStripHUD } from './ui/PartStripHUD.js'
import { ColorStripHUD } from './ui/ColorStripHUD.js'
import { CategoryFilterHUD } from './ui/CategoryFilterHUD.js'
import { SelectionLabelHUD } from './ui/SelectionLabelHUD.js'
import { PersistHUD } from './ui/PersistHUD.js'
import { AchievementHUD } from './ui/AchievementHUD.js'
import { TutorialHUD } from './ui/TutorialHUD.js'
import { MissionCardHUD } from './ui/MissionCardHUD.js'
import { HistoryPanelHUD } from './ui/HistoryPanelHUD.js'

/**
 * Top-level sandbox orchestrator. Activates when the URL hash is
 * `#sandbox` (or when no hash is present and the default route is
 * sandbox). Tears down when switching to any other mode.
 */
export class Sandbox {
  constructor({ experience }) {
    this.experience = experience
    this.canvas = experience.canvas
    this.scene = experience.scene

    this.group = new THREE.Group()
    this.group.name = 'Sandbox'
    this.scene.add(this.group)

    this.grid = new BuildGrid()
    this.sceneState = new SandboxScene()
    this.history = new HistoryStack({ capacity: 200 })
    this.shapeController = new ShapeController({
      grid: { ...this.grid, placements: () => this.brickRenderer?.placements, targetY: 0 }
    })
    this.unlockedPartNumbers = new Set(Object.keys(baseCatalog))
    this.sceneState.state.partsCatalog = this._buildRuntimeCatalog()
    this.active = false

    this.modeManager = new ModeManager()
    this._onModeChanged = ({ previous, current }) => this._handleModeChanged(current)
    this._unsubResize = null
    this._boundUpdateCamera = () => this._updateCamera()

    eventBus.on(MODE_CHANGED_EVENT, this._onModeChanged)
  }

  _handleModeChanged(current) {
    if (current === MODES.SANDBOX) this._activate()
    else this._deactivate()
  }

  /**
   * Called by `Experience.init()` once the renderer, world and camera
   * exist. Performs the INITIAL activation for whatever mode the URL
   * hash selected (sandbox by default) — the ModeManager only emits on
   * hash *changes*, so without this the sandbox never boots.
   */
  init() {
    this._handleModeChanged(this.modeManager.get())
  }

  _buildRuntimeCatalog() {
    const map = {}
    for (const partNumber of this.unlockedPartNumbers) {
      const entry = baseCatalog[partNumber] ?? BONUS_PARTS.find((p) => p.partNumber === partNumber)
      if (entry) map[partNumber] = entry
    }
    return map
  }

  _unlockBonusParts() {
    for (const p of BONUS_PARTS) {
      this.unlockedPartNumbers.add(p.partNumber)
    }
    this.sceneState.state.partsCatalog = this._buildRuntimeCatalog()
    eventBus.emit(SANDBOX_PARTS_UNLOCKED_EVENT, { parts: BONUS_PARTS })
  }

  _activate() {
    if (this.active) return
    this.active = true
    eventBus.emit(CONTROLS_LOCK_EVENT)

    // If the global watchdog forced 2D mode while we were waiting for
    // init, the experience's renderer may still be a Three.js object;
    // sandbox can recover by skipping Three.js work.
    const is2D = typeof window !== 'undefined' && window.__sandbox_2d_only === true

    // For 2D mode: skip ALL heavy work, just show the grid. This way
    // even if the GPU stack is wedged, the user sees the 2D grid.
    if (is2D) {
      this.baseplate = new SandboxBaseplate({ grid: this.grid })
      this.brickRenderer = new SandboxBrickRenderer({ grid: this.grid, scene: this.group })
      this.view2D = new Sandbox2DView({
        grid: this.grid,
        state: this.sceneState,
        history: this.history,
        brickRenderer: this.brickRenderer,
        baseplate: this.baseplate,
        parent: document.body
      })
      this.camera = null
      this.controls = null
      this.input = null
      this._wireHud()
      this._loadFromHash()
      return
    }

    this.baseplate = new SandboxBaseplate({ grid: this.grid })
    this.group.add(this.baseplate.group)

    this.ruler = new SandboxRuler({
      grid: this.grid,
      getPlacements: () => this.brickRenderer?.placements ?? []
    })
    this.group.add(this.ruler.group)

    this.brickRenderer = new SandboxBrickRenderer({
      grid: this.grid,
      scene: this.group,
      rendererKind: this.experience?.renderer?.kind
    })
    this.group.add(this.brickRenderer.group)

    // Defer thumbnailer (creates WebGLRenderer) so a slow WebGL context
    // doesn't block activation. It self-initializes on first request.
    this._thumbnailerInit = Promise.resolve().then(() => {
      this.thumbnailer = new SandboxThumbnailer({
        cellSize: this.grid.cellSize,
        layerHeight: this.grid.layerHeight
      })
      this.partStripHUD?.setThumbnailer(this.thumbnailer)
    })

    this.achievementManager = new SandboxAchievementManager()
    this.persister = new SandboxPersister({
      renderer: this.brickRenderer,
      getMaxY: () => this.grid.maxHeight
    })
    this.snapshotter = new SandboxSnapshotter({
      canvas: this.canvas,
      getPlacements: () => this.brickRenderer.placements,
      getGrid: () => this.grid,
      is2D: () => !!this.view2D,
      getBricks2DEl: () => this.view2D?.bricksEl
    })

    this.camera = this._createCamera()
    this.input = new SandboxInput({
      canvas: this.canvas,
      camera: this.camera,
      scene: this.scene,
      state: this.sceneState,
      history: this.history,
      brickRenderer: this.brickRenderer,
      baseplate: this.baseplate,
      getMaxY: () => this.grid.maxHeight
    })
    this.input.attach()

    this._wireHud()

    this._unsubResize = this.experience.sizes.onResize(this._boundUpdateCamera)

    const overlay = this.experience.world?.group
    if (overlay) overlay.visible = false
    this.experience.renderer.attachPipeline(this.scene, this.camera)
    this.experience.renderer.postProcessingController.setTiltShiftEnabled(false)
    this.experience.renderer.postProcessingController.setSpeedLinesEnabled(false)

    if (typeof window !== 'undefined' && this.experience) {
      window.__sandbox = this
    }

    this._loadFromHash()
  }

  _wireHud() {
    this.partStripHUD = new PartStripHUD({
      state: this.sceneState,
      thumbnailer: this.thumbnailer,
      parent: document.body
    })
    this.colorStripHUD = new ColorStripHUD({ state: this.sceneState, parent: document.body })
    this.categoryFilterHUD = new CategoryFilterHUD({ state: this.sceneState, parent: document.body })
    this.selectionLabelHUD = new SelectionLabelHUD({ state: this.sceneState, parent: document.body })
    this.persistHUD = new PersistHUD({
      persister: this.persister,
      state: this.sceneState,
      parent: document.body,
      snapshotter: this.snapshotter,
      ldrExporter: exportToLDR,
      ldrParser: parseLDRWithDebug
    })
    this.achievementHUD = new AchievementHUD({ parent: document.body })
    this.tutorialHUD = new TutorialHUD({ state: this.sceneState, parent: document.body })
    this.missionManager = new SandboxMissionManager()
    this.missionCardHUD = new MissionCardHUD({
      missionManager: this.missionManager,
      state: this.sceneState,
      parent: document.body
    })
    this.historyPanelHUD = new HistoryPanelHUD({
      history: this.history,
      onUndoTo: (target) => {
        this.history.undoUntil(target)
        this.sceneState.setSelected(null)
        this.brickRenderer.setSelected(null)
        this.sceneState.syncPlacements(this.brickRenderer.listPlacements())
      },
      parent: document.body
    })

    this._onAllMissionsComplete = (e) => this._unlockBonusParts()
    eventBus.on(SANDBOX_ALL_MISSIONS_COMPLETE_EVENT, this._onAllMissionsComplete)
  }

  _loadFromHash() {
    const query = currentHashQuery()
    const shared = query.get('s')
    if (!shared) return
    try {
      const placements = this.persister.loadFromURLFragment(shared)
      this.persister.importPlacements(placements)
      this.sceneState.syncPlacements(this.brickRenderer.listPlacements())
    } catch (err) {
      console.warn('[Sandbox] Failed to load shared scene from hash:', err)
    }
  }

  _deactivate() {
    if (!this.active) return
    this.active = false
    eventBus.emit(CONTROLS_UNLOCK_EVENT)
    eventBus.off(SANDBOX_ALL_MISSIONS_COMPLETE_EVENT, this._onAllMissionsComplete)
    this.view2D?.dispose()

    this.input?.detach()
    this.partStripHUD?.dispose()
    this.colorStripHUD?.dispose()
    this.categoryFilterHUD?.dispose()
    this.selectionLabelHUD?.dispose()
    this.persistHUD?.dispose()
    this.achievementHUD?.dispose()
    this.tutorialHUD?.dispose()
    this._unsubResize?.()

    this.brickRenderer?.dispose()
    this.baseplate?.dispose()
    this.ruler?.dispose()
    this.thumbnailer?.dispose()
    this.achievementManager?.dispose()
    this.missionManager?.dispose()
    this.missionCardHUD?.dispose()
    this.historyPanelHUD?.dispose()
    this.group.clear()

    const overlay = this.experience.world?.group
    if (overlay) overlay.visible = true
    this.experience.renderer.attachPipeline(this.scene, this.experience.worldCamera.instance)
    this.experience.renderer.postProcessingController.setTiltShiftEnabled(true)

    if (typeof window !== 'undefined' && window.__sandbox === this) {
      delete window.__sandbox
    }
  }

  _createCamera() {
    const sizes = this.experience.sizes
    const camera = new THREE.PerspectiveCamera(50, sizes.width / sizes.height, 0.05, 500)
    const worldW = this.grid.worldSize().width
    camera.position.set(worldW * 0.85, worldW * 0.85, worldW * 0.85)

    this.controls = new OrbitControls(camera, this.canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.enableZoom = true
    this.controls.enablePan = true
    this.controls.enableRotate = true
    this.controls.minDistance = 2
    this.controls.maxDistance = worldW * 3
    this.controls.maxPolarAngle = Math.PI / 2.05
    this.controls.target.set(worldW * 0.5, 0, worldW * 0.5)
    // Touch: one finger orbits, two fingers pinch-zooms + pans
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN
    }
    this.controls.addEventListener('change', this._boundUpdateCamera)
    return camera
  }

  _updateCamera() {
    if (!this.camera) return
    this.camera.aspect = this.experience.sizes.width / this.experience.sizes.height
    this.camera.updateProjectionMatrix()
  }

  update() {
    if (!this.active) return
    this.controls?.update()
    if (this.view2D) this.view2D._render?.()
  }

  dispose() {
    eventBus.off(MODE_CHANGED_EVENT, this._onModeChanged)
    this._deactivate()
    this.group.parent?.remove(this.group)
    this.modeManager?.dispose()
  }
}