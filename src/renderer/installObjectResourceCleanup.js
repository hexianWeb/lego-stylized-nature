// Three r185's WebGPU RenderObject listens to material disposal, but not mesh
// disposal. Shared source materials therefore retain per-object bindings, and
// geometry disposal only frees the first object's derived instance attributes.
// Keep the private API compatibility work here, next to the renderer owner.
export function installObjectResourceCleanup(renderer) {
  const objects = renderer._objects
  const attributes = renderer._attributes
  const createRenderObject = objects.createRenderObject
  const records = new WeakMap()

  function rememberInstanceAttributes(object, renderObject, record) {
    if (!object.isInstancedMesh) return
    for (const attribute of renderObject.attributes ?? []) {
      const array = attribute.array
      if (array === object.instanceMatrix.array || array === object.instanceColor?.array) {
        record.attributes.add(attribute)
      }
    }
  }

  function releaseObject(object) {
    const record = records.get(object)
    if (!record) return
    for (const renderObject of [...record.objects]) {
      rememberInstanceAttributes(object, renderObject, record)
      renderObject.dispose()
    }
    for (const attribute of record.attributes) {
      attributes.delete(attribute)
    }
    object.removeEventListener('dispose', record.onDispose)
    records.delete(object)
  }

  objects.createRenderObject = function (...args) {
    const renderObject = createRenderObject.apply(this, args)
    const object = renderObject.object
    if (object.isInstancedMesh) {
      // r185 bakes object.count into the uniform matrix array length, while its
      // cache key only includes object.uuid. Compile against the pool capacity
      // so later count growth cannot read beyond that first shader's array.
      const getNodeBuilderState = renderObject.getNodeBuilderState
      renderObject.getNodeBuilderState = function (...builderArgs) {
        const count = object.count
        object.count = object.instanceMatrix.count
        try {
          return getNodeBuilderState.apply(this, builderArgs)
        } finally {
          object.count = count
        }
      }
    }
    let record = records.get(object)
    if (!record) {
      record = { objects: new Set(), attributes: new Set(), onDispose: () => releaseObject(object) }
      records.set(object, record)
      if (object.isInstancedMesh) object.addEventListener('dispose', record.onDispose)
    }
    record.objects.add(renderObject)
    const onDispose = renderObject.onDispose
    renderObject.onDispose = () => {
      rememberInstanceAttributes(object, renderObject, record)
      record.objects.delete(renderObject)
      onDispose()
    }
    return renderObject
  }

  return {
    releaseGroup(group) {
      group.traverse(releaseObject)
    }
  }
}
