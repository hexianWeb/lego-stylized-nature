/**
 * Minimal LDraw .ldr (and .mpd) text parser. Extracts a flat list of
 * "line-1" placements (the 14-line block that describes one part with
 * its color + position + orientation). Supports V6 additions:
 *  - line 0 FILE recursion (load + inline sub-model bricks)
 *  - 3×3 rotation matrix extracted and converted to a yaw (radians)
 *
 * Coordinate convention: LDraw uses LDU where 8 LDU = 1 stud width.
 * Our sandbox grid uses 1 cell = 0.2 world units which equals the
 * width of one lego stud. So `LDU / 8 = cells`.
 */

const LDU_PER_CELL = 8

/**
 * Subset of the LDraw color code table. Unknown codes fall back to
 * light gray (#9b9b9b).
 */
const LDR_COLORS = {
  0:  '#1b2a34',  1:  '#0055bf',  2:  '#237841',  3:  '#58a5ab',
  4:  '#c91a09',  5:  '#a83c8a',  6:  '#6d6e5c',  7:  '#9b9b9b',
  8:  '#6c6e6c',  9:  '#5a93db',  10: '#4b9f4a',  11: '#4ab0c5',
  12: '#d27372',  13: '#e890a0',  14: '#fec101',  15: '#f4f4f4',
  16: '#9aca3c',  17: '#a5ca18',  18: '#22b14d',  19: '#7cd5b4',
  20: '#7dc1a4',  21: '#ff8e0d',  22: '#bd7d2a',  23: '#d7c599',
  24: '#d5e0e8',  25: '#5a93db',  26: '#1b2a34',  27: '#7c503a',
  28: '#6c91b5',  29: '#a5caf0',  32: '#c91a09',  33: '#0055bf',
  34: '#237841',  36: '#fec101',  38: '#5a93db',  39: '#9b9b9b'
}

function ldrColorToHex(code) {
  if (code == null) return LDR_COLORS[7]
  if (LDR_COLORS[code]) return LDR_COLORS[code]
  return LDR_COLORS[code & 0xffffff] || LDR_COLORS[7]
}

function matrixToYaw(m) {
  // LDraw column-major: m = [a,d,g, b,e,h, c,f,i]
  //   | a b c |
  //   | d e f |
  //   | g h i |
  // For 90° Y rotations (the only kind LDraw usually produces):
  //   a = cos θ, c = sin θ
  const a = m[0], c = m[2]
  return Math.atan2(c, a)
}

function mulMatrix(parent, child) {
  // 3×3 matrix multiplication, parent * child (column-major)
  // m = [a, d, g, b, e, h, c, f, i]
  const pa = parent[0], pb = parent[1], pc = parent[2]
  const pd = parent[3], pe = parent[4], pf = parent[5]
  const pg = parent[6], ph = parent[7], pi = parent[8]
  const ca = child[0], cb = child[1], cc = child[2]
  const cd = child[3], ce = child[4], cf = child[5]
  const cg = child[6], ch = child[7], ci = child[8]
  return [
    pa*ca + pb*cd + pc*cg,
    pa*cb + pb*ce + pc*ch,
    pa*cc + pb*cf + pc*ci,
    pd*ca + pe*cd + pf*cg,
    pd*cb + pe*ce + pf*ch,
    pd*cc + pe*cf + pf*ci,
    pg*ca + ph*cd + pi*cg,
    pg*cb + ph*ce + pi*ch,
    pg*cc + ph*cf + pi*ci
  ]
}

const matrixIdentity = [1, 0, 0, 0, 1, 0, 0, 0, 1]
const fileCache = new Map()

async function fetchPart(filename) {
  if (fileCache.has(filename)) return fileCache.get(filename)
  const normalized = filename.replace(/\\/g, '/')
  const cleaned = normalized.replace(/^parts\//, '').replace(/^[ps]\//, '').replace(/\.dat$/i, '')
  const candidates = [
    `ldraw/parts/${cleaned}.dat`,
    `ldraw/parts/s/${cleaned}.dat`,
    `ldraw/p/${cleaned}.dat`,
    `ldraw/${normalized}`
  ]
  for (const path of candidates) {
    try {
      const res = await fetch(`/model/${path}`)
      if (res.ok) {
        const text = await res.text()
        fileCache.set(filename, text)
        return text
      }
    } catch (e) { /* try next */ }
  }
  return null
}

/**
 * Parse a single .ldr/.mpd text into a flat list of placements, with
 * recursion. The optional `parentMatrix` (column-major 9-floats) and
 * `parentOffset` (LDU xyz) get applied to every child placement.
 */
async function parseLDRRecursive(text, parentMatrix = matrixIdentity, parentOffset = { x: 0, y: 0, z: 0 }, depth = 0) {
  if (depth > 4) return [] // cycle guard
  const placements = []
  const lines = text.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    i++
    if (!line) continue

    if (line.startsWith('0 ')) {
      // 0 FILE filename  OR  0 !COMMENT
      if (line.startsWith('0 FILE ')) {
        const filename = line.slice('0 FILE '.length).trim()
        const subText = await fetchPart(filename)
        if (subText) {
          // Apply the line's matrix if it has one (some LDR formats put it
          // on the same line; for V6 we keep it simple and don't apply).
          const sub = await parseLDRRecursive(subText, parentMatrix, parentOffset, depth + 1)
          placements.push(...sub)
        }
      }
      continue
    }

    if (!line.startsWith('1 ')) continue

    const parts = line.split(/\s+/)
    if (parts.length < 15) continue

    const colorCode = parseInt(parts[1], 10)
    const tx = parseFloat(parts[2])
    const ty = parseFloat(parts[3])
    const tz = parseFloat(parts[4])
    // 3×3 matrix a..l, column-major
    const m = parts.slice(5, 14).map(parseFloat)
    const filename = parts.slice(14).join(' ')

    const match = filename.match(/(\d+)(?:\.dat)?/i)
    if (!match) continue
    const partNumber = match[1]

    // Compose matrices: child placement lives in a "local" coord that
    // we then transform by the parent. We just add the parent's
    // translation to the child's translation (rotation cascaded as
    // atan2 of the composed (a,c) basis).
    const composed = mulMatrix(parentMatrix, m)
    const yaw = matrixToYaw(composed)
    const x = Math.round((parentOffset.x + tx) / LDU_PER_CELL)
    const y = Math.round((parentOffset.y + ty) / LDU_PER_CELL)
    const z = Math.round((parentOffset.z + tz) / LDU_PER_CELL)

    placements.push({
      partNumber,
      x, y, z,
      rot: yaw,
      color: ldrColorToHex(colorCode)
    })
  }
  return placements
}

export async function parseLDR(text) {
  return parseLDRRecursive(text)
}

export function clearLDRCache() {
  fileCache.clear()
}

/**
 * Variant of parseLDR that returns debug info: which parts loaded,
 * which were skipped, which files failed to fetch.
 */
export async function parseLDRWithDebug(text) {
  fileCache.clear()
  const debug = {
    loaded: [],
    skipped: [],
    failed: []
  }
  const placements = await _parseWithDebug(text, debug, 0)
  return { placements, debug }
}

async function _parseWithDebug(text, debug, depth) {
  if (depth > 4) return []
  const out = []
  const lines = text.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    i++
    if (!line) continue

    if (line.startsWith('0 ')) {
      if (line.startsWith('0 FILE ')) {
        const filename = line.slice('0 FILE '.length).trim()
        const subText = await fetchPart(filename)
        if (subText) {
          debug.loaded.push(filename)
          const sub = await _parseWithDebug(subText, debug, depth + 1)
          out.push(...sub)
        } else {
          debug.failed.push(filename)
        }
      }
      continue
    }

    if (!line.startsWith('1 ')) continue
    const parts = line.split(/\s+/)
    if (parts.length < 15) continue

    const colorCode = parseInt(parts[1], 10)
    const tx = parseFloat(parts[2])
    const ty = parseFloat(parts[3])
    const tz = parseFloat(parts[4])
    const m = parts.slice(5, 14).map(parseFloat)
    const filename = parts.slice(14).join(' ')

    const match = filename.match(/(\d+)(?:\.dat)?/i)
    if (!match) {
      debug.skipped.push(filename)
      continue
    }
    const partNumber = match[1]
    const composed = mulMatrix(matrixIdentity, m)
    const yaw = matrixToYaw(composed)
    out.push({
      partNumber,
      x: Math.round(tx / LDU_PER_CELL),
      y: Math.round(ty / LDU_PER_CELL),
      z: Math.round(tz / LDU_PER_CELL),
      rot: yaw,
      color: ldrColorToHex(colorCode)
    })
  }
  return out
}