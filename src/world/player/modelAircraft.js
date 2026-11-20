import * as THREE from 'three/webgpu'
import { applyFlameResponseScale, createEngineFlameVFX, normalizeEngineFlameConfig, resolveFlameResponseScale } from './engineFlameVFX.js'

/** fly.glb is authored nose +Z. Resources owns the source materials, textures and geometry. */
export function createModelAircraft(scene, flameConfig) {
  const root = scene.clone(true)
  const span = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).x
  root.rotation.y = Math.PI / 2
  root.traverse(node => {
    if (node.isMesh) node.castShadow = node.receiveShadow = true
  })
  const settings = normalizeEngineFlameConfig(flameConfig)
  const flames = []
  if (settings.enabled) {
    for (const name of ['left_engine', 'right_engine']) {
      const mount = root.getObjectByName(name)
      if (mount) flames.push(createEngineFlameVFX(mount, settings))
    }
  }
  return {
    root,
    // Keep the original world scale; frame third-person views for this wingspan.
    framing: THREE.MathUtils.clamp(span / 1.45, 0.45, 1.5),
    wingAnchors: { wingHalfWidth: 0.40, outwardOffset: 0.1, backOffset: -0.21, upOffset: 0.03 },
    update(boost, elapsed, speedRatio) {
      if (!flames.length) return
      const response = resolveFlameResponseScale(settings, speedRatio, boost)
      const values = applyFlameResponseScale(settings, response)
      for (const flame of flames) flame.update(elapsed, values)
    },
    dispose() {
      for (const flame of flames) flame.dispose()
      root.removeFromParent()
    },
  }
}
