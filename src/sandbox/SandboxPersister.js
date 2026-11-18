const VERSION = 2
const URL_BYTE_SOFT_LIMIT = 4096

/**
 * Save / load / share for sandbox builds.
 *
 * JSON format (V2 schema — same shape as the deleted M1-M12 build tool):
 *   {
 *     "version": 2,
 *     "metadata": { "createdAt": "...", "buildMode": true, "brickCount": N },
 *     "placements": [
 *       { "id": "b1", "partNumber": "3001", "x": 5, "y": 0, "z": 7,
 *         "rot": 0, "color": "#c91a09" }
 *     ]
 *   }
 *
 * URL share:
 *   `btoa(UTF-8(JSON))` → base64 → embedded in `#sandbox&s=<base64>`
 *   4KB soft cap; longer → JSON download path.
 */
export class SandboxPersister {
  constructor({ renderer, getMaxY = () => 32 }) {
    this.renderer = renderer
    this.getMaxY = getMaxY
  }

  exportToJSON() {
    const placements = []
    for (const placement of this.renderer.listPlacements()) {
      placements.push({
        id: placement.id,
        partNumber: placement.partNumber,
        x: placement.x,
        y: placement.y,
        z: placement.z,
        rot: placement.rot ?? 0,
        color: placement.color
      })
    }
    return {
      version: VERSION,
      metadata: {
        createdAt: new Date().toISOString(),
        buildMode: true,
        brickCount: placements.length
      },
      placements
    }
  }

  exportToBlob() {
    const json = JSON.stringify(this.exportToJSON(), null, 2)
    return new Blob([json], { type: 'application/json' })
  }

  exportToFile(filename = `sandbox-${Date.now()}.json`) {
    const blob = this.exportToBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  exportToURLFragment() {
    const json = JSON.stringify(this.exportToJSON())
    return btoa(unescape(encodeURIComponent(json)))
  }

  buildShareURL() {
    const base = window.location.origin + window.location.pathname
    return `${base}#sandbox&s=${this.exportToURLFragment()}`
  }

  exceedsShareLimit() {
    return this.exportToURLFragment().length > URL_BYTE_SOFT_LIMIT
  }

  loadFromJSON(input) {
    const data = typeof input === 'string' ? JSON.parse(input) : input
    if (!data) throw new Error('Empty scene payload.')
    if (data.version !== VERSION && data.version !== 1) {
      throw new Error(`Unsupported scene version: ${data?.version}`)
    }
    if (!Array.isArray(data.placements)) {
      throw new Error('Scene payload missing placements array.')
    }
    return data.placements.map((p) => ({
      id: p.id,
      partNumber: p.partNumber ?? p.type,
      x: p.x,
      y: p.y ?? 0,
      z: p.z,
      rot: p.rot ?? 0,
      color: p.color
    }))
  }

  async loadFromFile(file) {
    const text = await file.text()
    return this.loadFromJSON(text)
  }

  loadFromURLFragment(fragment) {
    const json = decodeURIComponent(escape(atob(fragment)))
    return this.loadFromJSON(json)
  }

  /**
   * Replace the current renderer state with `placements`.
   */
  importPlacements(placements) {
    const existing = this.renderer.listPlacements()
    for (const p of existing) {
      this.renderer.removeBrick(p.id)
    }
    for (const p of placements) {
      this.renderer.addBrick({
        partNumber: p.partNumber,
        x: p.x,
        y: p.y,
        z: p.z,
        rot: p.rot,
        color: p.color
      })
    }
  }
}