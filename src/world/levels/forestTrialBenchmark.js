export class ForestTrialBenchmark {
  constructor({ points, speed, onComplete }) {
    if (!Number.isFinite(speed) || speed <= 0) throw new RangeError('Benchmark speed must be positive')

    this.segments = []
    this.distance = 0
    this.speed = speed
    this.onComplete = onComplete
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1]
      const to = points[i]
      const dx = to.x - from.x
      const dz = to.z - from.z
      const length = Math.hypot(dx, dz)
      if (!Number.isFinite(length)) throw new RangeError('Benchmark points must have finite coordinates')
      if (!length) continue
      this.segments.push({ from, dx, dz, length, start: this.distance, yaw: Math.atan2(dz, dx) })
      this.distance += length
    }
    if (!this.distance) throw new RangeError('Benchmark route must have a nonzero length')

    this.reset()
  }

  start() {
    this.reset()
    this.active = true
  }

  pause() {
    this.lastTimestamp = null
  }

  reset() {
    this.active = false
    this.elapsedMs = 0
    this.frameIntervals = []
    this.result = null
    this.pause()
  }

  update(timestamp) {
    if (!this.active || !Number.isFinite(timestamp)) return null

    if (this.lastTimestamp !== null && timestamp > this.lastTimestamp) {
      const interval = timestamp - this.lastTimestamp
      this.frameIntervals.push(interval)
      this.elapsedMs += interval
    }
    this.lastTimestamp = timestamp

    // Follow the same constant-speed route regardless of the frame rate. The
    // final interval is recorded in full, even if the pose reaches the finish early.
    const durationMs = this.distance / this.speed * 1000
    const finished = this.elapsedMs >= durationMs
    const distance = finished ? this.distance : this.elapsedMs * this.speed / 1000
    const segment = this.segments.find(({ start, length }) => distance < start + length) ?? this.segments.at(-1)
    const progress = finished ? 1 : (distance - segment.start) / segment.length
    const pose = {
      x: segment.from.x + segment.dx * progress,
      z: segment.from.z + segment.dz * progress,
      yaw: segment.yaw,
      speed: this.speed,
    }

    if (finished) this.complete()
    return pose
  }

  complete() {
    this.active = false
    const intervals = [...this.frameIntervals].sort((a, b) => a - b)
    const frames = intervals.length
    this.result = {
      frames,
      durationSeconds: this.elapsedMs / 1000,
      p95Ms: intervals[Math.ceil(frames * 0.95) - 1],
      maxMs: intervals.at(-1),
      over16_7Ms: intervals.filter(ms => ms > 16.7).length,
      over33_3Ms: intervals.filter(ms => ms > 33.3).length,
    }
    this.onComplete?.(this.result)
  }
}

export default ForestTrialBenchmark
