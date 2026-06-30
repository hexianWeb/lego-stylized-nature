# Biome Radar HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a player-centered biome radar HUD that shows all configured biome center points as equal-priority colored dots.

**Architecture:** Implement a standalone 2D canvas HUD class in `src/ui/BiomeRadarHUD.js`, configure it from `worldConfig.ui.biomeRadar`, and wire it into `World` as a direct DOM HUD field. The radar reads biome centers from `worldConfig.biomes.regions`, uses player world X/Z as the center, and clamps far targets to the radar edge.

**Tech Stack:** JavaScript ES modules, DOM canvas 2D rendering, existing `World` lifecycle, Vite build validation. No new radar `test.js` file.

---

## File Structure

- Create `src/ui/BiomeRadarHUD.js`
  - Owns DOM container and canvas.
  - Stores biome targets and color config.
  - Draws background rings, scan line, player center marker, and biome dots.
  - Projects world-space biome centers into radar-space points.
  - Disposes DOM resources.
- Modify `src/world/WorldConfig.js`
  - Adds `ui.biomeRadar` defaults.
- Modify `src/world/world.js`
  - Imports `BiomeRadarHUD`.
  - Creates the HUD during `build()`.
  - Passes aircraft player position during `update()`.
  - Disposes the HUD during `dispose()`.

## Task 1: Add Radar Configuration

**Files:**
- Modify: `src/world/WorldConfig.js`

- [ ] **Step 1: Add `ui.biomeRadar` defaults**

Insert this top-level config block after `postProcessing` and before `terrain`:

```js
  ui: {
    biomeRadar: {
      enabled: true,
      size: 220,
      screenOffset: {
        left: 24,
        bottom: 24
      },
      range: 360,
      scanSpeed: 0.9,
      opacity: 0.9,
      colors: {
        forest: '#53D86A',
        autumnForest: '#F4A13D',
        desert: '#E8D45A',
        volcano: '#FF513D'
      }
    }
  },
```

- [ ] **Step 2: Check config syntax**

Run:

```bash
npm run build
```

Expected: build succeeds or only reports the existing Vite chunk-size warning.

## Task 2: Create `BiomeRadarHUD`

**Files:**
- Create: `src/ui/BiomeRadarHUD.js`

- [ ] **Step 1: Create the HUD class**

Create `src/ui/BiomeRadarHUD.js` with:

```js
const DEFAULT_COLORS = {
  forest: '#53D86A',
  autumnForest: '#F4A13D',
  desert: '#E8D45A',
  volcano: '#FF513D'
}

export default class BiomeRadarHUD {
  constructor({ config, parent = document.body } = {}) {
    this.config = config
    this.radarConfig = config?.ui?.biomeRadar ?? {}
    this.enabled = this.radarConfig.enabled !== false
    this.parent = parent
    this.targets = this.buildTargets(config?.biomes?.regions ?? [])
    this.scanAngle = 0
    this.playerPosition = { x: 0, z: 0 }
    this.pixelRatio = 1
    this.size = this.radarConfig.size ?? 220
    this.radius = this.size * 0.43
    this.center = this.size * 0.5

    if (!this.enabled || typeof document === 'undefined') {
      return
    }

    this.element = document.createElement('div')
    this.element.className = 'biome-radar-hud'
    this.element.style.position = 'fixed'
    this.element.style.left = `${this.radarConfig.screenOffset?.left ?? 24}px`
    this.element.style.bottom = `${this.radarConfig.screenOffset?.bottom ?? 24}px`
    this.element.style.width = `${this.size}px`
    this.element.style.height = `${this.size}px`
    this.element.style.zIndex = '2'
    this.element.style.pointerEvents = 'none'
    this.element.style.opacity = String(this.radarConfig.opacity ?? 0.9)

    this.canvas = document.createElement('canvas')
    this.canvas.className = 'biome-radar-hud__canvas'
    this.canvas.style.display = 'block'
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    this.element.appendChild(this.canvas)
    this.parent.appendChild(this.element)

    this.context = this.canvas.getContext('2d')
    this.resizeCanvas()
    this.draw()
  }

  buildTargets(regions) {
    const colors = {
      ...DEFAULT_COLORS,
      ...(this.radarConfig.colors ?? {})
    }

    return regions
      .filter((region) => Array.isArray(region.center) && region.center.length >= 2)
      .map((region) => ({
        id: region.id,
        x: Number(region.center[0]),
        z: Number(region.center[1]),
        color: colors[region.id] ?? '#DFFBFF'
      }))
      .filter((target) => Number.isFinite(target.x) && Number.isFinite(target.z))
  }

  update(playerPosition, delta = 1 / 60) {
    if (!this.enabled || !this.context) {
      return
    }

    if (playerPosition) {
      this.playerPosition.x = playerPosition.x ?? this.playerPosition.x
      this.playerPosition.z = playerPosition.z ?? this.playerPosition.z
    }

    const scanSpeed = this.radarConfig.scanSpeed ?? 0.9
    this.scanAngle = (this.scanAngle + delta * scanSpeed * Math.PI * 2) % (Math.PI * 2)
    this.draw()
  }

  resizeCanvas() {
    if (!this.canvas) {
      return
    }

    this.pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))
    this.canvas.width = Math.round(this.size * this.pixelRatio)
    this.canvas.height = Math.round(this.size * this.pixelRatio)
    this.context?.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0)
  }

  projectTarget(target) {
    const range = Math.max(1, this.radarConfig.range ?? 360)
    const dx = target.x - this.playerPosition.x
    const dz = target.z - this.playerPosition.z
    const distance = Math.sqrt(dx * dx + dz * dz)

    if (distance <= 1e-6) {
      return { x: this.center, y: this.center, clamped: false }
    }

    const radarDistance = Math.min(distance / range, 1) * this.radius
    const nx = dx / distance
    const nz = dz / distance

    return {
      x: this.center + nx * radarDistance,
      y: this.center + nz * radarDistance,
      clamped: distance > range
    }
  }

  draw() {
    const ctx = this.context
    if (!ctx) {
      return
    }

    ctx.clearRect(0, 0, this.size, this.size)
    this.drawBackground(ctx)
    this.drawScanLine(ctx)
    this.drawTargets(ctx)
    this.drawPlayer(ctx)
  }

  drawBackground(ctx) {
    const { center, radius } = this

    const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius)
    gradient.addColorStop(0, 'rgba(53, 196, 212, 0.10)')
    gradient.addColorStop(0.72, 'rgba(53, 196, 212, 0.05)')
    gradient.addColorStop(1, 'rgba(4, 12, 16, 0.58)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(center, center, radius + 10, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = 'rgba(116, 223, 255, 0.68)'
    ctx.lineWidth = 1
    for (const scale of [0.38, 0.68, 1]) {
      ctx.beginPath()
      ctx.arc(center, center, radius * scale, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.strokeStyle = 'rgba(116, 223, 255, 0.18)'
    ctx.beginPath()
    ctx.moveTo(center - radius, center)
    ctx.lineTo(center + radius, center)
    ctx.moveTo(center, center - radius)
    ctx.lineTo(center, center + radius)
    ctx.stroke()
  }

  drawScanLine(ctx) {
    const endX = this.center + Math.cos(this.scanAngle) * this.radius
    const endY = this.center + Math.sin(this.scanAngle) * this.radius

    ctx.strokeStyle = 'rgba(53, 196, 212, 0.72)'
    ctx.lineWidth = 1.5
    ctx.shadowColor = 'rgba(53, 196, 212, 0.8)'
    ctx.shadowBlur = 12
    ctx.beginPath()
    ctx.moveTo(this.center, this.center)
    ctx.lineTo(endX, endY)
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  drawTargets(ctx) {
    for (const target of this.targets) {
      const point = this.projectTarget(target)
      const dotRadius = point.clamped ? 4.5 : 5.5

      ctx.fillStyle = target.color
      ctx.shadowColor = target.color
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.arc(point.x, point.y, dotRadius, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }
  }

  drawPlayer(ctx) {
    ctx.strokeStyle = 'rgba(236, 255, 255, 0.95)'
    ctx.lineWidth = 1.5
    ctx.shadowColor = 'rgba(236, 255, 255, 0.85)'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.arc(this.center, this.center, 8, 0, Math.PI * 2)
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  dispose() {
    this.element?.remove()
    this.context = null
    this.canvas = null
    this.element = null
  }
}
```

- [ ] **Step 2: Build check**

Run:

```bash
npm run build
```

Expected: build succeeds or only reports the existing Vite chunk-size warning.

## Task 3: Wire Radar Into `World`

**Files:**
- Modify: `src/world/world.js`

- [ ] **Step 1: Import the HUD**

Add this import with the other world/UI imports:

```js
import BiomeRadarHUD from '../ui/BiomeRadarHUD.js'
```

- [ ] **Step 2: Add a world field**

In the constructor, after `this.terrainChunkManager = null`, add:

```js
        this.biomeRadarHUD = null
```

- [ ] **Step 3: Construct the HUD**

In `build()`, after creating and adding `this.playerAircraft`, add:

```js
            if (!this.biomeRadarHUD && this.config.ui?.biomeRadar?.enabled !== false) {
                this.biomeRadarHUD = new BiomeRadarHUD({ config: this.config })
            }
```

Do not use `addSystem()` or push the HUD into `children`, because the existing child update loop calls `child.update?.()` without player position.

- [ ] **Step 4: Pass player position during update**

Inside `update()`, after the aircraft child updates and before or after chunk manager update, add:

```js
        if (this.biomeRadarHUD && this.playerAircraft?.enabled) {
            this.biomeRadarHUD.update(this.playerAircraft.state.position)
        }
```

- [ ] **Step 5: Add cleanup**

In `dispose()`, after `this.terrainChunkManager?.dispose()`, add:

```js
        this.biomeRadarHUD?.dispose()
        this.biomeRadarHUD = null
```

- [ ] **Step 6: Build check**

Run:

```bash
npm run build
```

Expected: build succeeds or only reports the existing Vite chunk-size warning.

## Task 4: Final Verification and Scope Check

**Files:**
- Inspect: `src/ui/BiomeRadarHUD.js`
- Inspect: `src/world/WorldConfig.js`
- Inspect: `src/world/world.js`

- [ ] **Step 1: Review diff scope**

Run:

```bash
git diff -- src/ui/BiomeRadarHUD.js src/world/WorldConfig.js src/world/world.js
```

Expected: diff only contains biome radar HUD implementation and config/wiring.

- [ ] **Step 2: Build verification**

Run:

```bash
npm run build
```

Expected: build succeeds or only reports the existing Vite chunk-size warning.

- [ ] **Step 3: Leave E2E/manual validation to user**

Report these manual checks for the user:

- Radar appears in the lower-left corner.
- Player marker stays fixed in the center.
- Four biome dots appear with distinct colors.
- Far dots clamp to the edge.
- Dot directions change as the aircraft moves.

- [ ] **Step 4: Commit only radar files**

Because the current worktree has unrelated local changes, stage only:

```bash
git add -- src/ui/BiomeRadarHUD.js src/world/WorldConfig.js src/world/world.js docs/superpowers/plans/2026-06-30-biome-radar-hud-implementation.md
git commit -m "Add biome radar HUD"
```
