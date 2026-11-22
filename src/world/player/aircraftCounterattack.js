const SLOW_SECONDS = 1.3
const SLOW_RATE = 0.13
const RETURN_TO_SPEED = 0.32
const COUNTER_GRACE = 0.6
const VOLLEY_GAP = 0.12
const VOLLEY_COUNT = 3

export function createAircraftCounterattack(targets) {
  let clock = 0
  let slowUntil = 0
  let counterUntil = 0
  let attacker = null
  let volley = null

  function isLive(target) {
    return target?.health > 0 && targets.includes(target)
  }

  function reset() {
    clock = slowUntil = counterUntil = 0
    attacker = volley = null
  }

  function onEvade(source) {
    slowUntil = clock + SLOW_SECONDS
    counterUntil = slowUntil + COUNTER_GRACE
    attacker = isLive(source) ? source : null
  }

  function beginFrame(realDelta) {
    if (!Number.isFinite(realDelta) || realDelta <= 0) return 0
    const remaining = Math.max(0, slowUntil - clock)
    const slowed = Math.min(remaining, realDelta)
    // Ease back to full speed over the last part of the flyby.
    const blend = Math.min(1, (remaining - slowed * 0.5) / RETURN_TO_SPEED)
    const rate = 1 - (1 - SLOW_RATE) * blend * blend * (3 - 2 * blend)
    clock += realDelta
    if (clock >= counterUntil || !isLive(attacker)) attacker = null
    if (volley && !isLive(volley.target)) volley = null
    return Math.min(0.15, realDelta - slowed + slowed * rate)
  }

  function startVolley() {
    if (!isLive(attacker)) return false
    volley = { target: attacker, start: clock, next: 0 }
    attacker = null
    return true
  }

  function takeDueShots() {
    if (!volley) return
    const shots = []
    // Carry the scheduled times across frames, even when one frame spans two launches.
    while (volley.next < VOLLEY_COUNT && clock + 1e-8 >= volley.start + volley.next * VOLLEY_GAP) {
      shots.push({ target: volley.target, index: volley.next++ })
    }
    if (volley.next === VOLLEY_COUNT) volley = null
    return shots
  }

  return {
    beginFrame, onEvade, startVolley, takeDueShots, reset,
    get readyTarget() { return isLive(attacker) ? attacker : null },
    get slowMotion() { return clock < slowUntil },
    get firing() { return volley !== null },
  }
}
