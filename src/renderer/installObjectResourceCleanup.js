import { defaultBuildStages, shaderStages } from 'three/webgpu'

// Three r185 的 WebGPU RenderObject 会监听材质（material）的释放，但不会监听网格（mesh）的释放。
// 因此，共享的源材质会保留每个对象的绑定（per-object bindings），而释放几何体（geometry）时，
// 只会释放第一个对象的派生实例属性（derived instance attributes）。
// 这里保留与私有 API 的兼容性实现，紧挨着渲染器所有者放置。
export function installObjectResourceCleanup(renderer) {
  const objects = renderer._objects
  const attributes = renderer._attributes
  const createRenderObject = objects.createRenderObject
  const records = new WeakMap()

  // compileAsync() bypasses RenderObject.getNodeBuilderState(). Scope capacity
  // around synchronous builder work too; never leave draw count changed while
  // an asynchronous builder yields back to the animation loop.
  const nodes = renderer._nodes
  if (nodes?._createNodeBuilder) {
    const createNodeBuilder = nodes._createNodeBuilder
    nodes._createNodeBuilder = function (...args) {
      const builder = createNodeBuilder.apply(this, args)
      const object = args[0].object
      if (object.isInstancedMesh) {
        for (const name of ['prebuild', 'flowNodeFromShaderStage', 'flowNode', 'build', 'buildAsync']) {
          const method = builder[name]
          if (typeof method !== 'function')
            continue
          builder[name] = function (...builderArgs) {
            return withInstanceCapacity(object, () => method.apply(this, builderArgs))
          }
        }
        if (builder.flowNodes && typeof builder.buildUpdateNodes === 'function') {
          // Native buildAsync() calls node.build() directly after a stage yield;
          // wrapping only its entry/flow methods misses those setup calls.
          builder.buildAsync = async function () {
            const steps = buildNodeBuilderSteps(this)
            while (!withInstanceCapacity(object, () => steps.next().done)) {
              await yieldBuilder()
            }
            return this
          }
        }
      }
      return builder
    }
  }

  function rememberInstanceAttributes(object, renderObject, record) {
    if (!object.isInstancedMesh)
      return
    for (const attribute of renderObject.attributes ?? []) {
      const array = attribute.array
      if (array === object.instanceMatrix.array || array === object.instanceColor?.array) {
        record.attributes.add(attribute)
      }
    }
  }

  function releaseObject(object) {
    const record = records.get(object)
    if (!record)
      return
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
        return withInstanceCapacity(object, () => getNodeBuilderState.apply(this, builderArgs))
      }
      // r185 uploads geometry before running Instance.js's OnFrameUpdate.
      // Synchronize its derived attributes before that upload, otherwise a
      // recycled slot draws last frame's matrices at its new world position.
      const getAttributes = renderObject.getAttributes
      if (getAttributes) {
        renderObject.getAttributes = function (...attributeArgs) {
          const result = getAttributes.apply(this, attributeArgs)
          for (const attribute of result) {
            const buffer = attribute.isInterleavedBufferAttribute ? attribute.data : attribute
            const source = buffer.array === object.instanceMatrix.array
              ? object.instanceMatrix
              : buffer.array === object.instanceColor?.array ? object.instanceColor : null
            if (!source || buffer === source || buffer.version === source.version)
              continue
            buffer.clearUpdateRanges()
            for (const range of source.updateRanges) {
              buffer.addUpdateRange(range.start, range.count)
            }
            buffer.version = source.version
          }
          return result
        }
      }
    }
    let record = records.get(object)
    if (!record) {
      record = { objects: new Set(), attributes: new Set(), onDispose: () => releaseObject(object) }
      records.set(object, record)
      if (object.isInstancedMesh)
        object.addEventListener('dispose', record.onDispose)
    }
    record.objects.add(renderObject)
    const onDispose = renderObject.onDispose
    renderObject.onDispose = () => {
      rememberInstanceAttributes(object, renderObject, record)
      record.objects.delete(renderObject)
      // Bindings.deleteForRender() otherwise builds missing state just to free
      // it. A deferred object may be disposed before realizing any bindings.
      renderObject._bindings ??= []
      onDispose()
    }
    return renderObject
  }

  return {
    releaseGroup(group) {
      group.traverse(releaseObject)
    },
  }
}

export function withInstanceCapacity(object, work) {
  if (!object.isInstancedMesh)
    return work()
  const count = object.count
  object.count = object.instanceMatrix.count
  try {
    return work()
  }
  finally {
    object.count = count
  }
}

// Mirrors bundled r185 NodeBuilder.build(), with yield points outside complete
// recursive node builds so no live object state or TSL stack spans a wait.
export function* buildNodeBuilderSteps(builder) {
  builder.prebuild()
  yield
  for (const buildStage of defaultBuildStages) {
    builder.setBuildStage(buildStage)
    if (builder.context.position?.isNode) {
      builder.flowNodeFromShaderStage('vertex', builder.context.position)
      yield
    }
    for (const shaderStage of shaderStages) {
      builder.setShaderStage(shaderStage)
      for (const node of builder.flowNodes[shaderStage]) {
        if (buildStage === 'generate')
          builder.flowNode(node)
        else node.build(builder)
        yield
      }
    }
  }
  builder.setBuildStage(null)
  builder.setShaderStage(null)
  builder.buildCode()
  yield
  builder.buildUpdateNodes()
}

function yieldBuilder() {
  if (globalThis.scheduler?.yield)
    return globalThis.scheduler.yield()
  return new Promise(resolve => setTimeout(resolve, 0))
}
