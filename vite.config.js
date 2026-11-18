export default {
  root: 'src/', // Sources files (typically where index.html is)
  publicDir: '../public/', // Path from "root" to static assets (files that are served as they are)
  // The app routes via location.hash (#sandbox / #build / #play), so no
  // history-API fallback is needed. 'mpa' makes missing files (e.g. an
  // absent LDraw .dat) return a clean 404 instead of index.html —
  // LDrawLoader would otherwise parse HTML as a model and hang.
  appType: 'mpa',
  server:
    {
      host: true, // Open to local network and display URL
    },
  build:
    {
      outDir: '../dist', // Output in the dist/ folder
      emptyOutDir: true, // Empty the folder first
      sourcemap: true, // Add sourcemap
    },
  // resolve:
  // {
  //     alias:
  //     {
  //         'three/examples/jsm': 'three/examples/jsm',
  //         'three/addons': 'three/examples/jsm',
  //         'three/tsl': 'three/webgpu',
  //         'three': 'three/webgpu',
  //     }
  // }
}
