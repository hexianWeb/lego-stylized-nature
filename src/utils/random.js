export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hash2(x, z, seed = 0) {
  let h = seed ^ Math.imul(x + 374761393, 668265263) ^ Math.imul(z + 69069, 2246822519)
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 1274126177) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

export function random01(x, z, seed = 0) {
  return hash2(x, z, seed) / 4294967295
}

export function pickWeighted(entries, randomValue) {
  let total = 0
  for (const entry of entries) {
    total += entry.weight
  }

  if (total <= 0) {
    return entries[0]?.value
  }

  let cursor = randomValue * total
  for (const entry of entries) {
    cursor -= entry.weight
    if (cursor <= 0) {
      return entry.value
    }
  }

  return entries[entries.length - 1]?.value
}

export function snapValue(value, step) {
  return Math.round(value / step) * step
}
