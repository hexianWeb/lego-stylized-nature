# Three.js 项目渲染管线与资源管理架构分析及修改建议

- 分析日期：2026-10-08
- 项目：`lego-stylized-nature`
- Three.js 版本：当前安装版本为 `0.185.0`（r185）
- 分析范围：默认运行路径上的渲染与对象复用、资源生命周期、启动预热、后处理管线、性能测量

> 实施状态（2026-10-08）：本次渲染和资源管理优化已落地，实施说明、前后数据及验证限制见 [优化结果与验证记录](rendering-resource-optimization-results.md)。下文保留优化前的分析，代码行为以结果记录和当前实现为准。

## 阅读说明

**代码引用。** 本文用"文件路径 + 符号名"引用代码，例如 `Renderer.setTiltShiftEnabled()`，不写行号。被引用的文件大多尚未提交到 git，行号会随编辑漂移。

**证据标记。** 每条结论标注证据类型：

| 标记 | 含义 |
| --- | --- |
| 【已复现】 | 在真实运行对象上观察到 |
| 【源码核实】 | 阅读项目源码与 r185 源码确认 |
| 【推断待测】 | 根据源码推断，需要在浏览器中验证 |

**影响面。** 区分"默认路径"（当前配置下每次运行都会触发）和"条件触发"（只在开启后处理、加载失败、销毁 World 等情况下发生）。

## 总体结论

当前配置下 chunk 地形开启，后处理关闭（`worldConfig.postProcessing.enabled = false`）。因此修改优先级按默认运行路径上的影响排序：

1. **默认路径上的正确性与性能问题**：复用的 InstancedMesh 包围球不会更新；水面为每个格子生成实例；每个 chunk slot 各自创建地形、水、熔岩材质，调试面板只能改到其中一个。
2. **资源生命周期缺口**：加载失败语义、PMREM 与原始 HDR、克隆几何体、初始化失败清理、预热覆盖范围。
3. **后处理管线**（开启后处理才生效）：输出节点切换的失效标记、节点释放、SMAA 与色彩空间顺序。

现有基础值得保留：`Experience` 统一协调启动；`Resources` 在构造时就开始加载，与 renderer 初始化并行；chunk 使用固定 slot 池和 mesh bucket 复用；已经有 prefab pipeline 预热。这些设计不需要推翻，需要补的是两条规则：

- **复用对象时，同步更新所有派生状态。**
- **共享资源只有一个负责人。**

新抽象只在有当前问题驱动时引入。本文只建议新增一个模块：World 级材质库（见 2.3）。AssetScope、引用计数、Worker 等放在第 6 节"暂缓的设计"，等对应需求出现再做。

## 1. 分层视角

Three.js 提供 GPU 后端、场景图、数学库和文件解析。以下策略仍然由项目决定：

- 一帧分成哪些阶段；
- 资源什么时候算可用；
- 谁拥有共享的材质、几何体和纹理；
- 哪些变化需要重建渲染图；
- 复用对象时哪些派生状态必须失效。

按职责可以这样对应：

| 层 | 当前项目中的对应 | 需要明确的边界 |
| --- | --- | --- |
| TOOL | Tweakpane 调试面板 | 通过公开接口修改配置，不直接持有某个 slot 的内部对象 |
| FUNC | World、PlayerAircraft、ChunkManager、Renderer | 游戏逻辑、场景呈现、渲染组织各自负责 |
| RESOURCE | `Resources`、prefab 材质缓存、PMREM | 资源身份、共享规则、失败语义、释放责任 |
| CORE | `Time`、`Sizes`、启动与销毁顺序 | 小而稳定的通用机制 |
| PLATFORM | 浏览器、Canvas、WebGPU 后端 | 集中在薄适配层 |

## 2. 默认运行路径上的问题（优先处理）

### 2.1 复用的 InstancedMesh 包围球不会更新

【源码核实】影响面：默认路径

r185 的 `InstancedMesh.computeBoundingSphere()` 只在 `boundingSphere === null` 时由视锥裁剪惰性调用一次，结果只覆盖当时 `count` 个实例。之后调用 `setMatrixAt()` 或修改 `count` 都不会让它失效。项目 `src/` 中没有任何地方重新计算包围球，而以下 mesh 都会被复用：

| 位置 | 复用方式 |
| --- | --- |
| `TerrainBrickRenderer.build()` | 容量足够时复用同一个 mesh |
| `LavaBrickRenderer.build()` | 同上 |
| `PrefabPlacer.getOrCreateMeshBucket()` | slot 切换到新 chunk 时，同一个 bucket 被重新填充 |

slot 被分配给新 chunk 后，包围球仍然是第一次填充时的范围。Prefab 最明显：如果某个 bucket 第一次只在 chunk 一角放了几棵树，之后新 chunk 里的树分布更广，位于屏幕边缘的树就会被错误裁剪，表现为物体在镜头边缘突然消失。地形每次的水平范围相同，但高度不同，chunk 角落的高地也可能受影响。

**修改建议：** 每次填充实例数据后重算：

```js
mesh.count = n
mesh.instanceMatrix.needsUpdate = true
mesh.computeBoundingSphere()
```

成本是 O(实例数)，与填充矩阵本身同一量级。修复后，水面也可以去掉 `frustumCulled = false`（见 2.2）。

**规则：** 复用 InstancedMesh 时，所有由实例数据派生的状态（包围球、包围盒、`instanceColor.needsUpdate`）都在同一个填充函数中更新。

### 2.2 水面为每个格子生成实例

【源码核实】影响面：默认路径；收益大小【推断待测】

`WaterBrickRenderer.initializeGrid()` 不读取地形，为 chunk 内 72 × 72 的每个格子都放一块水砖。而 `LayeredTerrainBuilder.buildPlacements()` 对 `surfaceCell.isWater` 的格子不生成地形砖；陆地格子的地形柱从水位以上开始。因此陆地格子下的水砖被地形挡住，看不到，但仍然被绘制。

按当前配置在窗口满载时估算：

| 项 | 数值 |
| --- | --- |
| 每个 slot 的水面实例 | 72 × 72 = 5,184（6 页，每页 900） |
| 9 个 slot 合计 | 46,656 个实例，54 个 InstancedMesh |
| 砖块模型 | 172 个三角形（`legoBlock2x2.glb`） |
| 主 pass 三角形 | 约 800 万 |

水面同时设置了 `castShadow = true` 和 `frustumCulled = false`，阴影 pass 还要再画一遍，而且不受阴影相机范围裁剪。

**修改建议：**

1. 参照 `LavaBrickRenderer.build()`，只为 `surfaceCell.isWater` 的格子生成实例。
2. 修好 2.1 后，恢复水面的视锥裁剪。
3. A/B 对比关闭水面投影的画面差异，决定是否保留。

需要在浏览器中确认海岸线和 chunk 接缝处的视觉不变，并用 `renderer.info.render.triangles` 对比修改前后的数值。`test/waterRendering.test.js` 和 `test/waterLavaChunk.test.js` 目前断言的是满格实例数，需要同步更新。

### 2.3 每个 slot 各自创建材质，调试面板只改到一个 chunk

【源码核实】影响面：默认路径

`ChunkManager.createSlot()` 为每个 slot 新建 `TerrainBrickRenderer`、`WaterBrickRenderer`、`LavaBrickRenderer`。每个 renderer 在构造函数里创建自己的材质：`createLegoMaterial()`、`createWaterMaterial()`、`createLavaMaterial()`，地形还有一个 AO 预览用的 `MeshBasicNodeMaterial`。9 个 slot 共 36 个材质实例，同类材质的配置完全相同。水和熔岩材质只依赖全局 `time` 节点和世界坐标，没有按 slot 区分的状态，可以直接共享。

直接后果是调试面板的 bug：`ChunkManager.getDebugMaterials()` 只返回第一个活跃 slot 的材质，`MaterialPanel` 绑定的就是这一份。在 `#debug` 中调整砖块粗糙度或水面流速，只有一个 chunk 会变化。

prefab 侧的问题方向相反：树材质、tint 材质、instanceColor 材质存放在模块级缓存（`treeMaterial.js`、`prefabMaterialTint.js`、`prefabInstanceColor.js`）里，被所有 slot 的 `PrefabPlacer` 共享，但释放由单个 placer 发起：`PrefabPlacer.clearInstances()` 会调用 `disposeTreeMaterials()` 清空整个树材质缓存。目前 `clearInstances()` 只在 `dispose()` 中调用，也就是只在销毁 World 时触发，所以这是潜在风险：一旦需要单独销毁某个 slot，其他 slot 的材质会被一起释放。

两个问题的根源相同：**共享材质没有唯一的负责人。** 地形侧是该共享却没共享，prefab 侧是共享了但谁都能释放。

**修改建议：建立 World 级材质库，放在 `src/world/` 下。**

- 由 World 创建并持有，通过构造参数传给 `ChunkManager` 和各 renderer。
- 地形、AO 预览、水、熔岩材质各一份，所有 slot 共用。
- prefab 的树、tint、instanceColor 缓存从模块级变量移入材质库。
- renderer 和 placer 只释放自己的 mesh 和实例数据，不释放材质。
- `World.dispose()` 在所有使用者销毁后统一释放材质库。
- 调试面板从材质库取材质，改一次即作用于所有 chunk。

不需要引用计数：所有使用者的生命周期都不长于 World。

### 2.4 预热覆盖范围

【推断待测】影响面：默认路径（prefab 首次出现时）

`warmupPrefabPipelines()` 把每种 prefab 材质组合放进一个临时 group，再调用 `renderer.compileAsync(scene, camera)`。从 r185 源码看，有三处可能覆盖不全：

1. **视锥裁剪。** `compileAsync()` 内部通过 `_projectObject()` 构建渲染列表，会检查 `frustumCulled`。预热 mesh 都使用单位矩阵放在世界原点，没有关闭视锥裁剪；初始相机看向玩家位置（地图中心附近），原点是否在视野内取决于相机参数。
2. **阴影 pass。** `compileAsync()` 只为主相机的渲染列表创建 pipeline，阴影深度图要到实际渲染时才绘制。预热 mesh 也没有设置 `castShadow`，而真实 prefab mesh 都开启了投影。
3. **开启后处理时。** `compileAsync()` 针对画布的渲染上下文编译，而开启后处理后场景实际渲染到 ScenePass 的 render target，两者格式可能不同。

**修改建议：**

- 预热 mesh 设置 `frustumCulled = false`，`castShadow`、`receiveShadow` 与真实 prefab 一致。
- 如果在浏览器中观察到 prefab 首次出现时仍有卡顿，就在 `compileAsync()` 之后、开始帧循环之前，带着预热 group 实际渲染一帧，覆盖阴影和后处理路径。
- 验证方式：打开帧时间统计，飞入新 biome，观察 prefab 首次出现时是否有帧时间尖峰。

同一原则适用于整个启动流程：**资源加载完成，不等于可以无卡顿渲染。** 文件解析属于资源管理；PMREM 生成、pipeline 编译属于渲染侧准备；`Experience.init()` 负责等两者都完成再开始帧循环。当前流程已经是这个顺序，需要补的只是预热覆盖范围。

## 3. 资源生命周期

### 3.1 当前启动与销毁流程

【源码核实】

`Experience.init()` 的顺序：

```text
Renderer.attachPipeline()（后处理关闭时直接返回）
 → Renderer.init()             Resources 构造时已开始加载，两者并行
 → await Resources.ready
 → Environment.applyEnvironmentMap()（生成 PMREM）
 → World.build()
 → resize
 → World.warmupPrefabPipelines()
 → 创建调试面板（仅 #debug）
```

随后 `Experience.start()` 启动帧循环。`Experience.update()` 每帧依次：更新时间 → 更新相机 → 更新 World → 更新后处理时间 uniform → 渲染。

`Experience.dispose()` 的顺序已经合理：先停止帧循环，再销毁 World、Environment 等使用者，最后销毁 renderer。缺的是资源释放阶段（见 3.3）。

### 3.2 区分"加载结束"与"启动成功"

【源码核实】影响面：资源加载失败时

`Resources.loadResource()` 在加载失败时记录 `errors[name]`，把 `items[name]` 设为 `null`，照常计数，全部结束后正常 resolve `ready`。所以 `ready` 只表示"所有请求都结束了"，不保证必需资源可用。之后各系统各自降级：`World.build()` 缺砖块模型时跳过地形，`PlayerAircraft` 缺模型时禁用玩家，`Environment` 缺 HDR 时跳过环境贴图。

**修改建议（最小版本）：**

- 在 `src/assets/sources.js` 的资源描述中增加 `required: true`，至少标记砖块模型。
- `Experience.init()` 在 `await resources.ready` 之后检查必需资源；有失败就抛出包含资源名的错误，进入 3.4 的清理路径。
- 可选资源失败时继续走现有降级逻辑。

纹理的 wrap 和色彩空间目前由 `createWaterMaterial()`、`createLavaMaterial()` 在创建材质时设置到共享纹理上。做了 2.3 之后每种材质只创建一次，这些设置也只执行一次，暂时不需要移到资源描述里。

### 3.3 所有权缺口

【源码核实】

| 资源 | 现状 | 建议负责人 | 影响面 |
| --- | --- | --- | --- |
| `Resources.items` 中的 GLTF、纹理 | 没有释放入口，`Experience.dispose()` 不处理 | 新增 `Resources.dispose()`，在 renderer 销毁前调用 | 销毁 Experience 时 |
| PMREM 结果 | `Environment.applyEnvironmentMap()` 只保留 `fromEquirectangular()` 返回值的 `.texture` | Environment 保留完整 RenderTarget，在 `dispose()` 和重新生成时释放 | 销毁或重新生成环境时 |
| 原始 HDR 纹理 | 生成 PMREM 后不再使用，但一直被 `Resources` 持有 | 生成 PMREM 后立即释放，并从 `Resources.items` 移除 | 默认路径（常驻内存） |
| 克隆的砖块几何体 | `extractBrickGeometry()` 克隆了几何体，World 销毁时没有释放 | World | 销毁 World 时 |
| 地形、水、熔岩材质 | 每个 renderer 自己创建、自己释放 | World 级材质库（2.3） | 默认路径 |
| prefab 派生材质 | 模块级缓存，单个 placer 可以释放全部 | World 级材质库（2.3） | 单独销毁 slot 时 |
| InstancedMesh 与实例 buffer | 各 renderer、placer 自己释放 | 保持现状 | — |
| ScenePass、SMAA 节点 | 没有释放 | Renderer（4.2） | 开启后处理时 |

原始 HDR 目前只在 `Experience.init()` 中使用一次，没有其他地方重新生成环境贴图，生成后释放是安全的。以后如果加入运行时切换 HDR，再改为保留。

原则：**chunk slot 只释放自己的实例数据，共享资源由生命周期更长的负责人统一释放。**

### 3.4 初始化失败时清理

【源码核实】影响面：初始化失败时

`bootstrap()` 在 `experience.init()` 抛错后只打印错误，已经创建的 renderer、World 和事件监听都还保留着。建议在 catch 中调用 `experience.dispose()`，并确认 `dispose()` 对未完成初始化的状态是安全的，例如 `_unsubscribeResize` 为空、World 尚未 build、PMREM 尚未生成。

## 4. 后处理管线（开启后处理时生效）

当前默认关闭后处理，`Renderer.render()` 直接调用 `renderer.render(scene, camera)`。以下问题只在 `worldConfig.postProcessing.enabled = true` 时出现。R1 只需改几行，可以随手修复；其余在决定启用后处理时一起处理。

开启后的节点链：

```text
ScenePass
 → SpeedLines
 → TiltShift（启用、禁用两条预建分支）
 → renderOutput（tone mapping + 转 sRGB）
 → Vignette
 → SMAA
 → 屏幕
```

### 4.1 切换输出节点时标记失效

【已复现】【源码核实】

`Renderer.setTiltShiftEnabled()` 只替换了 `renderPipeline.outputNode`。r185 的 `RenderPipeline._update()` 只在 `needsUpdate === true` 时才把 `outputNode` 写入全屏 quad 的 `fragmentNode`，并在首次更新后把 `needsUpdate` 置为 false。用真实 `RenderPipeline` 复现时观察到：

```text
outputNodeChanged: true
needsUpdateAfterSwitch: false
fragmentNodeRebuilt: false
```

也就是说，首帧之后切换 TiltShift 不会生效。

**修改：**

```js
const nextOutput = nextEnabled
  ? this.outputNodes.tiltShiftEnabled
  : this.outputNodes.tiltShiftDisabled

if (this.renderPipeline.outputNode !== nextOutput) {
  this.renderPipeline.outputNode = nextOutput
  this.renderPipeline.needsUpdate = true
}
```

**测试：** `test/tiltShiftPostProcessing.test.js` 现有的 mock 只验证了引用切换。不需要真实 `RenderPipeline`：在 mock 上先把 `needsUpdate` 置为 false，切换后断言它变为 true 即可。

规则：数值变化（时间、透明度、焦点宽度、模糊强度）走 uniform；结构变化（输出节点、效果连接关系）必须标记失效。

### 4.2 释放管线拥有的节点

【源码核实】

r185 的 `RenderPipeline.dispose()` 只释放全屏 quad 的材质，不会递归释放节点图。而在 `Renderer.attachPipeline()` 中：

- `scenePass` 是局部变量，它的 render target 没有被释放；
- 两条输出分支各创建了一个 SMAA 节点，每个持有 3 个 render target、2 张查找纹理和 3 个材质，也没有被释放；
- `Renderer.dispose()` 只释放了 TiltShift 的 blur 节点和 `RenderPipeline`。

**修改建议：** 在 `attachPipeline()` 中把创建的节点记录到一个数组里（scenePass、两个 SMAA 节点、TiltShift 效果）。`attachPipeline()` 开头和 `Renderer.dispose()` 共用同一个释放函数：遍历调用 `dispose()`，然后清空数组。重复调用应当安全。

只要管线还在 `Renderer` 内部、只有一套效果链，用一个数组就够了，不需要单独的 PipelineBundle 类。

### 4.3 SMAA 与色彩空间顺序

【源码核实】修改后的画面效果【推断待测】

`Renderer.createFinalOutput()` 先执行 `renderOutput()`（tone mapping + 转 sRGB），再做暗角和 SMAA。r185 的 `SMAANode` 源码注释要求在转 sRGB 之前执行 SMAA。

**修改示意：**

```js
createFinalOutput(sceneColor) {
  const toneMapped = renderOutput(
    sceneColor,
    this.instance.toneMapping,
    THREE.LinearSRGBColorSpace
  )
  const aa = smaa(toneMapped.mul(applyVignette()))
  return renderOutput(aa, THREE.NoToneMapping, THREE.SRGBColorSpace)
}
```

r185 的 `RenderOutputNode` 在输出色彩空间等于工作色彩空间（线性 sRGB）时跳过转换，在 `NoToneMapping` 时跳过 tone mapping。因此这段代码先在线性空间完成 tone mapping，SMAA 处理线性 LDR 颜色，最后只做一次 sRGB 转换。`outputColorTransform = false` 保持不变，避免重复转换。

暗角从 sRGB 空间挪到线性空间后，视觉强度会变化，可能需要重新调整 `VIGNETTE_AMOUNT`。需要在浏览器中对比边缘锯齿和整体亮度。

### 4.4 Renderer 的职责范围（暂不拆分）

`Renderer` 目前同时负责 WebGPU 初始化、曝光与阴影配置、后处理图构建、特效接口、DPR 处理和资源释放。它只有约 230 行，只有一套效果链，现阶段不需要拆成 RenderSystem、RenderConfig、pipeline builder 等多个文件。

`PlayerAircraft._updateSpeedLines()` 每帧直接调用 `experience.renderer.setSpeedLineOpacity()`，后处理关闭时这个调用没有效果。目前只有这一处 gameplay 驱动后处理参数，保持现状即可。

出现以下任一情况时再考虑拆分：出现第二套效果链；需要画质档位；多个 gameplay 系统需要驱动后处理参数。

## 5. 潜在风险与功能缺失

### 5.1 飞机推力发光没有生效

【源码核实】影响面：默认路径（功能缺失）

`PlayerAircraft._resolveEngineNodes()` 按名字查找 `left_engine` 和 `right_engine`，再读取它们的 `material`。解析 `public/model/player/fly.glb` 可以看到，这两个节点没有 mesh，也没有子节点，`node.material` 为 `undefined`，所以 `_setEngineIntensity()` 在第一行就返回了。

因此：

- 推力发光效果目前没有生效；
- "实例修改了共享材质""每帧设置 `material.needsUpdate = true`"这两个问题目前不会发生。

修复发光时需要一起处理：

1. 确认模型中哪个 mesh 应该发光；如果没有单独的发光 mesh，需要调整模型或换一种实现方式。
2. `sourceScene.clone(true)` 会共享材质。被修改的材质要先克隆，由 PlayerAircraft 在 `dispose()` 中释放。项目内 `BiomeCenterSystem` 对塔灯材质的克隆与释放方式可以参考。
3. 现在的代码既把 `emissive` 乘以 intensity，又设置 `emissiveIntensity = intensity`，最终亮度按 intensity 的平方变化。只保留其中一个。
4. 去掉逐帧的 `material.needsUpdate = true`。颜色和强度是数值参数，不需要触发材质重新处理。

### 5.2 chunk 模式下多余的完整地图 renderer

【源码核实】影响面：低

chunk 模式下 `World.build()` 仍然创建了完整地图用的 `TerrainBrickRenderer`。它没有加入 `children`，也从未调用 `build()`，所以没有 mesh、不占 GPU 资源，只是一个多余的 JS 对象和两个未使用的材质。

它目前承担了两个职责：作为 `World.build()` 和 `World.regenerate()` 中"是否已初始化"的判断条件，以及 `World.debuggerInit()` 中材质面板的回退值。删除时要把这些判断改为检查 `terrainGenerator` 或 `terrainChunkManager`。可以在做 2.3 的材质库时顺带处理。

## 6. 暂缓的设计

以下设计目前没有需求触发。记录在此，作为对应需求出现时的起点：

| 设计 | 触发条件 | 届时需要注意 |
| --- | --- | --- |
| AssetManager / AssetScope、加载中 Promise 复用、scope 结束后的晚到回调处理 | 需要按 biome 分组加载或运行时按需加载 | 资源身份与释放责任沿用 3.3 的负责人表 |
| 流式加载 prefab | 同上 | `PrefabPlacer.build()` 会跳过尚未加载的资产，而 `ChunkRenderSlot.ensurePrefabsBuilt()` 随后仍会记录"已构建"。资产到达后要让对应 slot 的构建状态失效并补建 |
| 材质引用计数 | 共享材质的使用者生命周期长于 World，或需要多个 World 共存 | — |
| chunk 构建的毫秒预算、分阶段任务、Worker | 第 7 节的测量显示 chunk 构建造成明显的帧时间尖峰 | 先用计时数据确定最重的步骤：地形生成、AO、placement 还是实例填充 |
| RenderSystem / RenderConfig 拆分、画质档位 | 见 4.4 | — |

## 7. 性能测量

第 2 节的修改都应有前后对比数据。r185 已经提供了所需的工具：

| 数据 | 获取方式 |
| --- | --- |
| draw call、三角形数 | `renderer.info.render.drawCalls`、`renderer.info.render.triangles` |
| 几何体、纹理数量 | `renderer.info.memory.geometries`、`renderer.info.memory.textures`；重复创建、销毁 World 后应回到稳定值 |
| GPU 时间 | 创建时传入 `new WebGPURenderer({ trackTimestamp: true })`，再调用 `renderer.resolveTimestampsAsync()`；需要设备支持 `timestamp-query` |
| CPU 时间 | 在 `ChunkManager.fillSlot()`、`ChunkRenderSlot.ensurePrefabsBuilt()` 和 `Experience.init()` 的各阶段用 `performance.now()` 计时 |

`renderer.render()` 的 JavaScript 耗时不等于 GPU 耗时，两者要分别观察。

## 8. 修改清单

| 编号 | 修改项 | 主要位置 | 影响面 | 证据 | 工作量 | 优先级 |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | 填充实例后重算包围球 | `TerrainBrickRenderer`、`LavaBrickRenderer`、`PrefabPlacer` | 默认路径 | 源码核实 | 小 | 高 |
| D2 | 水面只为水格子生成实例，恢复视锥裁剪，评估水面投影 | `WaterBrickRenderer` | 默认路径 | 源码核实，收益待测 | 中 | 高 |
| D3 | World 级材质库：slot 共享地形、水、熔岩材质，prefab 缓存移入，调试面板改从材质库取 | `World`、`ChunkManager`、prefab 材质模块、`MaterialPanel` | 默认路径 | 源码核实 | 中 | 高 |
| L1 | 预热 mesh 关闭视锥裁剪、匹配投影设置；必要时预热后实际渲染一帧 | `PrefabPipelineWarmup`、`Experience.init()` | 默认路径 | 推断待测 | 小 | 中 |
| L2 | 标记必需资源，并在启动时检查失败 | `sources.js`、`Experience.init()` | 加载失败时 | 源码核实 | 小 | 中 |
| L3 | PMREM 保留完整 RenderTarget；生成后释放原始 HDR | `Environment`、`Experience.init()` | 默认路径（内存） | 源码核实 | 小 | 中 |
| L4 | 新增 `Resources.dispose()`；World 释放克隆的砖块几何体 | `Resources`、`World`、`Experience.dispose()` | 销毁时 | 源码核实 | 小 | 中 |
| L5 | 初始化失败时调用 `dispose()` | `bootstrap()`、`Experience` | 初始化失败时 | 源码核实 | 小 | 中 |
| R1 | 切换输出节点时设置 `needsUpdate`，补充测试 | `Renderer.setTiltShiftEnabled()` | 开启后处理时 | 已复现 | 小 | 低，可随手修 |
| R2 | 记录并释放 scenePass、SMAA 等节点 | `Renderer.attachPipeline()`、`Renderer.dispose()` | 开启后处理时 | 源码核实 | 小 | 低 |
| R3 | SMAA 移到 sRGB 转换之前 | `Renderer.createFinalOutput()` | 开启后处理时 | 源码核实，画面待测 | 小 | 低 |
| F1 | 修复推力发光（材质克隆、平方亮度、去掉逐帧 `needsUpdate`） | `PlayerAircraft` | 功能缺失 | 源码核实 | 中 | 低 |
| F2 | 移除 chunk 模式下多余的完整地图 renderer | `World` | 低 | 源码核实 | 小 | 低，随 D3 处理 |
| P1 | 建立第 7 节的测量手段 | 调试面板、`Experience` | — | — | 小 | 与 D1–D3 同步 |

## 9. 验证目标

### 9.1 默认运行路径

- 飞行跨越多个 chunk 后，屏幕边缘的 prefab 和高地不会突然消失。
- 水面修改前后，海岸线和 chunk 接缝的视觉一致，`renderer.info.render.triangles` 明显下降。
- 在 `#debug` 中调整砖块或水面材质，所有 chunk 同时变化。
- 首次飞入新 biome 时，prefab 出现不造成明显的帧时间尖峰。

### 9.2 资源生命周期

- 必需资源加载失败时，`Experience.init()` 抛出包含资源名的错误，并完成清理。
- 可选资源加载失败时，现有降级行为不变。
- 重复创建与销毁 Experience 后，`renderer.info.memory` 回到稳定值。
- 单独销毁一个 placer 时，其他 slot 的材质仍然有效。

### 9.3 后处理（开启后）

- 首帧之后切换 TiltShift，画面使用新的输出图。
- 重新 attach 或销毁管线后，ScenePass 和 SMAA 的 render target 被释放。
- 色彩转换只发生一次，暗角强度重新校准。

## 总结

当前最值得做的三件事都在默认运行路径上，改动范围也小：**复用 InstancedMesh 时重算包围球、水面只为水格子生成实例、建立 World 级材质库**。前两项是正确性和性能问题；第三项在修复调试面板 bug 的同时，给共享材质确定了唯一负责人。

之后补齐资源生命周期：必需资源的失败语义、PMREM 与原始 HDR、几何体与 `Resources` 的释放、预热覆盖范围。后处理相关的修复在决定启用后处理时一起做，其中 R1 可以随手修掉。

贯穿全文的两条规则：**复用对象时，同步更新所有派生状态；共享资源只有一个负责人。**
