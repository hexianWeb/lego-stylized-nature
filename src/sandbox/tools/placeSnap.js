/**
 * Helpers for "stud-tube" snap: when a drop would overlap an existing
 * brick, search 4 cardinal directions for a free flush position. Used
 * by `SandboxInput._dropBrick` before pushing a `PlaceCommand`.
 */
function rectsOverlap(ax, az, aw, ad, bx, bz, bw, bd) {
  return ax < bx + bw && ax + aw > bx && az < bz + bd && az + ad > bz
}

export function findStudSnap({ grid, placements, x, y, z, footprint, getY }) {
  const dirs = [
    { dx:  1, dz:  0, label: 'east' },
    { dx: -1, dz:  0, label: 'west' },
    { dx:  0, dz:  1, label: 'south' },
    { dx:  0, dz: -1, label: 'north' }
  ]
  for (const { dx, dz } of dirs) {
    // Skip the direction away from the origin (toward positive x/z) by
    // preferring directions that keep the brick near the original click
    const candidate = { x: x + dx * footprint.x, y, z: z + dz * footprint.z }
    if (candidate.x < 0 || candidate.z < 0) continue
    if (candidate.x + footprint.x > grid.width) continue
    if (candidate.z + footprint.z > grid.depth) continue

    let collides = false
    for (const p of placements) {
      if (p.y !== y) continue
      const fp = p.footprint ?? { x: 1, z: 1 }
      if (rectsOverlap(candidate.x, candidate.z, footprint.x, footprint.z,
                       p.x, p.z, fp.x, fp.z)) {
        collides = true
        break
      }
    }
    if (!collides) return candidate
  }
  return null
}