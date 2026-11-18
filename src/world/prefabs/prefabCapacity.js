const DEFAULT_PREFAB_CAPACITY = 512

export function getPrefabCapacity(config, prefabEntry) {
  const caps = config?.placement?.prefabCapacity ?? {}
  const category = prefabEntry?.category ?? 'default'
  return caps[category] ?? caps.default ?? DEFAULT_PREFAB_CAPACITY
}
