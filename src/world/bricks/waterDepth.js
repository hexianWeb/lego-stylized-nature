export const WATER_BUCKETS = ['shallow', 'transition', 'deep']

export function classifyWaterDepth(depth, waterConfig = {}) {
  const shallowMaxDepth = waterConfig.shallowMaxDepth ?? 1
  const transitionMaxDepth = Math.max(
    shallowMaxDepth,
    waterConfig.transitionMaxDepth ?? 3,
  )

  if (depth <= shallowMaxDepth) return 'shallow'
  if (depth <= transitionMaxDepth) return 'transition'
  return 'deep'
}
