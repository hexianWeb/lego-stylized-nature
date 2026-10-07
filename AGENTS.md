# Repository notes

- Use `pnpm install --frozen-lockfile` for dependencies: `pnpm-lock.yaml` matches `package.json`; `package-lock.json` still records an older dependency set (`lil-gui`, Three r174) and is not reliable for this tree.
- Run `pnpm dev` (Vite), `pnpm test` (Node's built-in test runner), or `pnpm build`. For one test: `node --test test/chunkManager.test.js`. There is no lint or typecheck script in `package.json`; `eslint.config.js` references `@antfu/eslint-config`, which is not declared there.
- Vite's root is `src/`, with `src/index.html` -> `src/script.js` -> `src/app/bootstrap.js` -> `src/app/Experience.js`. Static asset URLs in `src/assets/sources.js` resolve from `public/`; production output is `dist/`.
- `Experience.init()` initializes the WebGPU renderer, waits for resources, builds `World`, then warms prefab pipelines before starting the render loop. `src/world/world.js` wires terrain, biomes, prefabs, and the player; `src/world/WorldConfig.js` owns their settings. Chunk terrain is enabled by default; the full-map path is a separate branch in `World.regenerate()`.
- Rendering uses `three/webgpu` and `three/tsl`. `src/world/WorldConfig.js` currently disables postprocessing, so `src/renderer/Renderer.js` renders the scene directly; enabling it restores the `THREE.RenderPipeline`. Do not assume older `PostProcessing` examples in `.cursor/rules/` describe this implementation.
- The page mounts only the WebGPU canvas by default; `#debug` opens the Tweakpane in dev mode, which also exposes `window.__experience` for inspection.
