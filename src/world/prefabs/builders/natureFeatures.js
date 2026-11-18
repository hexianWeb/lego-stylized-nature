import * as THREE from 'three/webgpu'
import { box, cylinder, flowerPlate, makePrefabScene, sector, stud } from './prefabParts.js'

export function buildSnowPine({ scale = 1 } = {}) {
  const foliage = []
  const snow = []
  // Stacked square boughs keep the pointed silhouette visibly brick-built.
  for (let level = 0; level < 5; level++) {
    const width = 0.64 - level * 0.12
    const y = 0.22 + level * 0.21
    foliage.push(box({ width, height: 0.15, depth: width, bottom: true }).translate(0, y, 0))
    snow.push(box({ width: width * 0.86, height: 0.045, depth: width * 0.86 })
      .translate(0, y + 0.15, 0))
    for (const side of [-1, 1]) {
      snow.push(stud().translate(side * width * 0.25, y + 0.195, 0))
    }
  }
  snow.push(stud().translate(0, 1.255, 0))
  const scene = makePrefabScene([
    { name: 'snowPine_root', color: '#66564d', parts: [cylinder({ radius: 0.07, height: 1.2, segments: 8 })] },
    { name: 'snowPine_leaf', color: '#245b52', parts: foliage },
    { name: 'snowPine_snow', color: '#eef6f7', parts: snow },
  ])
  scene.scale.setScalar(scale)
  return scene
}

export function buildIceCluster() {
  const ice = []
  const caps = []
  for (const { x, z, width, height } of [
    { x: -0.06, z: 0, width: 0.13, height: 0.42 },
    { x: 0.08, z: 0.04, width: 0.1, height: 0.25 },
    { x: 0.02, z: -0.09, width: 0.08, height: 0.17 },
  ]) {
    ice.push(box({ width, height, depth: width }).translate(x, 0, z))
    const tip = new THREE.CylinderGeometry(width * 0.2, width / Math.SQRT2, 0.08, 4)
    tip.rotateY(Math.PI / 4).translate(x, height + 0.04, z)
    caps.push(tip)
  }
  return makePrefabScene([
    { name: 'iceCluster_ice', color: '#91cfe5', parts: ice },
    { name: 'iceCluster_caps', color: '#d5eef4', parts: caps },
  ])
}

export function buildWaterLily() {
  const pads = [
    sector({ radius: 0.095, height: 0.014, segments: 12, thetaLength: Math.PI * 1.8, bottom: true }),
    sector({ radius: 0.055, height: 0.014, segments: 10, thetaStart: 1, thetaLength: Math.PI * 1.75, bottom: true })
      .translate(0.1, 0.004, -0.05),
  ]
  return makePrefabScene([
    { name: 'waterLily_pads', color: '#4c9066', parts: pads },
    {
      name: 'waterLily_InstanceColor',
      color: '#ffffff',
      parts: [
        flowerPlate({ outerRadius: 0.044, innerRadius: 0.026, height: 0.018, petals: 6 }).translate(0, 0.014, 0),
        flowerPlate({ outerRadius: 0.032, innerRadius: 0.019, height: 0.018, petals: 6 })
          .rotateY(Math.PI / 6).translate(0, 0.032, 0),
      ],
    },
    { name: 'waterLily_center', color: '#f5cf61', parts: [cylinder({ radius: 0.013, height: 0.012, segments: 6 }).translate(0, 0.05, 0)] },
  ])
}
