export function startLoop({ renderer, postProcessing }) {
  function tick() {
    postProcessing.render()
  }

  renderer.setAnimationLoop(tick)
}
