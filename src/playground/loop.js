export function startLoop({ renderer, postProcessing, controls }) {
  function tick() {
    controls.update()
    postProcessing.render()
  }

  renderer.setAnimationLoop(tick)
}
