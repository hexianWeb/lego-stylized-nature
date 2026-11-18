# Deferred Improvements — Post-M12

> **2026-10-16 收账**：本清单已在 sandbox 重建（2026-09）与收尾冲刺（2026-10-16）中闭环。
> 各项终态见文末「Final status ledger」。剩余开放项：#2 SSAO、#3 HDR envmap
> （均有明确的 descop 理由）、bundle 分包（新增长期项）。

This document tracks the 10% of features that were **out of scope** for the
M1-M12 delivery but are valuable enough to deserve a follow-up plan.

Each item lists the rationale for deferring, the rough effort estimate, and
the files most likely to be touched if the work is picked up.

---

## 1. WebGPU fallback path (~2 days)

**Status:** Renderer is hard-wired to `THREE.WebGPURenderer`. Chrome / Edge
running without WebGPU support, or Safari users with the flag disabled,
get a white canvas with `#app-error` populated.

**Plan:**
- Detect `await this.renderer.init()` failure → fall back to `THREE.WebGLRenderer` (with `forceWebGL: true`)
- Most node-based materials (`MeshStandardNodeMaterial`, `MeshBasicNodeMaterial`) need WebGL equivalents (`MeshStandardMaterial`, `MeshBasicMaterial`) — write a thin wrapper that produces the right material per backend
- The renderer's `attachPipeline` path is WebGPU-specific; add a parallel WebGL path that uses scene + camera + post-FX chain (tilt-shift + speed-lines need their own WebGL ports)
- The LDrawLoader is WebGL-backed and works without changes; only the build-mode ghost / material swap needs backend awareness

**Files:** `src/renderer/Renderer.js`, `src/build/GhostController.js`, `src/utils/LDrawPartLoader.js`, `src/app/bootstrap.js`.

---

## 2. SSAO post-processing (~1 day)

**Status:** No screen-space ambient occlusion. Brick-to-brick contact looks
flat under the studio HDRI.

**Plan:**
- Add `three/addons/postprocessing/SSAOPass.js` into the WebGPU render pipeline
- Tune `kernelRadius`, `minDistance`, `maxDistance` for the ~0.2 cell scale
- Make SSAO opt-in via the existing Tweakpane debug panel (`#debug`)
- Performance: SSAO roughly doubles fragment cost — gate by `quality` preset

**Files:** `src/renderer/postprocessing/createSSAOPass.js`, `src/renderer/Renderer.js`, `src/debug/panels/PostProcessingPanel.js`.

---

## 3. HDR envmap upgrade (~1 day)

**Status:** The scene uses the existing `studioEnvMap` (a small built-in
cube). Brick materials look correct but the IBL response is narrow.

**Plan:**
- Replace with a polyhaven HDRI (`studio_small_03_1k.hdr` or similar) loaded via `RGBELoader`
- Provide two presets: "studio" (current neutral) and "sunset" (warm tones for sunset builds)
- Update `Environment.applyEnvironmentMap()` to also handle equirectangular sources
- The envmap intensity in the four finishes (matte/glossy/transparent/metallic) should be rebalanced for the new HDR

**Files:** `src/world/environment.js`, `public/hdri/*.hdr` (new), `src/build/FinishCatalog.js`.

---

## 4. Stud-tube X / Z snap (~0.5 day)

**Status:** M9 simplified stud alignment to Y-axis only. Placing a brick next
to another brick doesn't snap flush to the side.

**Plan:**
- In `_updateGhostPreview`, after computing the cell under cursor, scan
  the 4 lateral neighbors at the same y for bricks whose footprint could
  share an edge
- If found, snap the ghost's x or z to align edges (offset by 0.5 stud =
  `cellSize * 0.5` for sub-cell precision)
- Visual cue via the yellow tint (already wired for y-stack-snap)

**Files:** `src/build/StackSupport.js`, `src/build/BuildMode.js`,
`src/build/tools/PlaceTool.js`.

---

## 5. Marquee box select (~1 day)

**Status:** Multi-select only works with shift-click on individual bricks.
Drag-selecting an empty area does not draw a selection box.

**Plan:**
- Replace `SelectTool._handlePointerDown` with a down→move→up state machine
- On pointerdown over an empty cell (no brick hit), start drawing a marquee
  rectangle in screen space
- On pointerup, query every brick whose bounding box intersects the
  marquee and select them
- Render the marquee as a CSS overlay div (`<div class="build-marquee">`)
  positioned in screen coordinates
- Preserve shift-click for additive selection

**Files:** `src/build/tools/SelectTool.js`, `src/ui/build/*` (marquee
overlay styling in `style.css`).

---

## 6. Height ruler on baseplate (~0.5 day)

**Status:** Players can stack bricks but have no visual indication of how
high they are beyond the M8 Y/N indicator in the tool strip.

**Plan:**
- Add a vertical ruler along the +Z edge of the baseplate (a 1-cell-wide
  plane with `linesEvery = 4` segments)
- Render text labels every 4 layers (`0`, `4`, `8`, ...) via a single
  procedural canvas texture uploaded as a `CanvasTexture`
- Color the current y in the brick color (yellow accent)

**Files:** `src/world/build/HeightRuler.js`, `src/build/BuildMode.js`.

---

## 7. Full i18n coverage for new HUDs (~1 day)

**Status:** M10 added 4 new HUDs (PartsPaletteHUD, StatsHUD, PartsCatalog
itself). Their strings are hard-coded in English. The existing
`LocaleSwitch` + `LOCALE_CHANGED_EVENT` plumbing exists but the keys
aren't in `src/i18n/locales/{en,zh}.js`.

**Plan:**
- Add `build.parts.*` and `build.stats.*` keys to both locales
- Hook the relevant `_render()` paths to call `t()` on dynamic strings
- Verify both languages render correctly via the language switch

**Files:** `src/i18n/locales/{en,zh}.js`, `src/ui/build/PartsPaletteHUD.js`,
`src/ui/build/StatsHUD.js`.

---

## 8. Animated tutorial walkthrough (~1 day)

**Status:** M6 added `TutorialHUD` with a single modal and a
localStorage `seen` flag. First-time users see it once and dismiss.

**Plan:**
- Replace the single modal with a 3-step sequence: "Pick a part" →
  "Click the baseplate" → "Switch tools" — driven by the event bus
- Each step highlights the relevant UI element with a CSS outline
- Auto-advance when the user performs the gesture (e.g. first placement
  advances from step 2 to step 3)
- Add the same "seen" flag persistence so returning users skip it

**Files:** `src/ui/build/TutorialHUD.js`, `src/build/BuildMode.js`.

---

## 9. Goal / Task system (the missing 4th gap, ~3+ days)

**Status:** Out of scope for M1-M12 per the approved plan. The game is
currently a pure sandbox.

**Plan (high level):**
- New module `src/build/MissionManager.js` that listens to placement events
  on the event bus
- Mission manifest in `src/build/missions.js`: each mission has
  `{ id, title, brief, successRule, rewardManifest }`
- Render a "Mission Card" overlay (cloned from `StoryRecordModalHUD` shape)
  with the current objective, progress bar, and "next mission" unlock
- Use the existing `BUILD_ACHIEVEMENT_SHOW_EVENT` infrastructure to surface
  unlock popups
- Wire in 5–10 starter missions: "Build a 2×2 wall", "Stack 5 bricks", "Mix
  red and blue", etc.

**Files:** `src/build/MissionManager.js`, `src/build/missions.js`,
`src/ui/build/MissionCardHUD.js`, `src/build/BuildMode.js`.

---

## 10. Cleanup & consolidation (~0.5 day, light)

**Status:** Several legacy or duplicate modules remain from M1 → M12:

- `src/world/build/BrickRegistry.js` — built in M1, replaced by direct
  `partsCatalog` consumption in M7. Still imported in `BuildMode.js` but
  the instance is unused. Safe to delete.
- `src/ui/build/BrickPaletteHUD.js` — built in M1, superseded by
  `PartsPaletteHUD` in M10. Imports kept for backward compat. Safe to
  delete.
- `src/assets/manifests/brickCatalog.js` — M1 4-entry stub; M10's
  `partsCatalog.js` is the source of truth. `STANDARD_PALETTE` is still
  re-exported from here and used by `partsCatalog.js`.
- `src/playground/` — listed as "safe to delete" in the original plan.
  Has been inert the entire M1-M12 cycle. Safe to delete.

**Plan:** delete the four items above, re-run `pnpm run build` + `pnpm
test`,` and add a follow-up `git commit` so the next agent sees a clean
tree.

**Files:** see above.

---

## 11. Test coverage for M8-M11 (~1 day)

**Status:** Only `BuildGrid` and `StackSupport` have unit tests (added in
M12). `GhostController`, `LDrawPartLoader`, `FinishCatalog`,
`SceneSerializer`, `ToolStripHUD` all lack tests.

**Plan:**
- `GhostController.test.js` — verify show/hide, color flip, scale per footprint
- `LDrawPartLoader.test.js` — mock the loader to verify caching, dedupe of concurrent loadPart calls, dispose
- `SceneSerializer.test.js` — roundtrip JSON, legacy V1 migration
- `FinishCatalog.test.js` — `nextFinish` cycle
- `HistoryStack.test.js` — capacity overflow drops oldest, redoStack cleared on new `do`

**Files:** new tests under `test/`.

---

## Summary by impact / effort

| Priority | Item | Effort |
 |---|---|---|
 | High | 1. WebGPU fallback | 2d |
 | High | 9. Goal / Task system | 3d |
 | Med | 5. Marquee box select | 1d |
 | Med | 11. Test coverage | 1d |
 | Low | 2. SSAO | 1d |
 | Low | 3. HDR envmap | 1d |
 | Low | 7. i18n coverage | 1d |
 | Low | 8. Animated tutorial | 1d |
 | Low | 4. Stud-tube X / Z snap | 0.5d |
 | Low | 6. Height ruler | 0.5d |
 | Low | 10. Cleanup & consolidation | 0.5d |

**Total deferred work:** ~12 working days.

---

## Final status ledger (2026-10-16)

| # | Item | 终态 | 说明 |
|---|------|------|------|
| 1 | WebGPU fallback | ✅ 已实现 | 三级降级：WebGPU → WebGLFallbackRenderer → Sandbox2DView（2D SSR） |
| 2 | SSAO | ⛔ descop | three r185 WebGPU 无官方 SSAO pass；自写 TSL SSAO 成本高（片元成本×2），tilt-shift 已提供深度暗示。待官方支持后重开 |
| 3 | HDR envmap | ⛔ descop | RoomEnvironment 程序化 IBL 已落地（WebGL/WebGPU 双兼容）；HDR 文件资产体积大、增益有限。Preset 需求出现时重开 |
| 4 | Stud X/Z snap | ✅ 已实现 | `findStudSnap` 四方向整格吸附，含单测 |
| 5 | Marquee box select | ✅ 已实现 | SandboxInput down→move→up 状态机 + CSS overlay |
| 6 | Height ruler | ✅ 已实现 | `SandboxRuler`：南边缘标尺条 + 顶层黄色指示条 |
| 7 | i18n coverage | ✅ 已实现 | 9 类零件 + history/selection 键，en/zh 双语 |
| 8 | Animated tutorial | ✅ 已实现 | TutorialHUD 多步引导 |
| 9 | Goal/Task system | ✅ 已实现 | SandboxMissionManager + MissionCardHUD + 成就 + 奖励零件解锁 |
| 10 | Cleanup | ✅ 已实现 | playground/story/旧 HUD/BrickRegistry/brickCatalog 全部移除 |
| 11 | Test coverage | ✅ 已实现 | HistoryStack / placeSnap / LDR roundtrip 单测；全套 201+ 用例全绿 |

**新增长期项**：主包 1.97MB（gzip 562KB），world/sandbox 模式可按 hash 做 dynamic import 分包。

## How to pick this up

Each item has enough context above to be tackled as a standalone change.
Recommend doing the **High** priority items first (1 + 9) since they
unblock real users. The **Low** items can be cherry-picked by impact.