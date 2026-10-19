export function shouldCastPrefabShadow(prefabEntry) {
  return prefabEntry.castShadow ?? prefabEntry.category === 'tree'
}
