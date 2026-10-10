# 程序化 Prefab Phase 0–1 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建程序化 prefab 基础设施（LEGO 单位、零件、组装、registry 接入），并以 `landFlower` 为试点替换 `flower.glb`（3452 面 → ≤ 220 面）。

**Architecture:** 三层：`legoUnits.js` / `legoColors.js` 定义尺寸与色板；`prefabParts.js` 提供低面零件与 `makePrefabScene`（按槽合并、对齐凸点原点、使用 `createLegoMaterial`）；`PrefabRegistry` 对 `builder` 变体调用构建函数并缓存、负责释放。下游 `PrefabPlacer` / `PrefabPipelineWarmup` 不改。

**Tech Stack:** three 0.185（`three/webgpu`、`three/addons/utils/BufferGeometryUtils.js`），Node 24 内置 test runner。

**Spec:** `docs/procedural-prefab-plan.md`

## Global Constraints

- 构建函数返回与 `gltf.scene` 同结构的 `THREE.Group`；纯函数，不读随机数。
- prefab 原点 `PREFAB_ORIGIN = [-0.05, 0, 0.05]`，整体 `min.y = 0`。
- 实例色 mesh 名以 `_InstanceColor` 结尾；每变体 ≤ 2 个 mesh。
- 材质基于 `createLegoMaterial()`（`src/materials/tsl/legoMaterial.js`），每个槽一个材质实例，归 `PrefabRegistry` 所有并由其释放。
- 几何体不保留 `uv`，全部为索引几何。
- `landFlower` 的 `instanceColors`、`placement`、`weight: 0.5` 保持不变。
- 工作区已有与本计划无关的未提交改动（含 `src/world/world.js`）：提交时只 `git add` 本计划列出的文件；`world.js` 用 `git add -p` 只暂存 `dispose` 那一处。
- 基线（2026-10-10）：`node --test` 共 252 项，242 通过、10 失败（`aircraftInput` 3、`environmentShadowFollow` 1、`prefabInstanceColorConfig` 2、`tiltShiftPostProcessing` 2、`worldCameraFollow` 2）。每个任务结束时失败项必须仍是这 10 项，不得新增。

## 实测数据（Phase 0 已完成部分）

`public/model/terrain/legoBlock2x2.glb`（172 面）相对 prefab 原点（即 `(height + 1) * layerHeight`）：

- 砖可见顶面在原点上方约 0.006（含 0.005 倒角）。
- 凸点半径 0.035，顶面在原点上方约 0.025，约 8 段。
- 因此从 `y = 0` 起建的零件底部会埋入砖顶约 0.006，不可见；底座半径需 > 0.035 才能盖住凸点。

`flower.glb`：`flower_root`（620 面，材质 `LegoGreen`，线性色 `(0.0529, 0.266, 0.0775)` = sRGB `#418d4f`）+ `flower_InstanceColor`（2832 面，无材质）。

## 文件结构

| 文件 | 职责 |
|---|---|
| Create `src/world/prefabs/builders/legoUnits.js` | LEGO 尺寸常量（由地形网格推导 + 实测凸点） |
| Create `src/world/prefabs/builders/legoColors.js` | builder 可用的命名色板 |
| Create `src/world/prefabs/builders/prefabParts.js` | 低面零件 `cylinder` / `box` / `stud` / `flowerPlate` 与 `makePrefabScene` |
| Create `src/world/prefabs/builders/flower.js` | `buildFlower()` |
| Create `src/world/prefabs/builders/index.js` | `prefabBuilders` 注册表 |
| Modify `src/world/prefabs/PrefabRegistry.js` | builder 分支、缓存、`dispose()` |
| Modify `src/world/world.js:345-347` | `dispose()` 中释放 registry |
| Modify `src/assets/manifests/biomePrefabs.js:122-133` | `landFlower` 改为 builder 变体 |
| Modify `src/assets/sources.js:31` | 删除 `landFlowerModel` |
| Delete `public/model/prefab/flower.glb` | |
| Create `test/prefabParts.test.js`、`test/prefabBuilders.test.js`、`test/prefabRegistry.test.js` | |
| Modify `test/experienceLifecycle.test.js:84-94` | 释放顺序包含 registry |
| Modify `docs/procedural-prefab-plan.md` | 花的面数预算 160 → 220、主色更正 |

---

### Task 0: 渲染基线（手动，无代码改动）

- [ ] **Step 1: 启动并固定机位**

Run: `pnpm dev`，浏览器打开 `http://localhost:5173/#debug`。保持默认 seed（`20260608`），不移动飞机，等待地形加载完成。

- [ ] **Step 2: 记录 forest 区域的三角面与 draw call**

在浏览器控制台执行：

```js
const info = __experience.renderer.instance.info.render
console.log({ triangles: info.triangles, drawCalls: info.drawCalls })
```

把输出连同 Performance 面板显示的帧时间记到 `docs/procedural-prefab-plan.md` 第 4 节 Phase 0 下（新增一行「基线：triangles=…, drawCalls=…, frame=…ms」）。

- [ ] **Step 3: 提交**

```bash
git add docs/procedural-prefab-plan.md
git commit -m "docs: 记录程序化 prefab 渲染基线"
```

---

### Task 1: LEGO 单位、色板与零件库

**Files:**
- Create: `src/world/prefabs/builders/legoUnits.js`
- Create: `src/world/prefabs/builders/legoColors.js`
- Create: `src/world/prefabs/builders/prefabParts.js`
- Test: `test/prefabParts.test.js`

**Interfaces:**
- Produces:
  - `legoUnits.js`: `STUD_PITCH: number`、`PLATE_HEIGHT: number`、`STUD_RADIUS: number`、`STUD_HEIGHT: number`、`PREFAB_ORIGIN: [number, number, number]`
  - `legoColors.js`: `LEGO_COLORS: { green: string, white: string }`
  - `prefabParts.js`:
    - `cylinder({ radius, height, segments, top = true, bottom = false }) => BufferGeometry`（底面在 y=0，按需保留顶/底盖）
    - `box({ width, height, depth, bottom = false }) => BufferGeometry`（底面在 y=0）
    - `stud() => BufferGeometry`（6 段，无底面，18 面）
    - `flowerPlate({ outerRadius, innerRadius, height, petals = 5 }) => BufferGeometry`（星形花板，无底面）
    - `makePrefabScene(slots: { name: string, color: string, parts: BufferGeometry[] }[]) => THREE.Group`

- [ ] **Step 1: 写失败测试 `test/prefabParts.test.js`**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { worldConfig } from '../src/world/WorldConfig.js'
import {
  PLATE_HEIGHT,
  PREFAB_ORIGIN,
  STUD_HEIGHT,
  STUD_PITCH
} from '../src/world/prefabs/builders/legoUnits.js'
import {
  box,
  cylinder,
  flowerPlate,
  makePrefabScene,
  stud
} from '../src/world/prefabs/builders/prefabParts.js'

const triangles = (geometry) => geometry.index.count / 3
const near = (a, b, epsilon = 1e-9) => Math.abs(a - b) < epsilon

test('LEGO units follow the terrain brick grid', () => {
  assert.ok(near(STUD_PITCH * 2, worldConfig.terrain.cellSize))
  assert.ok(near(PLATE_HEIGHT * 3, worldConfig.terrain.layerHeight))
  assert.deepEqual(PREFAB_ORIGIN, [-STUD_PITCH / 2, 0, STUD_PITCH / 2])
})

test('cylinder sits on y = 0 and keeps only the requested caps', () => {
  const plate = cylinder({ radius: 0.04, height: 0.03, segments: 6 })
  plate.computeBoundingBox()
  assert.equal(triangles(plate), 6 * 2 + 6)
  assert.ok(near(plate.boundingBox.min.y, 0))
  assert.ok(near(plate.boundingBox.max.y, 0.03))
  assert.equal(triangles(cylinder({ radius: 0.01, height: 0.1, segments: 4, top: false })), 8)
  assert.equal(triangles(cylinder({ radius: 0.01, height: 0.1, segments: 4, bottom: true })), 16)
})

test('box drops its bottom face unless asked to keep it', () => {
  assert.equal(triangles(box({ width: 0.1, height: 0.02, depth: 0.05 })), 10)
  assert.equal(triangles(box({ width: 0.1, height: 0.02, depth: 0.05, bottom: true })), 12)
})

test('stud is an open-bottom six-sided cylinder', () => {
  const geometry = stud()
  geometry.computeBoundingBox()
  assert.equal(triangles(geometry), 18)
  assert.ok(near(geometry.boundingBox.max.y, STUD_HEIGHT))
})

test('flowerPlate alternates outer and inner radii for each petal', () => {
  const geometry = flowerPlate({ outerRadius: 0.06, innerRadius: 0.036, height: 0.016 })
  const position = geometry.getAttribute('position')
  const radii = new Set()
  for (let i = 0; i < position.count; i++) {
    radii.add(Math.hypot(position.getX(i), position.getZ(i)).toFixed(4))
  }
  assert.equal(triangles(geometry), 30)
  assert.deepEqual([...radii].sort(), ['0.0000', '0.0360', '0.0600'])
})

test('makePrefabScene merges each slot into one LEGO-material mesh on the stud origin', () => {
  const scene = makePrefabScene([
    {
      name: 'part_root',
      color: '#418d4f',
      parts: [
        box({ width: 0.02, height: 0.02, depth: 0.02 }),
        new THREE.IcosahedronGeometry(0.01, 0).translate(0, 0.01, 0)
      ]
    },
    { name: 'part_InstanceColor', color: '#ffffff', parts: [stud()] }
  ])
  const meshes = scene.children

  assert.deepEqual(meshes.map((mesh) => mesh.name), ['part_root', 'part_InstanceColor'])
  for (const mesh of meshes) {
    assert.ok(mesh.geometry.index)
    assert.equal(mesh.geometry.getAttribute('uv'), undefined)
    assert.ok(mesh.material.isMeshPhysicalNodeMaterial)
    assert.equal(mesh.material.clearcoat, 0.3)
  }
  assert.notEqual(meshes[0].material, meshes[1].material)
  assert.equal(meshes[0].material.color.getHexString(), '418d4f')

  const bounds = new THREE.Box3().setFromObject(scene)
  assert.ok(near(bounds.min.y, 0))
  meshes[1].geometry.computeBoundingBox()
  const studCenter = meshes[1].geometry.boundingBox.getCenter(new THREE.Vector3())
  assert.ok(near(studCenter.x, PREFAB_ORIGIN[0]))
  assert.ok(near(studCenter.z, PREFAB_ORIGIN[2]))
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/prefabParts.test.js`
Expected: FAIL，`Cannot find module '.../builders/legoUnits.js'`

- [ ] **Step 3: 实现 `legoUnits.js`**

```js
import { worldConfig } from '../../WorldConfig.js'

const { cellSize, layerHeight } = worldConfig.terrain

export const STUD_PITCH = cellSize / 2
export const PLATE_HEIGHT = layerHeight / 3

// Measured from legoBlock2x2.glb. The brick's visible top face sits ~0.006 above
// the prefab origin, and its studs rise to ~0.025, so bases must exceed STUD_RADIUS.
export const STUD_RADIUS = 0.035
export const STUD_HEIGHT = 0.019

// Prefabs are centred on one of the 2x2 brick's four studs.
export const PREFAB_ORIGIN = [-STUD_PITCH / 2, 0, STUD_PITCH / 2]
```

- [ ] **Step 4: 实现 `legoColors.js`**

```js
export const LEGO_COLORS = {
  green: '#418d4f',
  white: '#ffffff'
}
```

- [ ] **Step 5: 实现 `prefabParts.js`**

```js
import * as THREE from 'three/webgpu'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { createLegoMaterial } from '../../../materials/tsl/legoMaterial.js'
import { PREFAB_ORIGIN, STUD_HEIGHT, STUD_RADIUS } from './legoUnits.js'

// Group indices assigned by three: CylinderGeometry 0 side / 1 top / 2 bottom; BoxGeometry 3 is -Y.
const CYLINDER_TOP = 1
const CYLINDER_BOTTOM = 2
const BOX_BOTTOM = 3

export function cylinder({ radius, height, segments, top = true, bottom = false }) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, segments)
  geometry.translate(0, height / 2, 0)
  return keepGroups(geometry, (index) =>
    (index !== CYLINDER_TOP || top) && (index !== CYLINDER_BOTTOM || bottom))
}

export function box({ width, height, depth, bottom = false }) {
  const geometry = new THREE.BoxGeometry(width, height, depth)
  geometry.translate(0, height / 2, 0)
  return keepGroups(geometry, (index) => index !== BOX_BOTTOM || bottom)
}

export function stud() {
  return cylinder({ radius: STUD_RADIUS, height: STUD_HEIGHT, segments: 6 })
}

export function flowerPlate({ outerRadius, innerRadius, height, petals = 5 }) {
  const geometry = cylinder({ radius: outerRadius, height, segments: petals * 2 })
  const position = geometry.getAttribute('position')
  const step = Math.PI / petals
  const innerScale = innerRadius / outerRadius

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const z = position.getZ(i)
    if (Math.hypot(x, z) < 1e-6) {
      continue
    }
    if (Math.abs(Math.round(Math.atan2(x, z) / step)) % 2 === 1) {
      position.setXYZ(i, x * innerScale, position.getY(i), z * innerScale)
    }
  }

  return geometry
}

export function makePrefabScene(slots) {
  const scene = new THREE.Group()

  for (const { name, color, parts } of slots) {
    const geometry = mergeGeometries(parts.map(toMergeable))
    geometry.translate(...PREFAB_ORIGIN)

    const material = createLegoMaterial()
    material.name = name
    material.color.set(color)

    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = name
    scene.add(mesh)
  }

  return scene
}

function keepGroups(geometry, keep) {
  const source = geometry.index.array
  const indices = []
  for (const group of geometry.groups) {
    if (!keep(group.materialIndex)) {
      continue
    }
    for (let i = group.start; i < group.start + group.count; i++) {
      indices.push(source[i])
    }
  }
  geometry.setIndex(indices)
  geometry.clearGroups()
  return geometry
}

// mergeGeometries needs identical attribute sets and all-indexed input.
function toMergeable(geometry) {
  geometry.deleteAttribute('uv')
  return geometry.index ? geometry : mergeVertices(geometry)
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `node --test test/prefabParts.test.js`
Expected: 6 项全部 PASS

- [ ] **Step 7: 全量测试无新增失败**

Run: `node --test --test-reporter=tap 2>&1 | Select-String -Pattern "^# (tests|pass|fail)|^not ok"`
Expected: `# fail 10`，失败项与 Global Constraints 中的基线一致。

- [ ] **Step 8: 提交**

```bash
git add src/world/prefabs/builders/legoUnits.js src/world/prefabs/builders/legoColors.js src/world/prefabs/builders/prefabParts.js test/prefabParts.test.js
git commit -m "feat: 新增 程序化 prefab 的 LEGO 单位与零件库"
```

---

### Task 2: 花的构建函数与 builder 注册表

**Files:**
- Create: `src/world/prefabs/builders/flower.js`
- Create: `src/world/prefabs/builders/index.js`
- Test: `test/prefabBuilders.test.js`
- Modify: `docs/procedural-prefab-plan.md`（3.5 节花的预算、2.2 节主色）

**Interfaces:**
- Consumes: Task 1 的 `cylinder`、`box`、`stud`、`flowerPlate`、`makePrefabScene`、`PLATE_HEIGHT`、`LEGO_COLORS`
- Produces:
  - `buildFlower() => THREE.Group`，子 mesh 依次为 `flower_root`、`flower_InstanceColor`
  - `prefabBuilders: Record<string, (params?: object) => THREE.Group>`，当前为 `{ flower: buildFlower }`

面数构成：底座 6 段圆板 18 + 3 根 4 段茎 24 + 2 片叶 20 = `flower_root` 62；3 个星形花板 (30 + 凸点 18) = `flower_InstanceColor` 144；合计 206。

- [ ] **Step 1: 写失败测试 `test/prefabBuilders.test.js`**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { prefabBuilders } from '../src/world/prefabs/builders/index.js'
import WorldMaterials from '../src/world/WorldMaterials.js'

const TRIANGLE_BUDGETS = { flower: 220 }
// Bounding box of the GLB each builder replaces (docs/procedural-prefab-plan.md §2.2).
const REFERENCE_SIZES = { flower: [0.29, 0.21, 0.28] }

function countTriangles(scene) {
  let total = 0
  scene.traverse((node) => {
    if (node.isMesh) {
      total += node.geometry.index.count / 3
    }
  })
  return total
}

for (const [name, build] of Object.entries(prefabBuilders)) {
  test(`${name} builder stays within its triangle budget`, () => {
    const triangles = countTriangles(build())
    assert.ok(TRIANGLE_BUDGETS[name] !== undefined, `${name} has no triangle budget`)
    assert.ok(triangles <= TRIANGLE_BUDGETS[name], `${name} has ${triangles} triangles`)
  })

  test(`${name} builder sits on the stud origin near its GLB size`, () => {
    const bounds = new THREE.Box3().setFromObject(build())
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())

    assert.ok(Math.abs(bounds.min.y) < 0.005, `min.y ${bounds.min.y}`)
    assert.ok(Math.abs(center.x + 0.05) < 0.03, `center.x ${center.x}`)
    assert.ok(Math.abs(center.z - 0.05) < 0.03, `center.z ${center.z}`)
    size.toArray().forEach((value, axis) => {
      const ratio = value / REFERENCE_SIZES[name][axis]
      assert.ok(ratio >= 0.75 && ratio <= 1.25, `${name} axis ${axis} size ratio ${ratio.toFixed(2)}`)
    })
  })

  test(`${name} builder is deterministic`, () => {
    const positions = (scene) => scene.children.map((mesh) =>
      Array.from(mesh.geometry.getAttribute('position').array))
    assert.deepEqual(positions(build()), positions(build()))
  })
}

test('flower builder exposes a root mesh and one instance color mesh', () => {
  const scene = prefabBuilders.flower()
  assert.deepEqual(scene.children.map((mesh) => mesh.name), ['flower_root', 'flower_InstanceColor'])
  assert.equal(scene.children[0].material.color.getHexString(), '418d4f')
})

test('tint and instance color resolution clone builder materials without mutating them', () => {
  const materials = new WorldMaterials()
  const [root, head] = prefabBuilders.flower().children
  const tinted = materials.resolvePrefabMaterial(root.material, { color: '#ff0000', strength: 0.5 })
  const instanced = materials.resolveInstanceColorMaterial(head.material)

  assert.notEqual(tinted, root.material)
  assert.equal(tinted.clearcoat, root.material.clearcoat)
  assert.notEqual(instanced, head.material)
  assert.equal(instanced.color.getHexString(), 'ffffff')
  assert.equal(root.material.color.getHexString(), '418d4f')
  materials.dispose()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/prefabBuilders.test.js`
Expected: FAIL，`Cannot find module '.../builders/index.js'`

- [ ] **Step 3: 实现 `flower.js`**

```js
import { LEGO_COLORS } from './legoColors.js'
import { PLATE_HEIGHT } from './legoUnits.js'
import { box, cylinder, flowerPlate, makePrefabScene, stud } from './prefabParts.js'

const HEAD_HEIGHT = 0.016
const STEMS = [
  { length: 0.13, tilt: 0.55, azimuth: Math.PI / 6 },
  { length: 0.12, tilt: 0.6, azimuth: (5 * Math.PI) / 6 },
  { length: 0.14, tilt: 0.55, azimuth: (3 * Math.PI) / 2 }
]

export function buildFlower() {
  const root = [cylinder({ radius: 0.04, height: PLATE_HEIGHT, segments: 6 })]
  const heads = []

  for (const { length, tilt, azimuth } of STEMS) {
    root.push(
      cylinder({ radius: 0.008, height: length, segments: 4, top: false })
        .rotateZ(-tilt)
        .rotateY(azimuth)
        .translate(0, PLATE_HEIGHT, 0)
    )

    const reach = length * Math.sin(tilt)
    const x = reach * Math.cos(azimuth)
    const y = PLATE_HEIGHT + length * Math.cos(tilt)
    const z = -reach * Math.sin(azimuth)
    heads.push(
      flowerPlate({ outerRadius: 0.06, innerRadius: 0.036, height: HEAD_HEIGHT }).translate(x, y, z),
      stud().translate(x, y + HEAD_HEIGHT, z)
    )
  }

  root.push(
    box({ width: 0.07, height: 0.006, depth: 0.028 }).rotateY(Math.PI / 4).translate(0.03, 0.05, 0.03),
    box({ width: 0.07, height: 0.006, depth: 0.028 }).rotateY(-Math.PI / 3).translate(-0.03, 0.07, -0.02)
  )

  return makePrefabScene([
    { name: 'flower_root', color: LEGO_COLORS.green, parts: root },
    { name: 'flower_InstanceColor', color: LEGO_COLORS.white, parts: heads }
  ])
}
```

- [ ] **Step 4: 实现 `index.js`**

```js
import { buildFlower } from './flower.js'

export const prefabBuilders = {
  flower: buildFlower
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test test/prefabBuilders.test.js`
Expected: 5 项全部 PASS。若尺寸断言失败，只调整 `STEMS` 的 `tilt` / `length`，不放宽容差。

- [ ] **Step 6: 更新计划书**

`docs/procedural-prefab-plan.md` 中：
- 3.5 节 `landFlower` 行：目标上限 `160` 改为 `220`，构建思路改为「6 段底座圆板 + 3 根 4 段茎 + 2 片扁盒叶（root）；3 个 5 瓣星形花板 + 凸点（InstanceColor）」。
- 2.2 节 `flower.glb` 主色 `LegoGreen #0d4414` 改为 `LegoGreen #418d4f（sRGB）`。

- [ ] **Step 7: 全量测试无新增失败**

Run: `node --test --test-reporter=tap 2>&1 | Select-String -Pattern "^# (tests|pass|fail)|^not ok"`
Expected: `# fail 10`，失败项与基线一致。

- [ ] **Step 8: 提交**

```bash
git add src/world/prefabs/builders/flower.js src/world/prefabs/builders/index.js test/prefabBuilders.test.js docs/procedural-prefab-plan.md
git commit -m "feat: 新增 程序化花 prefab 构建函数"
```

---

### Task 3: `PrefabRegistry` 支持 builder 变体与释放

**Files:**
- Modify: `src/world/prefabs/PrefabRegistry.js`（整文件）
- Modify: `src/world/world.js:345-347`
- Test: `test/prefabRegistry.test.js`（新建）
- Modify: `test/experienceLifecycle.test.js:84-94`

**Interfaces:**
- Consumes: Task 2 的 `prefabBuilders`
- Produces:
  - `new PrefabRegistry(resources, manifest = biomePrefabs, builders = prefabBuilders)`
  - `getVariantAsset(prefabId, variantIndex) => { scene: THREE.Group } | null`：`builder` 变体按 `prefabId:variantIndex` 缓存；未知 builder 返回 `null`
  - `dispose() => void`：释放所有构建出的 geometry 与 material，可重复调用

- [ ] **Step 1: 写失败测试 `test/prefabRegistry.test.js`**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import PrefabRegistry from '../src/world/prefabs/PrefabRegistry.js'

const manifest = {
  rock: { variants: [{ source: 'rockModel' }] },
  flower: { variants: [{ builder: 'testFlower', params: { size: 2 } }, { builder: 'missing' }] }
}

function createBuilders(calls) {
  return {
    testFlower(params) {
      calls.push(params)
      const scene = new THREE.Group()
      scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()))
      return scene
    }
  }
}

test('source variants still come from loaded resources', () => {
  const rockAsset = { scene: new THREE.Group() }
  const registry = new PrefabRegistry({ items: { rockModel: rockAsset } }, manifest, {})
  assert.equal(registry.getVariantAsset('rock', 0), rockAsset)
})

test('builder variants are built once with their params and cached', () => {
  const calls = []
  const registry = new PrefabRegistry({ items: {} }, manifest, createBuilders(calls))
  const first = registry.getVariantAsset('flower', 0)

  assert.ok(first.scene.isGroup)
  assert.equal(registry.getVariantAsset('flower', 0), first)
  assert.deepEqual(calls, [{ size: 2 }])
  assert.equal(registry.getVariantAsset('flower', 1), null)
})

test('dispose releases built geometry and materials exactly once', () => {
  const registry = new PrefabRegistry({ items: {} }, manifest, createBuilders([]))
  const mesh = registry.getVariantAsset('flower', 0).scene.children[0]
  let disposals = 0
  mesh.geometry.addEventListener('dispose', () => disposals++)
  mesh.material.addEventListener('dispose', () => disposals++)

  registry.dispose()
  registry.dispose()

  assert.equal(disposals, 2)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/prefabRegistry.test.js`
Expected: FAIL，builder 用例中 `first` 为 `undefined`（`Cannot read properties of undefined (reading 'scene')`），`dispose` 用例报 `registry.dispose is not a function`

- [ ] **Step 3: 实现 `PrefabRegistry.js`**

```js
import { biomePrefabs } from '../../assets/manifests/biomePrefabs.js'
import { prefabBuilders } from './builders/index.js'

export default class PrefabRegistry {
    constructor(resources, manifest = biomePrefabs, builders = prefabBuilders) {
        this.resources = resources
        this.manifest = manifest
        this.builders = builders
        this.builtAssets = new Map()
    }

    get(prefabId) {
        const entry = this.manifest[prefabId]
        if (!entry) {
            return null
        }
        return { id: prefabId, entry }
    }

    getVariantAsset(prefabId, variantIndex) {
        const entry = this.manifest[prefabId]
        const variant = entry?.variants[variantIndex]
        if (!variant) {
            return null
        }
        if (variant.builder) {
            return this.getBuiltAsset(`${prefabId}:${variantIndex}`, variant)
        }
        return this.resources.items[variant.source]
    }

    getBuiltAsset(key, variant) {
        if (!this.builtAssets.has(key)) {
            const build = this.builders[variant.builder]
            this.builtAssets.set(key, build ? { scene: build(variant.params) } : null)
        }
        return this.builtAssets.get(key)
    }

    dispose() {
        for (const asset of this.builtAssets.values()) {
            asset?.scene.traverse((node) => {
                if (node.isMesh) {
                    node.geometry.dispose()
                    node.material.dispose()
                }
            })
        }
        this.builtAssets.clear()
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/prefabRegistry.test.js`
Expected: 3 项全部 PASS

- [ ] **Step 5: 修改 `test/experienceLifecycle.test.js` 的释放顺序用例（第 84–94 行）**

```js
test('World releases borrowers before shared materials and cloned geometry exactly once', () => {
  const world = new World({ scene: new THREE.Scene() })
  const calls = []
  world.children = [{ dispose: () => calls.push('child') }]
  world.terrainChunkManager = { dispose: () => calls.push('slots') }
  world.prefabRegistry = { dispose: () => calls.push('registry') }
  world.materials = { dispose: () => calls.push('materials') }
  world.brickGeometry = { dispose: () => calls.push('geometry') }
  world.dispose()
  world.dispose()
  assert.deepEqual(calls, ['child', 'slots', 'registry', 'materials', 'geometry'])
})
```

- [ ] **Step 6: 运行确认失败**

Run: `node --test test/experienceLifecycle.test.js`
Expected: FAIL，实际顺序缺少 `'registry'`

- [ ] **Step 7: 修改 `src/world/world.js` 的 `dispose()`**

在 `this.terrainChunkManager = null` 与 `this.materials?.dispose()` 之间插入一行（可选调用，因为 `experienceLifecycle.test.js` 的 warmup 用例使用了没有 `dispose` 的 registry mock）：

```js
        this.terrainChunkManager?.dispose()
        this.terrainChunkManager = null
        this.prefabRegistry?.dispose?.()
        this.materials?.dispose()
```

- [ ] **Step 8: 运行确认通过**

Run: `node --test test/experienceLifecycle.test.js test/prefabRegistry.test.js`
Expected: 全部 PASS

- [ ] **Step 9: 全量测试无新增失败**

Run: `node --test --test-reporter=tap 2>&1 | Select-String -Pattern "^# (tests|pass|fail)|^not ok"`
Expected: `# fail 10`，失败项与基线一致。

- [ ] **Step 10: 提交（`world.js` 只暂存本处改动）**

```bash
git add src/world/prefabs/PrefabRegistry.js test/prefabRegistry.test.js test/experienceLifecycle.test.js
git add -p src/world/world.js
git commit -m "feat: 新增 PrefabRegistry 支持程序化 builder 变体"
```

---

### Task 4: `landFlower` 切换到 builder，视觉验收后删除 GLB

**Files:**
- Modify: `src/assets/manifests/biomePrefabs.js:122-133`
- Modify: `src/assets/sources.js:31`
- Delete: `public/model/prefab/flower.glb`
- Modify: `test/prefabBuilders.test.js`（追加 manifest 用例）

**Interfaces:**
- Consumes: Task 2 的 `prefabBuilders.flower`、Task 3 的 builder 分支

- [ ] **Step 1: 在 `test/prefabBuilders.test.js` 追加 manifest 用例**

文件顶部追加 import：

```js
import { biomePrefabs } from '../src/assets/manifests/biomePrefabs.js'
import sources from '../src/assets/sources.js'
import { matchesInstanceColorMesh } from '../src/world/prefabs/prefabInstanceColor.js'
```

文件末尾追加：

```js
test('every manifest variant resolves to a loaded source or a registered builder', () => {
  const sourceNames = new Set(sources.map((source) => source.name))
  for (const [prefabId, entry] of Object.entries(biomePrefabs)) {
    for (const variant of entry.variants) {
      const resolved = variant.builder
        ? variant.builder in prefabBuilders
        : sourceNames.has(variant.source)
      assert.ok(resolved, `${prefabId} variant ${variant.builder ?? variant.source} is unresolved`)
    }
  }
})

test('builder variants expose the instance color mesh their prefab expects', () => {
  for (const [prefabId, entry] of Object.entries(biomePrefabs)) {
    if (!entry.instanceColors) {
      continue
    }
    for (const variant of entry.variants.filter((v) => v.builder)) {
      const names = prefabBuilders[variant.builder](variant.params).children.map((mesh) => mesh.name)
      assert.ok(
        names.some((name) => matchesInstanceColorMesh(name, entry.instanceColors.meshNameSuffix)),
        `${prefabId} has no ${entry.instanceColors.meshNameSuffix} mesh`
      )
    }
  }
})

test('landFlower is built procedurally', () => {
  assert.deepEqual(biomePrefabs.landFlower.variants, [{ builder: 'flower', weight: 0.5 }])
})
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/prefabBuilders.test.js`
Expected: `landFlower is built procedurally` FAIL（当前为 `source: 'landFlowerModel'`），其余 PASS

- [ ] **Step 3: 修改 manifest 的 `landFlower.variants`**

```js
  landFlower: {
    category: 'flora',
    placement: { surface: 'land', biomes: ['forest', 'autumnForest'] },
    variants: [
      { builder: 'flower', weight: 0.5 }
    ],
    randomRotation: true,
    instanceColors: {
      meshNameSuffix: '_InstanceColor',
      palette: ['#ff1111', '#ffff00', '#ffffff']
    }
  }
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/prefabBuilders.test.js`
Expected: 全部 PASS

- [ ] **Step 5: 视觉与性能验收（手动）**

Run: `pnpm dev`，打开 `http://localhost:5173/#debug`，与 Task 0 同样不移动飞机。检查：

1. 控制台无 `has no mesh matching instance color suffix` 与新增的 `exceeded capacity` 警告。
2. 花底座落在凸点上、不浮空、不明显陷入；拉近看 90° 旋转的几株仍对齐凸点。
3. 花头颜色来自调色板（红 / 黄 / 白），茎叶为绿色，光泽与地形砖一致。
4. 阴影正常。
5. 控制台执行 Task 0 的命令，`triangles` 明显低于基线，`drawCalls` 不高于基线；帧时间不劣于基线。

不满意时只调整 `flower.js` 的常量，并重跑 `node --test test/prefabBuilders.test.js`。

- [ ] **Step 6: 删除 GLB 与 source**

删除 `src/assets/sources.js` 第 31 行：

```js
  { name: 'landFlowerModel', type: 'gltfModel', path: 'model/prefab/flower.glb' }
```

然后删除文件：

```powershell
git rm public/model/prefab/flower.glb
```

- [ ] **Step 7: 全量测试无新增失败**

Run: `node --test --test-reporter=tap 2>&1 | Select-String -Pattern "^# (tests|pass|fail)|^not ok"`
Expected: `# fail 10`，失败项与基线一致。

- [ ] **Step 8: 记录结果并提交**

在 `docs/procedural-prefab-plan.md` 第 4 节 Phase 1 下追加一行「结果：triangles=…, drawCalls=…, frame=…ms」。

```bash
git add src/assets/manifests/biomePrefabs.js src/assets/sources.js test/prefabBuilders.test.js docs/procedural-prefab-plan.md
git commit -m "feat: 新增 花 prefab 改为程序化生成并移除 flower.glb"
```
