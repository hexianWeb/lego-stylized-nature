# 程序化 Prefab 迁移计划书

## 1. 目标与范围

把场景中由简单几何体组成的 biome prefab 从 GLB 改为 JS 程序生成，优先保持画面一致性，再减少几何体开销；现有放置、调色（biomeTints）与实例色（instanceColors）行为不变。轮廓、比例、厚度、缝隙、圆润边缘与材质高光均属于外观验收，不能为了面数目标省掉可见特征。

2026-10-11 用户对草提出新设计要求：`landGrass` 改为短草、长草两款原创 LEGO 小草，均为 1×1 方底座；叶片比初稿加厚 50%。草以这组设计规格验收，不要求还原旧三种 GLB 的造型、包围盒或变体数量。

2026-10-11 用户进一步明确本轮火山石、小仙人掌和芦苇的精度标准：物件在场景中显示很小，保留常用机位下可辨认的主要轮廓即可，三角面削减约 50% 或更多（剩余不超过原 GLB 的一半）。不追求精细复刻或微小几何细节，达标后停止无必要细化；透明渲染、落地、原色、投放和资源释放仍需正确。该标准优先于本文此前的细节还原要求。

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
| `flower.glb` | 0.29×0.21×0.28 | 0 | (-0.05, 0.06) | LegoGreen `#418d4f`（sRGB） |
| `volcano_rock.glb` | 0.13×0.19×0.14 | 0 | (-0.05, 0.05) | `#ff1f06`（opacity=0.7）+ `#1e1e1e` |
| `volcano_rock_2.glb` | 0.09×0.10×0.08 | 0 | (-0.05, 0.06) | `#1e1e1e` |
| `dead_bush.glb` | 0.10×0.18×0.08 | 0 | (-0.05, 0.05) | `#8d3b09` |
| `cactus.glb` | 0.10×0.36×0.26 | 0 | (-0.05, 0.05) | 内嵌绿色图集，简化为面积加权均色 `#32692f` |
| `duckweed.glb` | 0.14×0.07×0.13 | 0 | (-0.05, 0.06) | `#51b44c`（sRGB） |
| `phragmites.glb` | 0.11×0.30×0.10 | 0 | (-0.05, 0.05) | `#4c7720` `#6b974b` `#b6945d`（sRGB） |
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
4. **draw call**：每个「变体 × mesh × biome 分桶」是一个 `InstancedMesh`，阴影再 ×1。每个 prefab 变体 ≤ 3，通常 mesh ≤ 2；蘑菇和芦苇保留三种原材质，使用 3 个槽。

## 3. 技术方案

### 3.1 接入点：只改 `PrefabRegistry`

`PrefabPlacer.build()` 与 `PrefabPipelineWarmup` 都只通过 `prefabRegistry.getVariantAsset(id, i)?.scene` 取模型并遍历 mesh。构建函数返回与 `gltf.scene` 同结构的 `THREE.Group`，下游零改动。

manifest 变体新增 `builder` 写法，与 `source` 并存：

```js
landFlower: {
  category: 'flora',
  placement: { surface: 'land', biomes: ['forest', 'autumnForest'] },
  variants: [
    { builder: 'flower', weight: 0.5 }
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
  legoUnits.js        // 地形网格尺寸、实测凸点、prefab 原点
  legoColors.js       // builder 命名色板
  prefabParts.js      // 几何零件、makePrefabScene
  flower.js
  volcanoRock.js
  ...
```

### 3.3 公共工具 `prefabParts.js`

- **单位常量**（地形即真实 LEGO 比例：2×2 砖 = `cellSize`，砖高 ≈ 1.2 × 凸点间距）：
  - `STUD_PITCH = cellSize / 2 = 0.1`、`BRICK_HEIGHT = layerHeight = 0.095`、`PLATE_HEIGHT = layerHeight / 3 ≈ 0.032`。
  - 实测凸点半径 `STUD_RADIUS = 0.035`、高 `STUD_HEIGHT = 0.019`；砖可见顶面在 prefab 原点上方约 0.006，凸点顶面约 0.025。
  - `PREFAB_ORIGIN = [-0.05, 0, 0.05]`。
- **Phase 1 零件 API**：`cylinder({ radius, height, segments, top, bottom })`、`box({ width, height, depth, bottom })`、`flowerPlate({ outerRadius, innerRadius, height, petals })`、`stud()`。尺寸使用世界坐标，底面从 `y = 0` 起建，板高与凸点尺寸来自 `legoUnits.js`；后续可按需要增加 LEGO 单位包装。
- **`stud()`**：当前默认 6 段圆柱、底面开口，18 面；可按轮廓与高光需要增加分段或小倒角，不受 6–8 段限制。
- **`makePrefabScene(slots)`**：输入 `[{ name, color, parts: BufferGeometry[] }]`，最多两个槽。合并前使用独立的 Float32 `position` / `normal` 缓冲，不保留 `uv`；缺失法线时计算法线，对非索引几何体做 `mergeVertices`，保证索引与属性一致。每个槽合并为一个 mesh，整体平移到 `PREFAB_ORIGIN`，返回 `THREE.Group`。函数接管临时零件并在合并后释放，返回资源归 registry 所有。
- **槽材质**：基于 `createLegoMaterial()`（`src/materials/tsl/legoMaterial.js`，与地形砖相同的 Physical + clearcoat/sheen 参数）设置颜色。同色零件已合并进同一个槽，因此每个槽一个材质实例即满足约束 3，不需要全局颜色缓存；材质随构建结果归 `PrefabRegistry` 所有并由其释放。`resolvePrefabMaterial` / `resolveInstanceColorMaterial` 使用 `clone()`，塑料参数随之保留。
- **色板**：builder 只从命名色板取色，不直接写十六进制。

### 3.4 构建函数约定

- 纯函数：`build(params) => THREE.Group`，同参数同结果，不读随机数（多样性来自 manifest 的多个变体和实例旋转/颜色）。
- 优先使用基本体或简单自定义几何体；分段数按参考模型和实际机位决定，可增加弧面细分、细茎分段、球面细分与小倒角。
- 零件先 `rotate*` / `translate` 到位再交给 `makePrefabScene`。
- 风格以 LEGO 零件为词汇：圆板、砖、锥、植物叶片件、凸点；还原参考模型的可见造型，不要求顶点布局相同。
- 可见圆润边缘按需要用几何倒角与合适的法线表现；AO 与 clearcoat 配合几何体使用。

### 3.4.1 面数规则

- **优先去掉确认不可见的面**：贴地或完全被覆盖的底面/盖面可移除；水面、缝隙和斜视角中能看见的底部与连接面必须保留。
- **分段数按外观选择**：当前默认分段仅是起点，圆板可用 12–24 段，细茎可用 6–8 段；近景轮廓或高光需要时继续增加。不可用低分段多面体替代参考模型的圆润特征。
- 不保留 `uv`，几何体保持索引。
- 同材质零件合并为一个 mesh，通常每变体 ≤ 2 槽（普通 + `_InstanceColor`）；蘑菇和芦苇为保留三种原材质使用 3 槽。
- 可选：小型地被（浮萍、草、气泡）关闭投影，阴影 pass 顶点量减半。需在 manifest 增加 `castShadow` 字段，并替换 `PrefabPlacer` / `PrefabPipelineWarmup` 中硬编码的 `castShadow = true`，作为单独提交。

### 3.5 参考面数预算（可调整）

2026-10-10 按用户要求调整：视觉一致性优先，以下数字是初始参考预算，不是测试硬上限，也不要求把剩余额度用满。超出参考值时记录保留的可见细节与同机位场景开销，再决定是否继续简化。自动化只检查模型非空、面数低于原 GLB，以及索引/mesh 等结构约束；它不保证大幅减面或外观一致。draw call 与帧时间仍需实际检查。

| prefab | 原 GLB | 参考预算 | 构建思路 |
|---|---|---|---|
| `landFlower` | 3452 | 600 | 保留三朵花、叶片与凸点；按参考轮廓补圆润花瓣、茎和边缘，当前 206 面 |
| `volcanoRock` 变体 0 | 2054 | 500 | 保留倒角矩形底座、阶梯岩体和错落半透明晶柱；晶簇交叠处只保留连续外壳，避免透明内部面重复混色 |
| `volcanoRock` 变体 1 | 1337 | 300 | 保留原岩体的体积比例、轮廓与主要切面 |
| `deadBush` | 2691 | 500 | 保留分叉拓扑与枝条粗细变化，连接处按需要细分 |
| `desertCactusSmall` | 2374 | 600 | 方砖主干、L 形侧臂、顶部与侧面凸点，按场景尺寸简化倒角和分段 |
| `waterDuckweed` | 2052 | 240 | 保留叶瓣、十字缝隙、厚度与短支撑，允许增加圆弧分段和边缘倒角；当前四瓣版本 88 面 |
| `phragmites` | 1056 | 300 | 保留细茎、宽叶和棕色穗的主要轮廓，使用三种原色材质槽 |
| `landGrass` 短/长 | 原三款 328/224/719 | 360/640 | 原创三叶短草与五叶长草，同为 1×1 倒角方底座，厚实弯曲叶片；实际 322/568 面 |
| `landMushroom` | 492 | 200 | 保留伞盖曲率、边缘厚度、菌柄与小叶 |
| `waterBubble` | 58 | 58 | 以原有球面外观为准；收益很小，可保留 GLB |

## 4. 实施阶段

### Phase 0：准备（无功能变化）

2026-10-10 基线：`node --test` 共 252 项，242 通过、10 失败（aircraftInput 3、environmentShadowFollow 1、prefabInstanceColorConfig 2、tiltShiftPostProcessing 2、worldCameraFollow 2）。同机位前台渲染基线：triangles=29,285,574，drawCalls=327，frame=16.60ms，GPU=5.37ms。seed=20260608，viewport=1920×911，DPR=1，9 个 chunk，飞机未移动（保留当前 height=7.2，position=[12.8,7.2,12.8]）。首次后台采样有节流，已丢弃并在前台重新采样；帧时间是单次观察值，不代表统计基准。

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

2026-10-10 实施结果：基础设施与 `landFlower` 已接入，花的 root=62 面、花头=144 面，合计 206 面（较原 GLB 减少 94.03%），保持两个 mesh、原权重及放置/调色配置。修正第一片叶子的连接位置，射线测试覆盖叶片与茎的相交。相同 seed、视口和初始机位下：triangles=27,299,022（减少 6.78%），drawCalls=327，frame≈16.70ms，GPU≈5.05ms；两次采样均约 60Hz，不据此宣称帧率提升。视觉检查通过，控制台无新增缺失实例色 mesh / capacity / 渲染告警；移除旧 GLB 和 source。新增 24 项测试，全量 276 项、266 通过，仍仅有上述 10 项既有失败；生产构建通过。改动保留在工作区，未自动提交。

### Phase 2：高收益项

已完成 `waterDuckweed`，剩余建议顺序：`volcanoRock` → `deadBush` → `desertCactusSmall`。每项独立验证：新增 builder → 改 manifest → 跑测试 → 视觉对比 → 删除 GLB 与 source。

2026-10-10 浮萍初版结果（历史记录）：新增 `builders/duckweed.js` 并注册 `duckweed`，`waterDuckweed` 保持一个变体、weight=1、水面放置、随机 90° 旋转、原 forest/autumnForest 密度与投影行为。原 GLB 的线性材质颜色换算为 sRGB `#51b44c`，已校正色板与上表。初版由相互连接的支撑和两片椭圆叶组成，56 面、一个 mesh，尺寸 0.130×0.068×0.1344，min.y≈0，XZ 中心 (-0.05,0.056)；较原 2052 面减少 97.27%。

相同 seed=20260608、1920×911 视口、DPR=1、9 个 chunk 和初始机位（飞机 position=[12.8,7.2,12.8]）下，triangles 从 27,299,022 降至 27,097,426，减少 201,596 面（0.74%）；drawCalls 均为 327，frame 单次观察约 16.6/16.8ms，不据此宣称帧率提升。视觉检查通过，控制台无新增告警，已移除 `duckweed.glb` 和 `waterDuckweedModel` source。新增 6 项测试；全量 282 项、272 通过，仍为相同 10 项既有失败，生产构建通过。所有改动保留在工作区，未自动提交。

后续工作区已将浮萍调整为四瓣开缝造型，当前实测 88 面、一个 mesh，尺寸约 0.1317×0.066×0.1317。上述场景性能数据只对应 56 面初版。本次预算调整保留当前造型，未增加模型面数；后续以第 3.5 节和第 5.2 节的视觉优先标准验收。

2026-10-11 火山石结果：新增 `builders/volcanoRock.js`，注册 `volcanoRock` / `volcanoRockSmall`。两款仍共用同一深灰岩体的形状，大款增加错落方晶柱和低部连续透明核心。大款 611 面（深灰 272 + 晶体 339），较原 2054 面减少 70.25%；小款 272 面，较原 1337 面减少 79.66%，分别保留 2 / 1 个 mesh。尺寸约 0.12556×0.18870×0.14389 / 0.08922×0.09955×0.08026，min.y=0。按用户新标准已达标，不继续细化。

保留两款权重 0.3 / 0.7、volcano 地面投放、density=0.09、minHeight=5、maxSlope=3、90° 随机旋转、阴影与原五色调色板。色板按原 GLB 的线性颜色换算为 sRGB：岩体 `#1e1e1e`，晶体 `#ff1f06`；晶体保留 opacity=0.7、metalness=0.064、roughness=0.314、DoubleSide 和 `depthWrite=false`。透明晶簇只保留连续外壳，剔除交叠内部面，避免重复 alpha 混合。小款原本没有 `_InstanceColor` mesh，保持固定深灰及原有一次性诊断。

火山石专属 6 项、builder/grass/parts/registry/warmup 相关共 62 项测试通过。授权视觉核查确认最终 611 / 272 版本落地与阴影正常，调色仅影响大款晶体，预览浏览器无 error/warn；用户也反馈实际火山地形显示正常。旧两个火山石 GLB 和 source 已移除，临时原模型对照页已清理。没有采集同机位帧时间，不据此宣称帧率提升；最终全量测试和生产构建随本批次一起记录。

本地预览：`http://localhost:5173/debug/volcano-rock-preview.html`，可并排旋转、缩放、复位和切换五色；独立调试入口不包含在默认生产 HTML 入口中。

### Phase 3：剩余项

`landGrass` 已完成（按用户新要求设计为短/长两款），`landMushroom` 已接入 builder；剩余：`phragmites` → `waterBubble`（可选）。

2026-10-11 草实施结果：新增 `builders/grass.js`，注册 `grassShort` / `grassTall`。共用宽深 `STUD_PITCH=0.1`、高 `PLATE_HEIGHT≈0.03167` 的 1×1 倒角方底座，原点仍为 `(-0.05,0,0.05)`。短草三片叶，总高约 0.14167、322 面；长草五片错落叶，总高约 0.25167、568 面。叶片为封闭厚实弯曲几何体，叶根嵌入根环和底座；按用户反馈将截面厚度参数从 0.006 增至 0.009（+50%，参数为半厚度，叶尖沿曲线渐细），不增加三角面。每款一个 `grass_root` mesh，使用现有绿色 LEGO 塑料材质。

manifest 将旧两种普通草的权重 `1+1` 合为短草 `2`，长草沿用旧大簇的 `0.25`，保持普通/稀有草的总权重比例；具体单格变体会随新设计改变。forest/autumnForest/desert 的原密度、地面高度/坡度限制、90° 随机旋转、biome tint、阴影行为保持不变。移除三个旧草 source 及 `grass.glb` / `grass_2.glb` / `grass_3.glb`。自动化尺寸检查采用新设计尺寸，专门用射线检查四种旋转下的 1×1 底座；允许叶片略超出底座外沿。

草单项验证快照：相同 seed=20260608、1920×911 视口、DPR=1 和初始机位下，triangles 从 27,319,754 增至 27,338,641（+18,887，约 +0.069%），drawCalls 从 327 降至 314，geometries 从 39 降至 38。模型开销略增是厚叶和倒角的设计取舍，未宣称本次大幅减面；帧时间单次观察约 16.6/16.7ms，不作为帧率提升证据。独立预览及场景视觉检查通过，运行场景控制台无新增告警。草新增 13 项测试，接入时全量 295 项、285 通过，仍仅有基线相同 10 项失败；生产构建通过。保留工作区并行进行的蘑菇接入改动后，再次验证全量 298 项、289 通过，9 项失败均属于原有失败项；草、builder 与 warmup 的 36 项相关测试全部通过。改动保留在工作区，未自动提交。

本地设计预览：运行 Vite 后打开 `/debug/grass-preview.html`，可并排查看两款小草、拖动旋转、缩放和复位；该独立调试页面不包含在默认生产构建入口中。

2026-10-11 后续比例调整：按用户截图和追加要求，两款小草的叶簇及根环均以底座顶面为中心整体放大 1.5 倍，保留 1×1 方底座。当前短草尺寸约 0.12777×0.19667×0.13292，长草约 0.14764×0.36167×0.18404；允许叶片超出底座边缘。面数仍为 322/568，叶根与根环仍嵌入底座。已同步尺寸验收，32 项草与 builder 测试全部通过，生产构建通过。

### Phase 4：清理

- 删除未被加载的 `pumice.glb`、`pine.glb`、`coconut_tree.glb`。
- 若所有 builder 变体都已迁移，确认 `sources.js` 中不再有对应条目，`Resources` 加载项相应减少。
- 更新 `AGENTS.md` 中关于 prefab 来源的说明（若有）。

## 5. 验证方案

### 5.1 自动化：`test/prefabBuilders.test.js`

对 `prefabBuilders` 中每个构建函数及 manifest 中每个 builder 变体：

- **几何开销**：遍历 mesh 统计 `index.count / 3`，模型非空且面数低于对应原 GLB；第 3.5 节参考预算用于视觉与性能审阅，不作为测试硬上限。每新增一个 builder 同时补充原 GLB 基线。
- **命名**：若原变体包含可调色部分，至少一个 mesh 名匹配 `meshNameSuffix`。小火山石原 GLB 仅包含固定深灰岩体，保留这一例外；专门验证大款五色正常、小款不被染色，且原有缺失调色 mesh 的一次性诊断不增加。
- **原点**：整体包围盒 `min.y ≈ 0`（±0.005），XZ 中心 ≈ `(-0.05, 0.05)`（±0.02）。
- **尺寸**：还原型 prefab 的包围盒与第 2.2 节原 GLB 尺寸误差 ±25%；用户要求的原创草按短/长新设计尺寸检查，底座必须为 1×1。
- **manifest 完整性**：每个变体要么 `source` 存在于 `sources.js`，要么 `builder` 存在于 `prefabBuilders`。
- **释放**：`PrefabRegistry.dispose()` 后几何体与材质的 `dispose` 被调用。

现有 `prefabPlacer*.test.js`、`prefabPipelineWarmup.test.js` 应无需修改即可通过；若其中构造了 mock registry，保持不变。

### 5.2 手动

- `pnpm dev` + `#debug`，用 Phase 0 的固定 seed 与机位对比三角面、draw calls、帧时间。
- 对照原 GLB 的常用机位与近景斜视角，检查轮廓、比例、叶片/枝条数量、缝隙、厚度、圆润边缘、材质高光和阴影；包围盒尺寸通过不能代替外观验收。保留基准截图后再移除原资产。
- 若参考预算导致可见造型退化，优先增加所需几何细节，再记录模型面数与场景开销；先验证外观，再决定是否进一步减面。
- 检查：物体是否浮空或陷入地面、是否落在凸点上、90° 旋转后是否仍对齐、biomeTints 下颜色是否正确、实例色调色板是否生效、阴影是否正常。
- 控制台不应出现 `has no mesh matching instance color suffix` 或 `exceeded capacity` 新警告。

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| 程序模型风格与现有 GLB / 地形砖不统一 | 统一用 `prefabParts.js` 的 LEGO 单位、凸点与 `createLegoMaterial` 塑料参数；试点先只做花，确认风格后再推广 |
| Physical 材质使 prefab 着色变重 | Phase 0 基线对比帧时间；prefab 屏幕占比小，预期影响有限 |
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
