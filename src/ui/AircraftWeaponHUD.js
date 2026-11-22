import { Vector3 } from 'three/webgpu'

const cannonIcon = `<svg viewBox="0 0 32 26" aria-hidden="true" focusable="false">
  <path fill="currentColor" d="M2 23c1-3.4 3.6-6.8 6.4-8.7l5.8 7.4C10.3 23.7 5.8 24.4 2 23Zm8-10 9.8-7.6 6.2 8-9.8 7.5L10 13Zm11.6-9L25 1.7l6.2 8-3.3 2.3-6.3-8Z"/>
  <path fill="currentColor" d="m5.1 23.1 4.8-5.2 1.1 1.4L5.1 23.1Z" opacity=".7"/>
</svg>`

const missileIcon = `<svg viewBox="0 0 32 26" aria-hidden="true" focusable="false">
  <path fill="currentColor" d="M29.9 1.5c.6 4.2-1.8 8.3-5 10.7l-8.1 6.3-3 5.3-2.6.7.1-4.4-3.6.1-2-2.5.9-3.4-4.2-1 1.4-2.3 6-1.8 8.1-6.3c3-2.3 7.3-3.1 11.9-1.4ZM5.1 20.4l1.5 1.8-4.5 2.4 3-4.2Z"/>
</svg>`

const warningIcon = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M12 2.8 22 20.2H2L12 2.8Zm0 6v4.4m0 2.9v.4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

const lockCorner = `
  <path class="weapon-lock-shell" d="M0 29V9L9 0h21v8H14l-6 6v15Z"/>
  <path class="weapon-lock-face" d="M2 27V10l8-8h18v3H12l-7 7v15Z"/>
  <path class="weapon-lock-hardware" d="M10 20h2v6h-2zM20 10h6v2h-6z"/>
`

const lockMarker = `<svg class="weapon-lock-graphic" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
  ${['translate(0 0)', 'translate(100 0) scale(-1 1)', 'translate(0 100) scale(1 -1)', 'translate(100 100) scale(-1 -1)']
    .map(transform => `<g transform="${transform}">${lockCorner}</g>`).join('')}
  <path class="weapon-lock-shell" d="M0 44h5l3 3v6l-3 3H0zM100 44h-5l-3 3v6l3 3h5z"/>
  <path class="weapon-lock-pin" d="M2 47h3v6H2zM98 47h-3v6h3z"/>
</svg>`

export const aircraftWeaponMarkup = `
  <div class="weapon-hud flight-panel hud-part" data-weapon-hud hidden>
    <div class="weapon-hit-flash" data-player-hit-flash aria-hidden="true" hidden></div>
    <div class="weapon-enemies" data-enemy-sights aria-hidden="true">
      <div class="weapon-enemy-edges" data-enemy-edges></div>
    </div>
    <div class="weapon-alert">
      <div class="weapon-warning" data-player-damage role="status" hidden>
        ${warningIcon}<span class="weapon-warning-copy"></span>
      </div>
      <button class="weapon-retry" type="button" data-action="home" hidden>回到出生点</button>
    </div>
    <div class="weapon-status" role="group" aria-label="武器与机体状态">
      <div class="weapon-messages">
        <span class="weapon-feedback" data-weapon-feedback role="status" hidden></span>
        <span class="weapon-lock" data-weapon-lock role="status" hidden></span>
      </div>
      <div class="weapon-hull" data-player-hull role="status" hidden>
        <span class="weapon-hull-value"></span>
        <span aria-hidden="true">机体</span><span class="weapon-hull-cells" aria-hidden="true"></span>
      </div>
      <div class="weapon-readout">
        <span class="weapon-ammo weapon-ammo-cannon">
          ${cannonIcon}<span>机炮</span><b data-cannon-ammo></b>
        </span>
        <span class="weapon-ammo weapon-ammo-missile">
          ${missileIcon}<span>导弹</span><b data-missile-ammo></b><kbd aria-label="快捷键 M">M</kbd>
        </span>
      </div>
    </div>
    <i class="weapon-aim" data-weapon-aim aria-hidden="true" hidden></i>
    <div class="weapon-target" data-weapon-target aria-hidden="true" hidden>
      <div class="weapon-lock-art">${lockMarker}<i class="weapon-lock-meter"></i></div>
    </div>
  </div>`

const setText = (element, value) => {
  if (element.textContent !== value) element.textContent = value
}

const BEARINGS = ['正前', '右前', '右侧', '右后', '正后', '左后', '左侧', '左前']

export function enemyBearing(dx, dy, dz, yaw) {
  if (Math.hypot(dx, dz) < 1e-4) return dy >= 0 ? '正上' : '正下'
  const octant = Math.round((Math.atan2(dz, dx) - yaw) / (Math.PI / 4))
  return BEARINGS[(octant % 8 + 8) % 8]
}

export function projectEnemyMarker(point, camera, cameraPoint, result) {
  cameraPoint.copy(point).applyMatrix4(camera.matrixWorldInverse)
  const projection = camera.projectionMatrix.elements
  const depth = -cameraPoint.z
  const horizontal = cameraPoint.x * projection[0]
  const vertical = -cameraPoint.y * projection[5]
  const x = horizontal / depth
  const y = vertical / depth
  if (depth > camera.near && depth <= camera.far && Math.abs(x) <= 0.96 && y >= -0.90 && y <= 0.96) {
    result.x = x
    result.y = y
    result.edge = false
    return
  }

  // Keep the camera-space side for rear contacts. Dividing by their negative
  // depth would send a left contact to the right edge.
  let edgeY = vertical + Math.max(0, -depth) * projection[5] * 0.54
  let span = Math.max(Math.abs(horizontal), Math.abs(edgeY))
  if (span < 1e-6) span = edgeY = 1
  result.x = horizontal / span
  result.y = edgeY / span
  result.angle = Math.atan2(edgeY, horizontal * camera.aspect)
  result.edge = true
}

export default class AircraftWeaponHUD {
  constructor(root, sizes) {
    this.root = root.querySelector('[data-weapon-hud]')
    this.sizes = sizes
    this.cannon = this.root.querySelector('[data-cannon-ammo]')
    this.missile = this.root.querySelector('[data-missile-ammo]')
    this.hull = this.root.querySelector('[data-player-hull]')
    this.hullCells = this.hull.querySelector('.weapon-hull-cells')
    this.hullValue = this.hull.querySelector('.weapon-hull-value')
    this.warning = this.root.querySelector('[data-player-damage]')
    this.damage = this.warning.querySelector('.weapon-warning-copy')
    this.retry = this.root.querySelector('.weapon-retry')
    this.hitFlash = this.root.querySelector('[data-player-hit-flash]')
    this.status = this.root.querySelector('[data-weapon-lock]')
    this.feedback = this.root.querySelector('[data-weapon-feedback]')
    this.aim = this.root.querySelector('[data-weapon-aim]')
    this.target = this.root.querySelector('[data-weapon-target]')
    this.enemySights = this.root.querySelector('[data-enemy-sights]')
    this.enemyEdges = this.root.querySelector('[data-enemy-edges]')
    this.enemyMarkers = []
    this.pendingEdges = []
    this.visibleEdges = []
    this.cameraPoint = new Vector3()
    this.aimPoint = new Vector3()
    this.projected = new Vector3()
  }

  hide() {
    this.root.hidden = true
  }

  placeMarker(element, point, camera) {
    const projected = this.projected.copy(point).applyMatrix4(camera.matrixWorldInverse)
    const depth = -projected.z
    if (depth <= camera.near || depth > camera.far) {
      element.hidden = true
      return 0
    }
    projected.applyMatrix4(camera.projectionMatrix)
    element.hidden = Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1
    if (element.hidden) return 0
    element.style.left = `${(1 + projected.x) * 50}%`
    element.style.top = `${(1 - projected.y) * 50}%`
    return depth
  }

  createEnemyMarker() {
    const element = this.root.ownerDocument.createElement('span')
    element.className = 'weapon-enemy'
    element.setAttribute('data-enemy-indicator', '')
    element.innerHTML = '<i class="weapon-enemy-icon"></i><span class="weapon-enemy-label"></span>'
    return { element, label: element.lastElementChild, x: 0, y: 0, angle: 0, edge: false }
  }

  showEnemyMarker(marker) {
    const { element, edge, bearing, distance, alerted, tracked } = marker
    const layer = edge ? this.enemyEdges : this.enemySights
    if (element.parentElement !== layer) layer.append(element)
    element.hidden = false
    element.dataset.placement = edge ? 'edge' : 'seen'
    element.dataset.bearing = bearing
    element.toggleAttribute('data-alerted', alerted)
    element.toggleAttribute('data-tracked', tracked)
    element.style.left = `${(1 + marker.x) * 50}%`
    element.style.top = `${(1 + marker.y) * 50}%`
    if (edge) {
      element.style.setProperty('--enemy-angle', `${marker.angle}rad`)
      const count = marker.count > 1 ? ` ×${marker.count}` : ''
      setText(marker.label, `${distance} 格${count}`)
    }
  }

  updateEnemyMarkers(targets, player, lockedTarget, camera, cellSize) {
    const { position, yaw } = player.state
    const edges = this.pendingEdges
    const visibleEdges = this.visibleEdges
    edges.length = visibleEdges.length = 0
    let contactCount = 0
    for (const target of targets) {
      if (target.health <= 0) continue
      const i = contactCount++
      const marker = this.enemyMarkers[i] ?? (this.enemyMarkers[i] = this.createEnemyMarker())
      projectEnemyMarker(target.position, camera, this.cameraPoint, marker)
      const dx = target.position.x - position.x
      const dy = target.position.y - position.y
      const dz = target.position.z - position.z
      marker.bearing = enemyBearing(dx, dy, dz, yaw)
      marker.distance = Math.round(Math.hypot(dx, dy, dz) / cellSize)
      marker.alerted = target.alerted === true && !target.extending
      marker.tracked = target === lockedTarget
      marker.priority = marker.tracked ? 3 : target.firing ? 2 : marker.alerted ? 1 : 0
      marker.count = 1
      if (marker.edge) edges.push(marker)
      else if (marker.tracked && !this.target.hidden) marker.element.hidden = true
      else this.showEnemyMarker(marker)
    }
    for (let i = contactCount; i < this.enemyMarkers.length; i++)
      this.enemyMarkers[i].element.hidden = true

    // Closely packed contacts share a card so the nearest active threat stays legible.
    edges.sort((a, b) => b.priority - a.priority || a.distance - b.distance)
    const gapX = 202 / Math.max(160, this.sizes.width - 160)
    const gapY = 68 / Math.max(72, this.sizes.height * 0.53)
    for (const marker of edges) {
      const overlap = visibleEdges.find(other => Math.abs(marker.x - other.x) < gapX && Math.abs(marker.y - other.y) < gapY)
      if (overlap) {
        overlap.count++
        marker.element.hidden = true
      }
      else visibleEdges.push(marker)
    }
    for (const marker of visibleEdges) this.showEnemyMarker(marker)
  }

  updateHull(combat) {
    this.hull.hidden = !combat
    if (!combat) return
    const { hull, hullMax } = combat
    const health = `${hull}/${hullMax}`
    if (this.hull.dataset.health === health) return
    this.hull.dataset.health = health
    setText(this.hullValue, `机体 ${health}`)
    if (this.hullCells.childElementCount !== hullMax) {
      const cells = Array.from({ length: hullMax }, () => this.root.ownerDocument.createElement('i'))
      this.hullCells.replaceChildren(...cells)
    }
    for (let index = 0; index < hullMax; index++) {
      this.hullCells.children[index].toggleAttribute('data-filled', index < hull)
    }
  }

  update(player, world, camera) {
    const weapons = world.aircraftWeapons
    const combat = world.aircraftCombatStatus
    const feedback = world.aircraftWeaponFeedback
    const defeated = Boolean(combat?.defeated)
    if (!player?.enabled || (player.paused && !defeated) || !weapons || !camera) {
      this.hide()
      return
    }
    this.root.hidden = false
    setText(this.cannon, weapons.gunReload > 0 ? '装填中' : `${weapons.rounds}/${weapons.roundsMax}`)
    setText(this.missile, weapons.missileReload > 0 ? '装填中' : `${weapons.missilesLeft}/${weapons.missilesMax}`)
    this.cannon.parentElement.toggleAttribute('data-reloading', weapons.gunReload > 0)
    this.missile.parentElement.toggleAttribute('data-reloading', weapons.missileReload > 0)
    this.updateHull(combat)
    const hitFlash = combat?.hitFlash ?? 0
    this.hitFlash.hidden = hitFlash <= 0
    if (hitFlash > 0) this.hitFlash.style.opacity = String(hitFlash)
    const damage = defeated ? '机体受损' : hitFlash > 0 ? '被击中' : combat?.pursuers > 0 ? '敌机正在追击' : ''
    this.warning.hidden = !damage
    if (damage) setText(this.damage, damage)
    this.retry.hidden = !defeated

    const target = weapons.lockTarget
    const tracking = !defeated && Boolean(target)
    const locked = tracking && weapons.locked
    this.status.hidden = !tracking
    if (tracking) setText(this.status, locked ? '已锁定 · 右键 / M' : '锁定中')
    this.root.classList.toggle('is-locked', locked)
    this.feedback.hidden = !(feedback?.time > 0 && feedback.text)
    if (!this.feedback.hidden) setText(this.feedback, feedback.text)

    this.enemySights.hidden = defeated
    this.target.toggleAttribute('data-locked', locked)
    this.target.style.setProperty('--lock-progress', String(tracking ? weapons.lockProgress : 0))
    if (defeated) {
      this.aim.hidden = this.target.hidden = true
      return
    }
    camera.updateWorldMatrix(true, false)
    // Scale the overhead sight with the camera's framing so it stays near the aircraft.
    const aimDistance = player.view === 'top' ? (camera.userData.focusDistance ?? 12) * 0.105 : 24
    this.aimPoint.set(aimDistance, 0, 0).applyQuaternion(player.group.quaternion).add(player.state.position)
    this.placeMarker(this.aim, this.aimPoint, camera)
    if (target) {
      const depth = this.placeMarker(this.target, target.position, camera)
      if (depth) {
        const span = (target.radius ?? 0) * camera.projectionMatrix.elements[5] * this.sizes.height / depth
        this.target.style.setProperty('--lock-target-size', `${Math.round(span * 1.05)}px`)
      }
    }
    else this.target.hidden = true
    this.updateEnemyMarkers(world.aircraftWeaponTargets ?? [], player, target, camera, world.config.terrain.cellSize)
  }
}
