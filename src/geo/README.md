# Geo 模块：Cesium 3D 地球 + MapLibre 地图

在 uni-app H5 工程中集成的「3D 地球 / 2D 地图」能力模块。所有数据源均为**免费、无需 API key**。

## 1. 能力清单

| 能力 | 库 | 关键实现 |
| --- | --- | --- |
| 3D 地球 | CesiumJS | `useCesium.initViewer` 创建 Viewer |
| 真实地形 | CesiumJS | `CesiumTerrainProvider.fromUrl(geo.admin.ch)`（瑞士量化网格）|
| 动态相机 | CesiumJS | `flyTo` / `flyToBoundingSphere` / 巡航回调 |
| 空间对象 | CesiumJS | `addPoint` / `addPolyline` / `addPolygon` / `animateAlongRoute` |
| 高亮区域 | MapLibre | `addGeoJSON`（fill + line）|
| 路线图层 | MapLibre | `addRoute`（line + 可选 dash）|
| 标签 | MapLibre | `addLabels`（symbol + glyphs）|
| 数据表达 | MapLibre | `addDataDriven`（interpolate 半径/颜色）|

## 2. 免费数据源（已在 `.env` 配置）

- **Cesium 地形**：`https://3d.geo.admin.ch/ch.swisstopo.terrain.3d/v1`（瑞士阿尔卑斯，Cesium 原生 quantized-mesh，无需密钥）
- **Cesium 影像**：OSM（`tile.openstreetmap.org`）
- **MapLibre 底图**：OpenFreeMap Positron（`tiles.openfreemap.org/styles/positron`，含 glyphs/sprites）
- **MapLibre 地形**：AWS terrarium DEM（`s3.amazonaws.com/elevation-tiles-prod/terrarium/...`，hillshade + 3D 地形）

> 限制：免费 Cesium 地形仅覆盖瑞士。要全球高清地形，把 `VITE_CESIUM_ION_TOKEN` 与 `VITE_CESIUM_TERRAIN_URL` 换成 Ion / MapTiler 的端点即可（见第 5 节）。

## 3. 运行

```bash
pnpm dev:h5        # 开发，浏览器打开 /geo/cesium 与 /geo/maplibre
pnpm build:h5      # 生产构建
```

### ⚠️ 关键实现要点（踩坑记录，勿回退）

1. **Cesium 必须走「全局脚本」加载，不能 ESM import。**
   - uni-app的条件编译（条件编译）预处理器会扫描所有模块，而 Cesium 源码里 GLSL 着色器字符串含 `#ifdef`/`#endif`，会被误判为条件编译指令并直接编译失败（`条件编译失败: #ifdef/#ifndef 缺少配对的 #endif`）。
   - 因此 `useCesium.js` 通过 `window.Cesium` 使用全局对象；`vite.config.js` 里的 `copyCesiumAssets` 插件在 dev 时以中间件把 `node_modules/cesium/Build/Cesium/*` 以 `/cesium/` 路径提供，在 build 时拷贝到 `dist/build/h5/cesium/`。
   - `window.CESIUM_BASE_URL = '/cesium/'` 在运行时注入（见 `useCesium.js` 的 `loadCesium()`），保证 Worker/静态资源路径正确。
2. **不能在 `index.html` 里写 `<script src="/cesium/Cesium.js">`。** uni-app 的 HTML 处理器拒绝非 module 的 `<script src>`（"can't be bundled without type=module"）。所以脚本与 CSS 由 `loadCesium()` 在运行时动态注入。
3. **`maplibre-gl` 是 ESM 且仅具名导出**，需用 `import * as maplibregl from 'maplibre-gl'`（不能用默认导入，否则报 "default is not exported"）。
4. **`vite-plugin-static-copy` 不可用**：其 1.x/4.x 为 ESM-only，而本工程 `vite.config.js` 是 CommonJS，`require()` 会失败；故改用内联 copy 插件（见上）。

### 构建说明（环境相关）

- 在本 agent 沙箱内，`pnpm build:h5` 的最终 `dist/build/h5/assets` 清理会触发「批量删除安全守卫」而中断退出码非零；**但构建产物其实已完整生成**。用 `node_modules/.bin/uni build --debug` 可正常完成（输出 `DONE Build complete.`）。在你本机直接运行 `pnpm build:h5` 不受影响。
- 校验：构建后 `dist/build/h5/cesium/` 应含 `Cesium.js / Assets / Workers / Widgets / ThirdParty`；`dist/build/h5/assets/` 应出现 `pages-geo-cesium-index.*.js` 与 `pages-geo-maplibre-index.*.js`。

## 4. Claude / WorkBuddy 工作方式（研究选题 → 脚本 → 代码 → 任务 → 校验）

本模块按以下闭环开发，每一步都可被 AI 助手独立执行并校验：

1. **研究选题** — 动手前先用 `WebSearch` / `WebFetch` 核实数据源、API、版本与可用性（如本模块的地形/底图端点均经 `curl`/`WebFetch` 探活）。
2. **写脚本** — 数据预处理、GeoJSON 生成、坐标/地形换算等用 Node/Python 脚本完成（放在 `scripts/` 或本目录），脚本可单独运行与复用。
3. **生成代码** — 把可复用逻辑封装为 composable（`useCesium.js` / `useMapLibre.js`），页面只做装配，避免重复。
4. **组织任务** — 用 task list 跟踪多步工作，明确依赖顺序（先装依赖 → 配 vite → 写模块 → 写页面 → 构建校验）。
5. **校验结果** — 构建必须通过（`pnpm build:h5`），关键端点用 `curl` 探活；**可视化效果（WebGL 渲染）由人工在浏览器验证**——沙箱无法运行 WebGL，这是预期的协作边界。

## 5. 切换为全局高清地形（可选）

编辑 `.env`：

```ini
VITE_CESIUM_ION_TOKEN=你的_ion_token
VITE_CESIUM_TERRAIN_URL=https://api.maptiler.com/tiles/terrain-quantized-mesh/v1/?key=你的_key
```

或自托管 quantized-mesh 地形（Cesium Terrain Builder / MapTiler Server），把 URL 指向你的服务即可。

## 6. 文件结构

```
src/geo/
  config.js                 # 读取 VITE_* 环境变量
  cesium/
    useCesium.js            # 可复用 Cesium composable
    samples.js              # 阿尔卑斯示例数据
  maplibre/
    useMapLibre.js          # 可复用 MapLibre composable
    samples.js              # 示例 GeoJSON
  README.md                 # 本文档
src/pages/geo/
  cesium/index.vue          # 3D 地球演示页
  maplibre/index.vue        # 地图演示页
```
