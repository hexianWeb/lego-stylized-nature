# 山体 AO：当前实现与优化方案

> 状态：已按当前工作区实现同步。本文记录已实现的山体 AO、现有约束及后续完善项。

## 1. 范围与视觉目标

单块砖宽度为 `0.2` 世界单位，结合当前观察尺度，砖缝与凸点的局部 AO 收益有限。本方案收敛为**仅山体 AO**，移除原先的砖模型烘焙 AO、逐砖细缝遮蔽及道具接触屏幕空间 AO 实施计划。

重点表现：

- 开放山顶与平台边缘保持清爽。
- 高墙附近的地面、山谷与凹陷获得遮蔽。
- 崖壁靠近坡脚处较暗，向上逐渐减弱。
- 山体 AO 在相机移动、chunk 切换和实例池复用时保持稳定。

当前算法中的 `footContact` 是**山体坡脚的高度场接触近似**，属于上述山体层次表达，因此保留。

## 2. 当前实现概览

当前采用**世界空间高度场上的多方向、多距离地平线遮蔽近似，加坡脚接触衰减**。

| 项目 | 当前状态 |
| --- | --- |
| 采样方向 | 固定 8 个水平网格方向 |
| 采样距离 | 默认 `[1, 2, 4, 8]` 个网格步长 |
| 遮蔽计算 | 仰角正弦值 × 距离衰减，每方向取最大贡献后求平均 |
| 坡脚接触 | 非表层砖根据最低邻居高度计算衰减 |
| 输出 | 每个 placement 一个 AO 可见度标量 |
| CPU 存储 | 与 placements 对齐的 `Float32Array`，按索引访问 |
| Chunk 邻域 | 默认 `halo = 8`，覆盖当前采样距离 |
| 材质应用 | CPU 将 AO 乘进实例颜色 |
| 预览 | 灰度 AO、基色、noise 色调与最终材质 |

这是借鉴地平线思想的高度场 AO。8 方向采样最终合成为一个标量，当前没有按表面法线输出顶面与四侧的独立 AO，也没有执行完整的 HBAO 半球积分。

### 2.1 相关代码

| 文件 | 职责 |
| --- | --- |
| [`HeightfieldAO.js`](../src/world/bricks/HeightfieldAO.js) | 采样高度场，计算地平线与坡脚遮蔽，保存可见度 |
| [`LayeredTerrainBuilder.js`](../src/world/terrain/LayeredTerrainBuilder.js) | 生成实际可见砖块的 placements |
| [`TerrainBrickRenderer.js`](../src/world/bricks/TerrainBrickRenderer.js) | 使用 `ao.get(i)` 更新实例颜色和预览 |
| [`ChunkRenderSlot.js`](../src/world/chunks/ChunkRenderSlot.js) | 调用 `build(terrainMap, placements)`，记录 AO 构建耗时 |
| [`world.js`](../src/world/world.js) | 接入完整地图、chunk 和预览刷新流程 |
| [`legoMaterial.js`](../src/materials/tsl/legoMaterial.js) | 提供共享 `MeshPhysicalNodeMaterial`，当前没有自定义 `aoNode` |
| [`AOPanel.js`](../src/debug/panels/AOPanel.js) | 提供 AO 强度、权重、衰减与灰度预览 |
| [`WorldConfig.js`](../src/world/WorldConfig.js) | 保存采样距离、AO 参数及 halo 配置 |
| [`heightfieldAO.test.js`](../test/heightfieldAO.test.js) | 验证开放顶面、崖壁坡脚和多距离遮蔽 |

## 3. 当前计算流程

```text
生成 terrainMap（chunk 含 halo）
                 ↓
LayeredTerrainBuilder 生成 placements
                 ↓
HeightfieldAO.build(terrainMap, placements)
                 ↓
每列读取 8 方向 × 多距离的邻域高度
                 ↓
按砖层计算 horizon 与 footContact
                 ↓
Float32Array[i] 保存 placement i 的可见度
                 ↓
TerrainBrickRenderer 使用 ao.get(i)
                 ↓
最终材质：基色 × AO → instanceColor
灰度预览：AO → instanceColor
```

AO 表示可见度：`1` 为开放。当前输出下限由 `ao.min` 控制，默认结果范围为 `[0.2, 1]`。

### 3.1 高度采样与列缓存

对 placement 的本地 `x/z` 加上 halo 偏移，得到高度场采样坐标。

有效高度的当前规则：

- 普通地形读取 `terrainMap.getHeight(x, z)`。
- 低于或等于水位的高度按 `waterLevel` 处理。
- 熔岩列优先使用 `surfaceCell.lavaHeight`，缺省时使用 `surfaceCell.height`。
- 超出高度场范围返回 `NaN`，作为缺失样本处理。

连续属于同一 `x/z` 列的 placements 复用邻域高度缓存；每层仍独立计算遮蔽。当前 `LayeredTerrainBuilder` 按列连续生成 placements，适合此缓存策略。

### 3.2 地平线贡献

方向为 `(dx, dz)`，网格采样步长为 `dist`，当前砖层为 `y`：

```text
rise = (neighborHeight - y) × layerHeight
run = dist × sqrt(dx² + dz²) × cellSize
```

只处理 `rise > 0` 的遮挡。对于其余有效样本，该方向对应贡献为零。

```text
sinElevation = rise / sqrt(rise² + run²)
attenuation = 1 / (1 + (dist - 1) × distanceFalloff)
sampleOcclusion = sinElevation × attenuation
```

每个方向取所有距离样本中最大的 `sampleOcclusion`，再对有有效样本的方向求平均，得到 `horizon`。距离衰减在取最大贡献之前应用。

对角方向通过 `sqrt(dx² + dz²)` 修正真实水平距离；当前衰减公式使用网格步长 `dist`，并非完整的世界空间距离。

缺失样本被跳过。完全没有有效样本的方向不参加平均；若所有方向均无有效样本，`horizon` 返回 `0`。这是一种边界回退行为，不能替代完整邻域数据。

### 3.3 坡脚接触

当前从四个基轴方向的**第一个距离样本**取最低高度，作为 `minNeighbor`。默认第一个距离为 `1`，因此对应紧邻格子。

仅对 `layer !== 'surface'` 且 `minNeighbor` 有效的砖计算：

```text
contact = 1 - clamp((y - minNeighbor - 1) / creviceScale, 0, 1)
```

- 坡脚第一层可见砖的接触贡献最强。
- 随砖层升高，接触贡献下降，超过衰减范围后归零。
- 表层砖的接触贡献为零，开放顶面不会因这一项被压暗。

旧配置名称 `creviceScale`、`creviceWeight` 继续使用，但调试面板已显示为 `footContact`。

### 3.4 最终可见度

```text
occlusion = horizon × horizonWeight + contact × creviceWeight
t = clamp(occlusion × strength, 0, 1)
visibility = min + (1 - min) × (1 - t)
```

当 AO 关闭且灰度预览也关闭时，不计算有效 AO 数据，`get(i)` 返回 `1`。灰度预览开启时，即使最终材质的 AO 开关关闭，仍可计算并观察 AO。

## 4. 本次实现已完成的变化

- **移除开放方向暗化项**：删除旧 `sideGap`，低邻居不再直接增加遮蔽。
- **修正坡脚衰减**：旧的高出台阶暗化改为从坡脚向上逐渐减弱的接触贡献。
- **移除纯深度暗化**：删除旧 `depthOcc`、`depthWeight`、`depthScale`。
- **替换高度差归一化**：删除 `horizonScale`，改用真实砖尺寸计算仰角贡献。
- **扩大遮蔽尺度**：从相邻一圈升级为多距离采样。
- **对齐实际 placements**：AO 与渲染使用同一份 placements，包含熔岩处理后暴露的砖。
- **替换字符串 Map**：改为连续数组和 placement 索引，避免坐标字符串查询。
- **缓存每列邻域高度**：减少同列不同砖层的重复高度读取。
- **扩大 halo**：默认从 `1` 调整为 `8`，为 chunk 边缘提供采样邻域。

## 5. 数据接口与渲染接入

### 5.1 接口约定

```js
heightfieldAO.build(terrainMap, placements)
const visibility = heightfieldAO.get(placementIndex)
```

`get(i)` 的索引必须与本次 `build()` 的 placements 顺序一致。重建或重新排列 placements 后，需要同时重建 AO。

`_values` 仅在容量不足时重新分配；`_count` 记录当前有效数量，容量尾部的旧数据不会作为有效 placement 使用。`_samples` 是复用的 `Float64Array` 邻域缓存，默认包含 32 个高度样本。

每个 chunk render slot 持有自己的 `HeightfieldAO`。当前 AO 没有独立 GPU 属性，仍通过最终的实例颜色上传，因此共享砖几何不会被私有 AO 属性覆盖。

### 5.2 当前材质行为

最终材质仍执行：

```js
color.multiplyScalar(ao.get(i))
mesh.setColorAt(i, color)
```

因此当前 AO 会影响砖块的反照率及直接光照下的漫反射。它没有修改色板配置，但上传的最终 `instanceColor` 已包含暗化。

在 **Base colors** 与 **Noise / tone** 预览中跳过这一步；在 AO 灰度预览中使用 `MeshBasicNodeMaterial`，将可见度写为 RGB 灰度值。

**独立 AO buffer 接入 `material.aoNode` 尚未实现**，属于后续山体 AO 的材质通道完善项。

## 6. Chunk 采样约束

当前默认配置为 `size = 72`、`halo = 8`，高度场采样宽深为 `88 × 88`。默认最大采样步长为 `8`，halo 能覆盖可见砖列在所有八个方向上的采样。

必须保持：

```text
max(sampleDistances) ≤ chunks.halo
```

此外，当前坡脚邻居读取隐含要求 `sampleDistances[0] === 1`。距离列表应为正整数网格步长；这些约束目前由配置约定保证，没有运行时校验。

AO 从 chunk 自己生成的含 halo 高度场读取数据，不查询相邻 chunk 的渲染对象，也不使用 debug spacing。完整邻域可避免结果依赖邻居 chunk 的装载时机。

完整地图外缘没有 halo 数据，仍会采用缺失样本回退。完整地图与 chunk 的比较应在拥有相同采样邻域的位置进行。水、熔岩和特殊地表的跨 chunk 一致性仍需专项验证。

## 7. 当前配置与调试

### 7.1 默认值

| 配置 | 默认值 | 作用 |
| --- | --- | --- |
| `enabled` | `true` | 最终材质应用山体 AO |
| `previewGrayscale` | `false` | 显示 AO 灰度预览 |
| `strength` | `1.4` | 总遮蔽强度 |
| `min` | `0.2` | 可见度下限 |
| `sampleDistances` | `[1, 2, 4, 8]` | 各方向上的网格采样步长 |
| `distanceFalloff` | `0.25` | 远距离样本衰减 |
| `horizonWeight` | `0.61` | 地平线遮蔽权重 |
| `creviceWeight` | `0.42` | 坡脚接触权重 |
| `creviceScale` | `2.5` | 坡脚接触衰减范围，单位为砖层 |

### 7.2 艺术调试流程

打开 `#debug`，进入 **Heightfield AO**：

1. 开启 `grayscalePreview`，观察开放顶面、崖壁和坡脚。
2. 调整 `horizon` 权重与 `distanceFalloff`，确认遮蔽沿地面传播的范围。
3. 调整 `footContact` 权重和尺度，控制崖壁由下向上的暗化。
4. 调整 `strength` 与 `minBrightness`，避免大面积饱和到最低可见度。
5. 回到最终材质，在固定色板、光照与相机下比较效果。

八个方向固定在代码中；采样距离列表目前通过配置修改，没有对应的 Tweakpane 控件。

### 7.3 更新成本

当前除灰度预览切换外，AO 参数变化均调用 `onRegenerate`，会重新生成地形或重置 chunk 加载窗口。强度等参数已经参与 CPU 最终可见度计算，尚未提供只调制结果的独立 uniform 路径。

`ChunkRenderSlot.buildTimings.aoMs` 已记录 AO 构建耗时，可用于评估多距离采样与扩大 halo 的成本。按 placement 输出的 AO 数组约为每砖 4 字节，数组复用后内存按已分配容量计算。

## 8. 后续山体 AO 完善顺序

1. **补齐边界与稳定性验证**：覆盖 halo、chunk 接缝、实例池复用及水／熔岩邻域；加入采样配置校验。
2. **优化调参更新链路**：将 AO 重算与地形生成分开，优先复用高度场和 placements；评估缓存原始贡献以快速调制强度与下限。
3. **分离材质通道**：保留色板基色，使用独立实例 AO 数据接入 `aoNode`，验证共享材质的数据绑定与资源生命周期。
4. **按视觉结果评估面向性**：当前每砖一个标量作为基线；只有崖壁朝向的误暗明显时，才升级为按面或按法线的山体遮蔽。
5. **测量目标设备成本**：记录 AO 构建、halo 地形生成和实例数据更新耗时，再确定采样范围。

上述步骤均围绕山体尺度，不再包含局部 AO 的实施阶段。

## 9. 已有验证与待补验收

### 9.1 已有自动化测试

[`test/heightfieldAO.test.js`](../test/heightfieldAO.test.js) 当前包含 7 项测试：

- 开放顶面与外露平台边缘保持完全可见。
- 崖壁向坡脚逐渐变暗。
- 高墙附近的地面获得遮蔽。
- 遮蔽到达非紧邻位置，并随距离减弱。
- 相同距离下，高墙比矮台阶产生更强遮蔽。
- AO 与 placements 对齐，数值有限且处于配置范围；尾部索引返回完全可见。
- AO 关闭时返回完全可见。

运行方式：

```sh
node --test test/heightfieldAO.test.js
```

### 9.2 待补验收

- 在相同完整邻域下，完整地图与 chunk 的同一砖块结果一致。
- chunk 边界无亮缝或暗缝；扩大／缩小采样列表时同步验证 halo。
- 镜像地形的标量 AO 对称。
- chunk 重建、装载顺序和 placement 排列变化后，按砖块坐标对应的结果稳定。
- 水与熔岩邻域遮挡与实际暴露的地形一致。
- 实例池容量增长、缩小和复用后没有陈旧 AO 数据。
- 灰度与颜色预览切换后，能够恢复正确的最终实例颜色。
- 接入独立 AO 通道后，验证基色与直接光照漫反射不再被 AO 乘色改变。
- 在目标设备上记录实际构建耗时，并根据固定场景截图决定最终艺术参数。

## 10. 相关文档

- [地形颜色调试说明](terrain-color-workflow.md)
