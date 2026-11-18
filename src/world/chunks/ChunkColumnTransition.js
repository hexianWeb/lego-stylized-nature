import * as THREE from 'three/webgpu'

export const CHUNK_TRANSITION_DEFAULTS = Object.freeze({
  enabled: true,
  columnDuration: 0.4,
  waveDuration: 0.65,
  riseDistance: 3,
})

const clamp01 = value => Math.max(0, Math.min(1, value))
const smoothstep = value => value * value * (3 - 2 * value)

export default class ChunkColumnTransition {
  constructor({ chunkSize, cellSize, initiallyVisible = false }) {
    this.chunkSize = chunkSize
    this.cellSize = cellSize
    this.progress = new Float32Array(chunkSize * chunkSize).fill(initiallyVisible ? 1 : 0)
    this.startProgress = new Float32Array(this.progress.length)
    this.delays = new Float32Array(this.progress.length)
    this.meshStates = new Map()
    this.active = false
    this.target = initiallyVisible ? 1 : 0
  }

  start(target, direction, settings = {}) {
    this.settings = { ...CHUNK_TRANSITION_DEFAULTS, ...settings }
    for (const key of ['columnDuration', 'waveDuration', 'riseDistance']) {
      const value = this.settings[key]
      this.settings[key] = Number.isFinite(value) ? Math.max(0, value) : CHUNK_TRANSITION_DEFAULTS[key]
    }
    this.target = target
    this.elapsed = 0
    this.startProgress.set(this.progress)
    this.active = this.progress.some(value => value !== target)

    const dx = Number.isFinite(direction?.x) ? direction.x : 0
    const dz = Number.isFinite(direction?.z) ? direction.z : 0
    // Snap once per reveal so every row/column rises together, including
    // diagonal flight. Equal components (and stationary startup) prefer X.
    const alongX = Math.abs(dx) >= Math.abs(dz)
    const reverse = (alongX ? dx : dz) < 0
    const span = this.chunkSize - 1
    for (let column = 0; column < this.chunkSize; column++) {
      const order = span > 0 ? (reverse ? span - column : column) / span : 0
      const delay = order * this.settings.waveDuration
      if (alongX) {
        for (let z = 0; z < this.chunkSize; z++) {
          this.delays[z * this.chunkSize + column] = delay
        }
      }
      else {
        this.delays.fill(delay, column * this.chunkSize, (column + 1) * this.chunkSize)
      }
    }

    for (const state of this.meshStates.values()) {
      this.expandBounds(state)
    }
    this.apply()
  }

  capture(group) {
    if (!this.active && this.target === 1) {
      return
    }
    group?.traverse((mesh) => {
      if (!mesh.isInstancedMesh || mesh.count === 0 || this.meshStates.has(mesh)) {
        return
      }

      const baseMatrices = mesh.instanceMatrix.array.slice(0, mesh.count * 16)
      const cells = new Uint32Array(mesh.count)
      const anchorBounds = new THREE.Box3()
      const anchor = new THREE.Vector3()
      const anchors = mesh.userData.chunkColumnPositions
      for (let i = 0; i < mesh.count; i++) {
        // Prefab submeshes can have different local origins; use their placement
        // anchor so every part follows the same terrain column.
        const x = anchors ? anchors[i * 2] : baseMatrices[i * 16 + 12]
        const z = anchors ? anchors[i * 2 + 1] : baseMatrices[i * 16 + 14]
        const cellX = Math.max(0, Math.min(this.chunkSize - 1, Math.floor(x / this.cellSize)))
        const cellZ = Math.max(0, Math.min(this.chunkSize - 1, Math.floor(z / this.cellSize)))
        cells[i] = cellZ * this.chunkSize + cellX
        anchorBounds.expandByPoint(anchor.set((cellX + 0.5) * this.cellSize, 0, (cellZ + 0.5) * this.cellSize))
      }

      const boundingBox = mesh.boundingBox?.clone() ?? null
      if (!mesh.boundingSphere) {
        mesh.computeBoundingSphere()
      }
      const state = {
        mesh,
        baseMatrices,
        cells,
        appliedProgress: new Float32Array(mesh.count).fill(-1),
        boundingBox,
        boundingSphere: mesh.boundingSphere.clone(),
        baseBounds: boundingBox?.clone() ?? mesh.boundingSphere.getBoundingBox(new THREE.Box3()),
        anchorBounds,
      }
      this.meshStates.set(mesh, state)
      this.expandBounds(state)
      this.applyMesh(state)
    })
  }

  expandBounds(state) {
    const bounds = state.baseBounds.clone()
    const hiddenBounds = state.anchorBounds.clone()
    hiddenBounds.min.y = hiddenBounds.max.y = -this.settings.riseDistance
    bounds.union(hiddenBounds)
    // Fixed conservative bounds cover both endpoints of the column transform;
    // no per-frame bounds rebuild or incorrect frustum/shadow culling is needed.
    state.mesh.boundingBox = bounds
    state.mesh.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere())
  }

  update(deltaSeconds) {
    if (!this.active) {
      return true
    }
    this.elapsed += Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0)
    let finished = true
    for (let i = 0; i < this.progress.length; i++) {
      const from = this.startProgress[i]
      if (from === this.target) {
        continue
      }
      const duration = this.settings.columnDuration * Math.abs(this.target - from)
      const elapsed = this.elapsed - this.delays[i]
      const t = elapsed < 0 ? 0 : duration > 0 ? clamp01(elapsed / duration) : 1
      this.progress[i] = from + (this.target - from) * smoothstep(t)
      finished &&= t === 1
    }
    this.apply()
    this.active = !finished
    if (finished && this.target === 1) {
      this.restore()
    }
    return finished
  }

  apply() {
    for (const state of this.meshStates.values()) {
      this.applyMesh(state)
    }
  }

  applyMesh({ mesh, baseMatrices, cells, appliedProgress }) {
    const array = mesh.instanceMatrix.array
    let firstChanged = mesh.count
    let lastChanged = -1
    for (let i = 0; i < cells.length; i++) {
      const progress = this.progress[cells[i]]
      if (appliedProgress[i] === progress) {
        continue
      }
      appliedProgress[i] = progress
      firstChanged = Math.min(firstChanged, i)
      lastChanged = i
      const offset = i * 16
      // Close the footprint near the hidden endpoint to avoid visible flat
      // sheets. Most of the motion is purely vertical, around the column base.
      const footprint = smoothstep(clamp01(progress * 4))
      for (let column = 0; column < 12; column += 4) {
        array[offset + column] = baseMatrices[offset + column] * footprint
        array[offset + column + 1] = baseMatrices[offset + column + 1] * progress
        array[offset + column + 2] = baseMatrices[offset + column + 2] * footprint
      }
      const anchorX = (cells[i] % this.chunkSize + 0.5) * this.cellSize
      const anchorZ = (Math.floor(cells[i] / this.chunkSize) + 0.5) * this.cellSize
      array[offset + 12] = anchorX + (baseMatrices[offset + 12] - anchorX) * footprint
      array[offset + 13] = baseMatrices[offset + 13] * progress - this.settings.riseDistance * (1 - progress)
      array[offset + 14] = anchorZ + (baseMatrices[offset + 14] - anchorZ) * footprint
    }
    if (lastChanged >= 0) {
      let start = firstChanged * 16
      let end = (lastChanged + 1) * 16
      // Three's derived interleaved instance buffers copy, rather than clear,
      // these ranges. Coalesce pending writes so reversals cannot grow the list.
      for (const range of mesh.instanceMatrix.updateRanges) {
        start = Math.min(start, range.start)
        end = Math.max(end, range.start + range.count)
      }
      mesh.instanceMatrix.clearUpdateRanges()
      mesh.instanceMatrix.addUpdateRange(start, end - start)
      mesh.instanceMatrix.needsUpdate = true
    }
  }

  restore() {
    for (const state of this.meshStates.values()) {
      const { mesh } = state
      mesh.instanceMatrix.array.set(state.baseMatrices)
      mesh.instanceMatrix.clearUpdateRanges()
      mesh.instanceMatrix.needsUpdate = true
      mesh.boundingBox = state.boundingBox
      mesh.boundingSphere = state.boundingSphere
    }
    this.meshStates.clear()
  }

  reset() {
    this.restore()
    this.active = false
  }

  discard() {
    // The hidden slot will overwrite its matrices on its next population.
    // Restore only culling metadata and drop obsolete partial upload ranges.
    for (const state of this.meshStates.values()) {
      state.mesh.boundingBox = state.boundingBox
      state.mesh.boundingSphere = state.boundingSphere
      state.mesh.instanceMatrix.clearUpdateRanges()
    }
    this.meshStates.clear()
    this.active = false
  }
}
