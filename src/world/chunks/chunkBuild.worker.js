import { buildPackedChunk, createChunkBuilder, getChunkBuildTransfer } from './chunkBuildData.js'

let builder = null
let builderEpoch = null

self.onmessage = ({ data }) => {
  const { id, epoch, config, origin, size, halo } = data
  try {
    if (builderEpoch !== epoch) {
      builder = createChunkBuilder(config)
      builderEpoch = epoch
    }
    const packed = buildPackedChunk(builder, { origin, size, halo })
    self.postMessage({ id, packed }, getChunkBuildTransfer(packed))
  }
  catch (error) {
    self.postMessage({ id, error: error?.stack ?? String(error) })
  }
}
