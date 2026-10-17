# Three.js TSL template

A minimalist template to start practicing and learning TSL, the Three.js Shading Language

---

# Learn TSL

## Useful links

- [Official announcement and introduction](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
- [Q&A](https://github.com/boytchev/tsl-textures/wiki/Q&A)
- [Three.js WebGPU examples](https://threejs.org/examples/?q=webgpu#webgpu_parallax_uv)
- [List of nodes](https://github.com/mrdoob/three.js/blob/423f285d5d868dd128d6f143dc8ec31154018f57/src/nodes/Nodes.js#L42)
- [TSL => WGSL / GLSL](https://threejs.org/examples/?q=webgpu#webgpu_tsl_editor)
- [GLSL => TSL](https://threejs.org/examples/?q=webgpu#webgpu_tsl_transpiler)
- [TSL textures](https://github.com/boytchev/tsl-textures) ([demos](https://boytchev.github.io/tsl-textures/))

---

## Setup
Download [Node.js](https://nodejs.org/en/download/).
Run this followed commands:

``` bash
# Install dependencies (only the first time)
npm install

# Run the local server at localhost:8080
npm run dev

# Build for production in the dist/ directory
npm run build
```

---

## Build mode

The project also ships a freeform Lego building game on top of the same
rendering pipeline. Visit `http://localhost:5173/#build` after `npm run dev`.

- **100 real LDraw parts** (CC-BY 2.0, `public/model/parts/`) organized into 9 categories: bricks, plates, slopes, tiles, rounds, wedges, technic, baseplates, decorations
- **Vertical building**: `[` / `]` to change layer height; bricks auto-stack when clicking an occupied cell
- **Four surface finishes**: `F` cycles matte / glossy / transparent / metallic
- **Tools**: place (B) · select (V) · delete (X) · paint (P) · move (M)
- **Persistence**: `Cmd+S` to save / load JSON, share via URL hash; `.ldr` import/export round-trips position, color and 90° yaw
- **Height ruler** along the baseplate south edge with a live top-layer indicator
- **Minimap** + ** tutorials** ** achievements** + ** stats** overlays
- **i18n**: EN / 中文 across all sandbox HUDs

See `docs/deferred-improvements.md` for the 10% deferred polish items
(WebGPU fallback, SSAO, marquee select, etc.).
