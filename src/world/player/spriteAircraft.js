import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Original slice art. Row 0 is the nose; signed column is distance from the spine.
const WIDTH = 35
const LENGTH = 47
const LAYERS = 13
const PIXEL = 0.044
const SPACING = 0.033
const PAINT = [0x394658, 0x505f70, 0x748899, 0x93a6b2, 0xb8c8cb, 0xdeebe5]
const ORANGE = [0x9d4136, 0xe76541, 0xff9952]
const GLASS = [0x163746, 0x205a70, 0x36889b, 0x75d6d3, 0xc9fff0]

function paint(column, row, layer) {
  const d = Math.abs(column)
  const spine = Math.min(5.2, 0.7 + row * 0.19, 2.5 + (LENGTH - row) * 0.13)
  const hull = row < 43 && (d / spine) ** 2 + ((layer - 4) / 4.2) ** 2 <= 1
  const nacelle = row >= 20 && row <= 45 && d >= 2 && d <= 6 && (d - 4) ** 2 + (layer - 4) ** 2 < 9
  const wing = d >= 3 && d <= 16 && row >= 12 + d && row <= 30 + Math.floor(d * 0.31) && (layer === 4 || (layer === 3 && d < 15))
  const tail = d >= 3 && d <= 10 && row >= 32 + Math.floor(d * 0.65) && row <= 43 && (layer === 4 || layer === 5)
  const fin = layer >= 5 && d === 4 + Math.floor((layer - 5) / 4) && row >= 31 + layer - 5 && row <= 42
  const canopy = layer >= 7 && (column / 2.65) ** 2 + ((row - 16) / 6.4) ** 2 + ((layer - 7) / 5) ** 2 <= 1
  if (canopy) {
    if (row === 20 || row === 12) return 0x334455
    return GLASS[Math.min(4, Math.max(0, layer - 7 + (column < 0 ? 0 : -1)))]
  }
  if (fin) return layer >= 10 ? ORANGE[layer === 12 ? 2 : 1] : PAINT[column < 0 ? 3 : 2]
  if (nacelle && row >= 40) return row >= 44 && layer === 4 ? 0xffbc64 : PAINT[row % 3 === 0 ? 0 : 1]
  if (hull || nacelle) {
    if (row >= 23 && row <= 38 && d === 2 && layer >= 6) return ORANGE[1]
    if ((row === 9 || row === 28 || row === 39) && layer > 3) return PAINT[2]
    return PAINT[Math.max(0, Math.min(5, layer - 2 - (d >= 3 ? 1 : 0) + (column < 0 ? 1 : 0)))]
  }
  if (wing || tail) {
    if (d >= (tail ? 8 : 13)) return ORANGE[layer === 3 ? 0 : d % 3 ? 1 : 2]
    if (wing && (d === 9 || row === 25 && d >= 8 && d <= 10)) return PAINT[5]
    return PAINT[layer === 3 ? 1 : row >= (tail ? 42 : 29 + d * 0.31) ? 2 : 4]
  }
  return 0
}

function buildSliceMesh() {
  const pixels = new Uint8Array(WIDTH * LENGTH * LAYERS * 4)
  const offset = (x, y, k) => ((k * LENGTH + y) * WIDTH + x) * 4
  for (let k = 0; k < LAYERS; k++) {
    for (let y = 0; y < LENGTH; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const color = paint(x - (WIDTH - 1) / 2, y, k)
        if (color) pixels.set([color >> 16, color >> 8 & 255, color & 255, 255], offset(x, y, k))
      }
    }
  }
  const texture = new THREE.DataTexture(pixels, WIDTH, LENGTH * LAYERS)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = texture.minFilter = THREE.NearestFilter
  texture.needsUpdate = true
  const positions = [], uvs = [], indices = [], colors = []
  const quad = (corners, uv, shade) => {
    const i = positions.length / 3
    positions.push(...corners)
    uvs.push(...uv)
    for (let j = 0; j < 4; j++) colors.push(shade, shade, shade)
    indices.push(i, i + 1, i + 2, i, i + 2, i + 3)
  }
  const w = WIDTH * PIXEL / 2, l = LENGTH * PIXEL / 2
  for (let k = 0; k < LAYERS; k++) {
    const top = (k - 3) * SPACING, bottom = top - SPACING
    const v0 = k / LAYERS, v1 = (k + 1) / LAYERS
    quad([-w,top,l, w,top,l, w,top,-l, -w,top,-l], [0,v0, 1,v0, 1,v1, 0,v1], 1)
    // Give just the silhouette texels a rim. Side-on/edge-on views stay solid
    // during a roll, without making a separate mesh or draw call for each slice.
    const ink = (x, y) => x >= 0 && x < WIDTH && y >= 0 && y < LENGTH && pixels[offset(x, y, k) + 3]
    for (let y = 0; y < LENGTH; y++) {
      for (let x = 0; x < WIDTH; x++) {
        if (!ink(x, y)) continue
        const a = x * PIXEL - w, b = a + PIXEL, c = l - y * PIXEL, d = c - PIXEL
        const u = (x + 0.5) / WIDTH, v = (k + (y + 0.5) / LENGTH) / LAYERS
        const uv = [u,v, u,v, u,v, u,v]
        if (!ink(x - 1, y)) quad([a,top,c, a,top,d, a,bottom,d, a,bottom,c], uv, 0.73)
        if (!ink(x + 1, y)) quad([b,top,d, b,top,c, b,bottom,c, b,bottom,d], uv, 0.62)
        if (!ink(x, y - 1)) quad([b,top,c, a,top,c, a,bottom,c, b,bottom,c], uv, 0.83)
        if (!ink(x, y + 1)) quad([a,top,d, b,top,d, b,bottom,d, a,bottom,d], uv, 0.58)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const material = new THREE.MeshBasicMaterial({ map: texture, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'Kestrel • 13 pixel slices'
  mesh.castShadow = true
  return mesh
}

function buildExhaust() {
  const parts = []
  for (const side of [-1, 1]) {
    for (const [width, length, z, hex] of [[0.116, 0.16, -0.08, 0xfff19c], [0.086, 0.16, -0.24, 0xffa347], [0.047, 0.13, -0.385, 0xf66643]]) {
      const g = new THREE.BoxGeometry(width, width, length)
      g.translate(side * PIXEL * 4, 0, z)
      const color = new THREE.Color(hex).toArray()
      g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: g.attributes.position.count }, () => color).flat(), 3))
      parts.push(g)
    }
  }
  const geometry = mergeGeometries(parts)
  for (const g of parts) g.dispose()
  const plume = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }))
  plume.position.set(0, SPACING * 0.5, -(LENGTH / 2 - 1) * PIXEL)
  return plume
}

export function createSpriteAircraft() {
  const root = new THREE.Group()
  const body = buildSliceMesh()
  const exhaust = buildExhaust()
  root.add(body, exhaust)
  root.rotation.y = Math.PI / 2 // art nose +Z → flight nose +X
  return {
    root,
    framing: 1,
    wingAnchors: { wingHalfWidth: 0.67, outwardOffset: 0.035, backOffset: -0.29, upOffset: 0.03 },
    update(boost, elapsed) {
      exhaust.scale.z = (0.35 + boost * 1.65) * (1 + 0.1 * Math.sin(Math.floor(elapsed * 18) * 2.4))
    },
    dispose() {
      body.material.map.dispose()
      for (const mesh of [body, exhaust]) {
        mesh.geometry.dispose()
        mesh.material.dispose()
      }
      root.removeFromParent()
    },
  }
}
