import { geoConfig } from '../config.js';

// Cesium is loaded as a *global* classic <script> at runtime (not ESM-imported).
// Reasons:
//  1. uni-app's conditional-compilation transform crashes on Cesium's GLSL `#ifdef` strings.
//  2. uni-app refuses a classic <script src> in index.html ("can't be bundled").
// So we inject the script + CSS ourselves from JS, after setting CESIUM_BASE_URL.
const CESIUM_BASE_URL = '/cesium/';

// Module-level handle to the global Cesium object (assigned once the script loads).
let Cesium = null;
let cesiumLoadPromise = null;

function loadCesium() {
  if (Cesium) return Promise.resolve(Cesium);
  if (cesiumLoadPromise) return cesiumLoadPromise;

  cesiumLoadPromise = new Promise((resolve, reject) => {
    window.CESIUM_BASE_URL = CESIUM_BASE_URL;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CESIUM_BASE_URL + 'Widgets/widgets.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = CESIUM_BASE_URL + 'Cesium.js';
    script.onload = () => {
      Cesium = window.Cesium;
      if (!Cesium) return reject(new Error('Cesium global not found after load'));
      resolve(Cesium);
    };
    script.onerror = () => reject(new Error('Failed to load ' + script.src));
    document.head.appendChild(script);
  });
  return cesiumLoadPromise;
}

/**
 * Thin, reusable wrapper around a Cesium Viewer.
 * Usage (Vue setup):
 *   const cesium = useCesium();
 *   await cesium.initViewer(el);
 *   cesium.addPoint(...); cesium.flyTo(...);
 *   onUnmounted(() => cesium.destroy());
 */
export function useCesium() {
  let viewer = null;

  async function initViewer(container) {
    if (viewer) return viewer;
    await loadCesium();

    // No Ion token by default — we supply free imagery + terrain ourselves.
    Cesium.Ion.defaultAccessToken = geoConfig.cesiumIonToken || '';

    viewer = new Cesium.Viewer(container, {
      baseLayer: new Cesium.ImageryLayer(
        new Cesium.OpenStreetMapImageryProvider({ url: geoConfig.cesiumImageryUrl })
      ),
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      selectionIndicator: false,
      infoBox: true,
    });

    // Real terrain (free Swiss quantized-mesh). Gracefully fall back to ellipsoid.
    if (geoConfig.cesiumTerrainUrl) {
      try {
        viewer.terrainProvider = await Cesium.CesiumTerrainProvider.fromUrl(
          geoConfig.cesiumTerrainUrl
        );
      } catch (e) {
        console.warn('[cesium] terrain load failed, falling back to ellipsoid', e);
        viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
      }
    }
    return viewer;
  }

  function flyTo(lng, lat, height = 15000, opts = {}) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lng, lat, height),
      duration: opts.duration ?? 2.5,
      ...opts,
    });
  }

  function flyToBoundingSphere(coords, opts = {}) {
    const pts = coords.map((c) => Cesium.Cartesian3.fromDegrees(c[0], c[1], c[2] || 0));
    const bs = Cesium.BoundingSphere.fromPoints(pts);
    viewer.camera.flyToBoundingSphere(bs, { duration: opts.duration ?? 2.5, ...opts });
  }

  function addPoint(lng, lat, height, opts = {}) {
    return viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lng, lat, height),
      point: {
        pixelSize: opts.size ?? 12,
        color: opts.color ?? Cesium.Color.RED,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
      },
      label: opts.label
        ? {
            text: opts.label,
            font: '14px sans-serif',
            pixelOffset: new Cesium.Cartesian2(0, -20),
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          }
        : undefined,
    });
  }

  function addPolyline(coords, opts = {}) {
    const positions = Cesium.Cartesian3.fromDegreesArrayHeights(coords.flat());
    return viewer.entities.add({
      polyline: {
        positions,
        width: opts.width ?? 5,
        material:
          opts.material ??
          new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.2, color: Cesium.Color.CYAN }),
        clampToGround: false,
      },
    });
  }

  function addPolygon(coords, opts = {}) {
    const positions = Cesium.Cartesian3.fromDegreesArray(coords.flat());
    const color = opts.color ?? Cesium.Color.BLUE;
    return viewer.entities.add({
      polygon: {
        hierarchy: positions,
        material: color.withAlpha(opts.opacity ?? 0.3),
        outline: true,
        outlineColor: Cesium.Color.YELLOW,
      },
    });
  }

  // Animate a marker traveling along a route (camera can follow via flyToBoundingSphere).
  function animateAlongRoute(coords, opts = {}) {
    const positions = coords.map((c) =>
      Cesium.Cartesian3.fromDegrees(c[0], c[1], (c[2] || 0) + 500)
    );
    return viewer.entities.add({
      position: new Cesium.CallbackProperty((time) => {
        const loop = positions.length * 4;
        const sec = (time.secondsOfDay % loop) / 4;
        const i = Math.floor(sec) % positions.length;
        const t = sec - Math.floor(sec);
        return Cesium.Cartesian3.lerp(
          positions[i],
          positions[(i + 1) % positions.length],
          t,
          new Cesium.Cartesian3()
        );
      }, false),
      point: { pixelSize: 14, color: Cesium.Color.ORANGE },
      label: {
        text: opts.label || 'traveler',
        font: '14px sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, -20),
      },
    });
  }

  function destroy() {
    if (viewer && !viewer.isDestroyed()) viewer.destroy();
    viewer = null;
  }

  return {
    get viewer() {
      return viewer;
    },
    initViewer,
    flyTo,
    flyToBoundingSphere,
    addPoint,
    addPolyline,
    addPolygon,
    animateAlongRoute,
    destroy,
  };
}
