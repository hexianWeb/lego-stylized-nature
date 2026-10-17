import * as THREE from 'three/webgpu'
import { eventBus } from '../utils/event-bus.js'
import { SANDBOX_CHANGE_EVENT } from './SandboxScene.js'

/**
 * Vertical height ruler along the south (+Z) edge of the baseplate.
 *
 * - A canvas-texture strip with a tick per layer and a numeric label
 *   every `labelEvery` layers (0, 4, 8, …).
 * - A slim yellow indicator that tracks the current top layer so the
 *   build height is readable at a glance.
 * - Purely additive to the scene graph; `update()` recomputes the top
 *   layer from the brick renderer's placements.
 */
export class SandboxRuler {
  constructor({ grid, getPlacements, labelEvery = 4 }) {
    this.grid = grid
    this.getPlacements = getPlacements
    this.labelEvery = labelEvery

    const { width: worldW, depth: worldD } = grid.worldSize()
    const height = grid.maxHeight * grid.layerHeight
    const stripWidth = grid.cellSize * 2

    this.group = new THREE.Group()
    this.group.name = 'SandboxRuler'

    // --- Ruler strip (canvas texture) ---
    const canvas = document.createElement('canvas')
    const pxPerLayer = 16
    canvas.width = 128
    canvas.height = grid.maxHeight * pxPerLayer
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#11161d'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Canvas y grows downward while layer 0 sits at the bottom of the
    // ruler, so layer L maps to canvas y = (maxHeight - L) * pxPerLayer.
    for (let layer = 0; layer <= grid.maxHeight; layer++) {
      const y = (grid.maxHeight - layer) * pxPerLayer
      const isLabel = layer % this.labelEvery === 0
      // Tick
      ctx.strokeStyle = isLabel ? '#8b98a8' : '#3a4552'
      ctx.lineWidth = isLabel ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(isLabel ? 44 : 24, y)
      ctx.stroke()
      if (isLabel && layer < grid.maxHeight) {
        ctx.fillStyle = '#aeb9c6'
        ctx.font = '600 13px monospace'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(layer), 50, Math.min(y, canvas.height - 8))
      }
    }
    // Full-height edge line
    ctx.strokeStyle = '#5b6875'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(1, 0)
    ctx.lineTo(1, canvas.height)
    ctx.stroke()

    this.texture = new THREE.CanvasTexture(canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.magFilter = THREE.LinearFilter
    this.texture.minFilter = THREE.LinearFilter
    this.texture.anisotropy = 4

    const stripGeometry = new THREE.PlaneGeometry(stripWidth, height)
    // Plane +y is up and its texture v=0 at the bottom; the canvas was
    // drawn top-down so it maps naturally without flipping.
    const stripMaterial = new THREE.MeshBasicNodeMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.95
    })
    this.strip = new THREE.Mesh(stripGeometry, stripMaterial)
    this.strip.position.set(worldW - stripWidth * 0.5, height * 0.5, worldD + 0.01)
    this.strip.userData.pickable = false
    this.group.add(this.strip)

    // --- Top-layer indicator ---
    const indicatorGeometry = new THREE.BoxGeometry(
      stripWidth + grid.cellSize * 0.4,
      grid.layerHeight,
      0.015
    )
    const indicatorMaterial = new THREE.MeshBasicNodeMaterial({
      color: new THREE.Color('#ffc23d')
    })
    this.indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial)
    this.indicator.visible = false
    this.indicator.userData.pickable = false
    this.group.add(this.indicator)

    this._onChange = () => this.update()
    eventBus.on(SANDBOX_CHANGE_EVENT, this._onChange)
    this.update()
  }

  /** Top built layer (1-based height in layers), or 0 when empty. */
  computeTopLayer() {
    const placements = this.getPlacements?.() ?? []
    let top = 0
    for (const p of placements) {
      top = Math.max(top, (p.y ?? 0) + (p.height ?? 1))
    }
    return Math.min(top, this.grid.maxHeight)
  }

  update() {
    const top = this.computeTopLayer()
    if (top <= 0) {
      this.indicator.visible = false
      return
    }
    const { depth: worldD } = this.grid.worldSize()
    this.indicator.visible = true
    this.indicator.position.set(
      this.strip.position.x,
      (top - 0.5) * this.grid.layerHeight,
      worldD + 0.012
    )
  }

  dispose() {
    eventBus.off(SANDBOX_CHANGE_EVENT, this._onChange)
    this.strip.geometry.dispose()
    this.strip.material.dispose()
    this.texture.dispose()
    this.indicator.geometry.dispose()
    this.indicator.material.dispose()
    this.group.parent?.remove(this.group)
  }
}
