# 程序化 Prefab 迁移计划书

## 1. 目标与范围

把场景中由简单几何体组成的 biome prefab 从 GLB 改为 JS 程序生成，降低三角面数，同时保持现有放置、调色（biomeTints）与实例色（instanceColors）行为不变。

**在范围内**：`src/assets/manifests/biomePrefabs.js` 中的几何体类 prefab（花、草、蘑菇、浮萍、芦苇、仙人掌、枯枝、火山石、气泡）。

**不在范围内**（保持 GLB 不动）：

- 有机造型：`skull.glb`、三种树（`tree` / `fruittree` / `Ctree`）。
- 非 biome prefab：`legoBlock2x2.glb`（地形砖）、`fly.glb`（玩家）。
- 已足够轻量的普通石头 `rock_1~4.glb`（20–34 面）。

**非目标**：不做每实例独立几何体、不做 L-system / 噪声位移、不做 shader 内几何变形、不做建模 DSL 或可视化编辑器。

## 2. 现状数据

### 2.1 面数与使用密度

| prefab id | 源文件 | 三角面 | 投放（biome: 密度） | 材质槽 |
|---|---|---|---|---|
| `landFlower` | `flower.glb` | 3452 | forest 0.05, autumnForest 0.0225 | `flower_InstanceColor`, `flower_root` |
| `volcanoRock` | `volcano_rock.glb` / `volcano_rock_2.glb` | 2054 / 1337 | volcano 0.09（权重 0.3 / 0.7） | `volcano_rock_InstanceColor`, `volcano_rock` |
| `deadBush` | `dead_bush.glb` | 2691 | desert 0.02 | 1 |
| `desertCactusSmall` | `cactus.glb` | 2374 | desert 0.0175 | 1 |
| `waterDuckweed` | `duckweed.glb` | 2052 | forest 0.02, autumnForest 0.0175（水面） | 1 |
| `phragmites` | `phragmites.glb` | 1056 | forest 0.015, autumnForest 0.0125（水面） | 1 mesh / 3 材质 |
| `landGrass` | `grass.glb` / `grass_2.glb` / `grass_3.glb` | 328 / 224 / 719 | forest/autumn 0.06, desert 0.005 | 1 |
| `landMushroom` | `mushroom_1.glb` | 492 | forest/autumn 0.03, desert 0.0025 | `leaf`, `mushroom_InstanceColor`, `mushroom_root` |
| `waterBubble` | `bubble.glb` | 58 | forest 0.0125, autumnForest 0.01 | 1 |

所有 prefab `castShadow = true`，阴影 pass 再绘制一遍，实际顶点处理量约为上表 ×2。

按「密度 × 面数」估算每 1000 格的面数：火山石约 15 万、花约 17 万（forest）、枯枝约 5 万、仙人掌约 4 万、浮萍约 4 万（每 1000 水面格）。迁移收益集中在前五项。

### 2.2 尺寸与原点（从 GLB 包围盒测得，单位：世界坐标）

| 源文件 | 尺寸 X×Y×Z | minY | XZ 中心 | 主色 |
|---|---|---|---|---|
| `flower.glb` | 0.29×0.21×0.28 | 0 | (-0.05, 0.06) | LegoGreen `#0d4414` |
| `volcano_rock.glb` | 0.13×0.19×0.14 | 0 | (-0.05, 0.05) | `#ff0400` + `#030303` |
| `volcano_rock_2.glb` | 0.09×0.10×0.08 | 0 | (-0.05, 0.06) | `#030303` |
| `dead_bush.glb` | 0.10×0.18×0.08 | 0 | (-0.05, 0.05) | `#8d3b09` |
| `cactus.glb` | 0.10×0.36×0.26 | 0 | (-0.05, 0.05) | 贴图/默认 |
| `duckweed.glb` | 0.14×0.07×0.13 | 0 | (-0.05, 0.06) | `#157513` |
| `phragmites.glb` | 0.11×0.30×0.10 | 0 | (-0.04, 0.04) | `#122f04` `#254f12` `#774c1c` |
| `grass.glb` / `grass_2.glb` | 0.12×0.18 / 0.15×0.12 | 0 | (-0.05, 0.05) | `#0d5e15` |
| `grass_3.glb` | 0.47×0.21×0.42 | 0 | (-0.05, 0.01) | `#006604` |
| `mushroom_1.glb` | 0.09×0.12×0.09 | 0 | (-0.05, 0.05) | `#cccccc` `#950101` `#58512c` |
| `bubble.glb` | 0.08×0.05×0.08 | 0 | (-0.05, 0.05) | 贴图 |

### 2.3 必须保持的约束

1. **原点与凸点对齐**：`makePrefabTransform` 把实例放在格子中心 `(x + 0.5) * cellSize`、砖顶 `(height + 1) * layerHeight`。`cellSize = 0.2` 即一块 2×2 砖，凸点间距 0.1；源模型 XZ 中心都偏移到 `(-0.05, +0.05)`，正好落在一个凸点上，配合 `rotationStep = π/2` 随机落在四个凸点之一。程序模型必须以 `(-0.05, 0, 0.05)` 为底部中心构建，`minY = 0`。
2. **mesh 命名约定**：
   - 实例色：名称以 `_InstanceColor` 结尾（`matchesInstanceColorMesh`）。
   - 树（本次不迁移）：名称含 `leaf` / `root`（`treeMaterial.js`）。
3. **材质**：`resolvePrefabMaterial` / `resolveInstanceColorMaterial` 以源材质为缓存键克隆调色材质，因此同色零件应共享同一个材质实例。
4. **draw call**：每个「变体 × mesh × biome 分桶」是一个 `InstancedMesh`，阴影再 ×1。每个 prefab 变体 ≤ 3、mesh ≤ 2。

## 3. 技术方案

### 3.1 接入点：只改 `PrefabRegistry`

`PrefabPlacer.build()` 与 `PrefabPipelineWarmup` 都只通过 `prefabRegistry.getVariantAsset(id, i)?.scene` 取模型并遍历 mesh。构建函数返回与 `gltf.scene` 同结构的 `THREE.Group`，下游零改动。

manifest 变体新增 `builder` 写法，与 `source` 并存：

```js
landFlower: {
  category: 'flora',
  placement: { surface: 'land', biomes: ['forest', 'autumnForest'] },
  variants: [
    { builder: 'flower', params: { petals: 5 }, weight: 1 }
  ],
  randomRotation: true,
  instanceColors: { meshNameSuffix: '_InstanceColor', palette: [/* 不变 */] }
}
```

`PrefabRegistry` 改动（约 20 行）：

```js
getVariantAsset(prefabId, variantIndex) {
  const variant = this.manifest[prefabId]?.variants[variantIndex]
  if (!variant) return null
  if (variant.builder) return this.getBuiltAsset(prefabId, variantIndex, variant)
  return this.resources.items[variant.source]
}

getBuiltAsset(prefabId, variantIndex, variant) {
  const key = `${prefabId}:${variantIndex}`
  if (!this.builtAssets.has(key)) {
    const build = prefabBuilders[variant.builder]
    this.builtAssets.set(key, build ? { scene: build(variant.params) } : null)
  }
  return this.builtAssets.get(key)
}

dispose() { /* 遍历 builtAssets，释放 geometry 与 material */ }
```

生命周期：GLB 几何体归 `Resources` 所有；程序几何体归 `PrefabRegistry` 所有，需在 `World.dispose()` 中调用 `prefabRegistry.dispose()`（当前 `world.js` 只把它置为 `null`）。

### 3.2 文件结构

```
src/world/prefabs/builders/
  index.js            // export const prefabBuilders = { flower, volcanoRock, ... }
  prefabParts.js      // makePrefabScene、stud、共享材质缓存、单位常量
  flower.js
  volcanoRock.js
  ...
```

### 3.3 公共工具 `prefabParts.js`

- **单位常量**：`STUD_PITCH = 0.1`、`STUD_ORIGIN = [-0.05, 0, 0.05]`、凸点半径/高度（Phase 0 从 `legoBlock2x2.glb` 量取）。
- **`stud()`**：8 段圆柱、底面开口，24 面。
- **`makePrefabScene(slots)`**：输入 `[{ name, color, parts: BufferGeometry[] }]`，每个槽 `mergeGeometries`（`three/addons/utils/BufferGeometryUtils.js`）合并为一个 mesh，删除 `uv`，整体平移到 `STUD_ORIGIN`，返回 `THREE.Group`。
- **`getPartMaterial(color)`**：按颜色缓存 `MeshStandardMaterial({ color, roughness, metalness: 0 })`，保证同色共享实例（约束 3）。

### 3.4 构建函数约定

- 纯函数：`build(params) => THREE.Group`，同参数同结果，不读随机数（多样性来自 manifest 的多个变体和实例旋转/颜色）。
- 只用低分段基本体：`BoxGeometry`、`CylinderGeometry`（5–8 段）、`ConeGeometry`、`IcosahedronGeometry`（detail 0）、`SphereGeometry`（≤ 8×6）。
- 零件先 `rotate*` / `translate` 到位再交给 `makePrefabScene`。
- 风格以 LEGO 零件为词汇：圆板、砖、锥、植物叶片件、凸点；不追求还原原模型顶点。

### 3.5 面数预算

| prefab | 现有 | 目标上限 | 构建思路 |
|---|---|---|---|
| `landFlower` | 3452 | 160 | 细圆柱茎 + 2 片扁盒叶（root）；5 瓣扁圆柱花瓣 + 花心圆板（InstanceColor） |
| `volcanoRock` 变体 0 | 2054 | 100 | 2–3 个 icosahedron 堆叠（深色）+ 1 个嵌入的发光块（InstanceColor） |
| `volcanoRock` 变体 1 | 1337 | 60 | 1–2 个 icosahedron |
| `deadBush` | 2691 | 120 | 4–6 段 5 边细圆柱分叉枝 |
| `desertCactusSmall` | 2374 | 120 | 6 段圆柱主干 + 1–2 个 L 形侧臂 + 顶部凸点 |
| `waterDuckweed` | 2052 | 60 | 3–4 片 8 段扁圆板，错落高度 |
| `phragmites` | 1056 | 120 | 3 根细茎 + 穗（拉长锥体），3 色合并为 1–2 槽 |
| `landGrass` ×3 | 328/224/719 | 60/60/150 | 3–5 片锥形草叶；变体 3 为大簇 |
| `landMushroom` | 492 | 100 | 圆柱柄（root）+ 半球伞盖（InstanceColor）+ 小叶 |
| `waterBubble` | 58 | 40 | 低段球或半球；可选，收益很小 |

## 4. 实施阶段

### Phase 0：准备（无功能变化）

1. 运行 `pnpm test` 记录基线。已知 `test/prefabInstanceColorConfig.test.js` 当前 2/3 失败（manifest 的调色板与蘑菇权重和测试期望不一致），与本迁移无关，需先确认以 manifest 为准还是以测试为准。
2. 在 `pnpm dev` + `#debug` 下固定 seed 与机位，记录 forest / desert / volcano 三处的 `renderer.info.render.triangles`、draw calls 与帧时间作为对比基线。
3. 从 `legoBlock2x2.glb` 量取凸点半径与高度，写入 `prefabParts.js` 常量。

### Phase 1：基础设施 + 试点 `landFlower`

1. 新增 `prefabParts.js`、`builders/index.js`、`builders/flower.js`。
2. `PrefabRegistry` 支持 `builder` 变体与 `dispose()`；`World.dispose()` 调用它。
3. manifest 中 `landFlower` 改为 builder 变体（调色板、密度不变）。
4. 新增 `test/prefabBuilders.test.js`（见第 5 节）。
5. 视觉对比通过后，删除 `flower.glb` 与 `sources.js` 中的 `landFlowerModel`。

验收：花外观风格一致、实例色正常、`flower_InstanceColor` 无缺失警告，forest 场景三角面明显下降。

### Phase 2：高收益项

按顺序：`volcanoRock` → `waterDuckweed` → `deadBush` → `desertCactusSmall`。每项独立提交：新增 builder → 改 manifest → 跑测试 → 视觉对比 → 删除 GLB 与 source。

### Phase 3：剩余项

`landGrass`（3 变体）→ `phragmites` → `landMushroom` → `waterBubble`（可选）。

### Phase 4：清理

- 删除未被加载的 `pumice.glb`、`pine.glb`、`coconut_tree.glb`。
- 若所有 builder 变体都已迁移，确认 `sources.js` 中不再有对应条目，`Resources` 加载项相应减少。
- 更新 `AGENTS.md` 中关于 prefab 来源的说明（若有）。

## 5. 验证方案

### 5.1 自动化：`test/prefabBuilders.test.js`

对 `prefabBuilders` 中每个构建函数及 manifest 中每个 builder 变体：

- **面数预算**：遍历 mesh 统计 `index.count / 3`，不超过第 3.5 节上限。
- **命名**：若 prefab 配置了 `instanceColors`，至少一个 mesh 名匹配 `meshNameSuffix`。
- **原点**：整体包围盒 `min.y ≈ 0`（±0.005），XZ 中心 ≈ `(-0.05, 0.05)`（±0.02）。
- **尺寸**：包围盒与第 2.2 节原 GLB 尺寸误差 ±25%。
- **manifest 完整性**：每个变体要么 `source` 存在于 `sources.js`，要么 `builder` 存在于 `prefabBuilders`。
- **释放**：`PrefabRegistry.dispose()` 后几何体与材质的 `dispose` 被调用。

现有 `prefabPlacer*.test.js`、`prefabPipelineWarmup.test.js` 应无需修改即可通过；若其中构造了 mock registry，保持不变。

### 5.2 手动

- `pnpm dev` + `#debug`，用 Phase 0 的固定 seed 与机位对比三角面、draw calls、帧时间。
- 检查：物体是否浮空或陷入地面、是否落在凸点上、90° 旋转后是否仍对齐、biomeTints 下颜色是否正确、实例色调色板是否生效、阴影是否正常。
- 控制台不应出现 `has no mesh matching instance color suffix` 或 `exceeded capacity` 新警告。

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| 程序模型风格与现有 GLB / 地形砖不统一 | 统一用 `prefabParts.js` 的单位与凸点；试点先只做花，确认风格后再推广 |
| 原点偏移导致悬空/穿插 | 测试断言 `min.y` 与 XZ 中心 |
| 共享材质被调色逻辑误改 | 调色逻辑本就克隆材质；测试中验证 builder 材质在 `resolvePrefabMaterial` 后未被修改 |
| 变体或 mesh 过多导致 draw call 增加 | 变体 ≤ 3、mesh ≤ 2，Phase 0 基线对比 draw calls |
| 迁移中途新旧混用 | `source` 与 `builder` 可在同一 manifest 共存，每个 prefab 独立切换、独立回滚 |

## 7. 交付物清单

- `src/world/prefabs/builders/prefabParts.js`
- `src/world/prefabs/builders/index.js` 与各 prefab 构建文件
- `src/world/prefabs/PrefabRegistry.js`（builder 分支、缓存、`dispose`）
- `src/world/world.js`（`dispose` 中释放 registry）
- `src/assets/manifests/biomePrefabs.js`、`src/assets/sources.js`（逐项切换与删除）
- `test/prefabBuilders.test.js`
- 删除已迁移及未使用的 GLB 文件
