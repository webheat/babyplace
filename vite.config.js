const path = require('path');
const fs = require('fs');
const uni = require('@dcloudio/vite-plugin-uni').default;

// Cesium ships prebuilt static assets (Workers / Assets / Widgets / ThirdParty) that must be
// served from CESIUM_BASE_URL. Instead of an ESM-only copy plugin (vite-plugin-static-copy@1 is
// ESM and can't be require()'d from this CJS config), we copy them with a tiny inline plugin:
//  - dev:  serve /cesium/* straight from node_modules via a dev-server middleware
//  - build: copy them into the H5 output dir on closeBundle
const CESIUM_SRC = path.resolve(__dirname, 'node_modules/cesium/Build/Cesium');
const CESIUM_JS = path.join(CESIUM_SRC, 'Cesium.js');
const CESIUM_DIRS = ['Assets', 'ThirdParty', 'Widgets', 'Workers'];

const MIME = {
  '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.html': 'text/html', '.wasm': 'application/wasm',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const t = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, t);
    else fs.copyFileSync(s, t);
  }
}

function copyCesiumAssets() {
  let outDir = 'dist/build/h5';
  return {
    name: 'copy-cesium-assets',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use('/cesium', (req, res, next) => {
        const rel = decodeURIComponent((req.url || '/').split('?')[0]);
        const file = path.join(CESIUM_SRC, rel);
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
          res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
          fs.createReadStream(file).pipe(res);
        } else {
          next();
        }
      });
    },
    closeBundle() {
      if (process.env.UNI_PLATFORM && process.env.UNI_PLATFORM !== 'h5') return;
      const dest = path.resolve(__dirname, outDir, 'cesium');
      fs.mkdirSync(dest, { recursive: true });
      if (fs.existsSync(CESIUM_JS)) fs.copyFileSync(CESIUM_JS, path.join(dest, 'Cesium.js'));
      for (const d of CESIUM_DIRS) {
        const src = path.join(CESIUM_SRC, d);
        if (fs.existsSync(src)) copyDir(src, path.join(dest, d));
      }
      console.log('[copy-cesium-assets] copied Cesium static assets ->', dest);
    },
  };
}

module.exports = {
  plugins: [uni(), copyCesiumAssets()],
  build: {
    // Cesium is loaded as a global script; maplibre-gl is still bundled — keep the
    // warning threshold high so the build log stays readable.
    chunkSizeWarningLimit: 5000,
  },
  resolve: {
    alias: {
      'uview-ui': path.resolve(__dirname, 'src/uview-ui'),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: '@use "@/uview-ui/theme.scss" as *;',
        silenceDeprecations: ['legacy-js-api'],
      },
    },
  },
};
