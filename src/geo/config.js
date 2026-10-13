// Central config for the Cesium + MapLibre demos.
// All values come from VITE_* env vars (see project root .env).
// Every source below is FREE and requires NO API key.

const env = import.meta.env || {};

export const geoConfig = {
  // ---------- Cesium ----------
  // Cesium Ion access token. Leave empty to use the free terrain/imagery below
  // (no Ion calls are made). Fill it to unlock global Cesium World Terrain.
  cesiumIonToken: env.VITE_CESIUM_ION_TOKEN || '',

  // Free, Cesium-native quantized-mesh terrain (Swiss Alps, global-geodetic TMS, no key).
  // Covers Switzerland; for global high-res terrain set VITE_CESIUM_TERRAIN_URL to an
  // Ion/MapTiler endpoint and provide the matching token above.
  cesiumTerrainUrl:
    env.VITE_CESIUM_TERRAIN_URL || 'https://3d.geo.admin.ch/ch.swisstopo.terrain.3d/v1',

  // Free OpenStreetMap raster imagery.
  cesiumImageryUrl: env.VITE_CESIUM_IMAGERY_URL || 'https://tile.openstreetmap.org/',

  // ---------- MapLibre ----------
  // OpenFreeMap Positron style (free, no key, ships glyphs + sprites).
  maplibreStyle: env.VITE_MAPLIBRE_STYLE || 'https://tiles.openfreemap.org/styles/positron',

  // AWS Open Data terrarium DEM — free, no key. Powers hillshade / 3D terrain in MapLibre.
  maplibreTerrainUrl:
    env.VITE_MAPLIBRE_TERRAIN_URL ||
    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
};
