import test from 'node:test'
import assert from 'node:assert/strict'
import Experience from '../src/app/Experience.js'
import Renderer from '../src/renderer/Renderer.js'
import Sizes from '../src/systems/Sizes.js'
import WorldCamera from '../src/world/camera.js'

function createViewport() {
  const frames = new Map()
  let nextFrame = 0
  let notifyLayout
  let observedCanvas
  const view = Object.assign(new EventTarget(), {
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 3,
    visualViewport: new EventTarget(),
    requestAnimationFrame(callback) {
      frames.set(++nextFrame, callback)
      return nextFrame
    },
    cancelAnimationFrame: id => frames.delete(id),
    ResizeObserver: class {
      constructor(callback) { notifyLayout = callback }
      observe(canvas) { observedCanvas = canvas }
      disconnect() { observedCanvas = null }
    },
  })
  const canvas = { ownerDocument: { defaultView: view }, clientWidth: 390, clientHeight: 780 }
  return {
    canvas,
    view,
    frames,
    notifyLayout() {
      if (observedCanvas === canvas) notifyLayout()
    },
    flushFrame() {
      const callbacks = [...frames.values()]
      frames.clear()
      for (const callback of callbacks) callback()
    },
  }
}

test('a late landscape layout resizes the camera and drawing buffer together', (t) => {
  const viewport = createViewport()
  const { view, canvas } = viewport
  const sizes = new Sizes(canvas)
  t.after(() => sizes.dispose())
  const worldCamera = new WorldCamera(sizes)
  const renderer = Object.create(Renderer.prototype)
  const resizes = []
  renderer.instance = {
    setDrawingBufferSize: (...args) => resizes.push(args),
  }
  const resize = () => Experience.prototype.resize.call({ sizes, renderer, worldCamera })
  sizes.onResize(resize)
  resize()
  assert.deepEqual(resizes, [[390, 780, 2]])
  assert.equal(worldCamera.instance.aspect, 390 / 780)

  // A browser resize may precede rotation layout, or report a different height.
  view.innerWidth = 844
  view.innerHeight = 390
  view.dispatchEvent(new Event('resize'))
  viewport.flushFrame()
  assert.equal(resizes.length, 1)

  canvas.clientWidth = 844
  canvas.clientHeight = 350
  view.visualViewport.dispatchEvent(new Event('resize'))
  viewport.notifyLayout()
  assert.equal(viewport.frames.size, 1)
  viewport.flushFrame()
  assert.deepEqual(resizes, [[390, 780, 2], [844, 350, 2]])
  assert.equal(worldCamera.instance.aspect, 844 / 350)
})

test('canvas-only layout and DPR changes are observed, but zero sizes are ignored', (t) => {
  const viewport = createViewport()
  const { view, canvas } = viewport
  const sizes = new Sizes(canvas)
  t.after(() => sizes.dispose())
  const changes = []
  const unsubscribe = sizes.onResize(() => changes.push([sizes.width, sizes.height, sizes.pixelRatio]))

  canvas.clientHeight = 0
  viewport.notifyLayout()
  viewport.flushFrame()
  assert.deepEqual(changes, [])
  assert.equal(sizes.height, 780)

  canvas.clientHeight = 740
  viewport.notifyLayout()
  viewport.flushFrame()
  view.devicePixelRatio = 1.5
  view.dispatchEvent(new Event('resize'))
  viewport.flushFrame()
  assert.deepEqual(changes, [[390, 740, 3], [390, 740, 1.5]])

  unsubscribe()
  canvas.clientHeight = 760
  viewport.notifyLayout()
  viewport.flushFrame()
  assert.equal(changes.length, 2)
})

test('disposing Sizes removes resize sources and cancels pending work', () => {
  const viewport = createViewport()
  const { view, canvas } = viewport
  const sizes = new Sizes(canvas)
  sizes.onResize(() => assert.fail('disposed resize listener called'))

  canvas.clientHeight = 740
  view.dispatchEvent(new Event('resize'))
  assert.equal(viewport.frames.size, 1)
  sizes.dispose()
  view.dispatchEvent(new Event('resize'))
  view.visualViewport.dispatchEvent(new Event('resize'))
  viewport.notifyLayout()
  assert.equal(viewport.frames.size, 0)
  assert.equal(sizes.height, 780)
})
