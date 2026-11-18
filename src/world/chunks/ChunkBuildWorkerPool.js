function createChunkBuildWorker() {
  return new Worker(new URL('./chunkBuild.worker.js', import.meta.url), { type: 'module' })
}

export default class ChunkBuildWorkerPool {
  /**
   * @param {{ count: number, createWorker?: () => Worker }} options
   */
  constructor({ count, createWorker = createChunkBuildWorker }) {
    this.workers = []
    this.idleWorkers = []
    this.callbacks = new Map()
    this.nextJobId = 1

    for (let i = 0; i < count; i++) {
      const worker = createWorker()
      worker.onmessage = ({ data }) => this.handleMessage(worker, data)
      worker.onerror = (event) => {
        event.preventDefault?.()
        this.failAll(event.message ?? 'Chunk build worker failed')
      }
      this.workers.push(worker)
      this.idleWorkers.push(worker)
    }
  }

  static create(chunkConfig = {}) {
    const count = chunkConfig.buildWorkers ?? 0
    if (count <= 0 || typeof Worker === 'undefined') {
      return null
    }
    return new ChunkBuildWorkerPool({ count })
  }

  hasIdleWorker() {
    return this.idleWorkers.length > 0
  }

  /**
   * @param {object} job structured-cloneable build request
   * @param {(packed: object | null, error?: string) => void} onDone
   */
  run(job, onDone) {
    const worker = this.idleWorkers.pop()
    if (!worker) {
      throw new Error('[ChunkBuildWorkerPool] No idle worker')
    }
    const id = this.nextJobId++
    this.callbacks.set(id, onDone)
    worker.postMessage({ ...job, id })
  }

  handleMessage(worker, { id, packed, error }) {
    this.idleWorkers.push(worker)
    const onDone = this.callbacks.get(id)
    this.callbacks.delete(id)
    onDone?.(error ? null : packed, error)
  }

  failAll(error) {
    const callbacks = [...this.callbacks.values()]
    this.callbacks.clear()
    for (const onDone of callbacks) {
      onDone(null, error)
    }
  }

  terminate() {
    for (const worker of this.workers) {
      worker.terminate()
    }
    this.workers.length = 0
    this.idleWorkers.length = 0
    this.callbacks.clear()
  }
}
