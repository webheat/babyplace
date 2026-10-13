import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { geoConfig } from '../config.js';

/**
 * Thin, reusable wrapper around a MapLibre GL map.
 * Layers are added idempotently (guarded by getSource) so handlers can be re-invoked.
 *
 * Usage (Vue setup):
 *   const ml = useMapLibre();
 *   ml.initMap(el);
 *   ml.map.on('load', () => { ml.addGeoJSON('region', regionGeoJSON); });
 *   onUnmounted(() => ml.destroy());
 */
export function useMapLibre() {
  let map = null;

  function initMap(container) {
    map = new maplibregl.Map({
      container,
      style: geoConfig.maplibreStyle,
      center: [8.2, 46.8],
      zoom: 8,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Free AWS terrarium DEM → hillshade + 3D terrain (no key).
    map.on('load', () => {
      if (geoConfig.maplibreTerrainUrl) {
        try {
          map.addSource('terrarium', {
            type: 'raster-dem',
            tiles: [geoConfig.maplibreTerrainUrl],
            tileSize: 256,
            encoding: 'terrarium',
            maxzoom: 15,
          });
          map.setTerrain({ source: 'terrarium', exaggeration: 1.4 });
        } catch (e) {
          console.warn('[maplibre] terrain setup failed', e);
        }
      }
    });
    return map;
  }

  // Highlight a polygon (or any GeoJSON) with a translucent fill + outline.
  function addGeoJSON(sourceId, geojson, opts = {}) {
    if (map.getSource(sourceId)) return;
    map.addSource(sourceId, { type: 'geojson', data: geojson });
    map.addLayer({
      id: `${sourceId}-fill`,
      type: 'fill',
      source: sourceId,
      paint: { 'fill-color': opts.color || '#2979ff', 'fill-opacity': opts.opacity ?? 0.35 },
    });
    map.addLayer({
      id: `${sourceId}-line`,
      type: 'line',
      source: sourceId,
      paint: { 'line-color': opts.color || '#2979ff', 'line-width': opts.width ?? 2 },
    });
  }

  // Route layer (line). Pass opts.dash = [2, 2] for a dashed line.
  function addRoute(sourceId, geojson, opts = {}) {
    if (map.getSource(sourceId)) return;
    map.addSource(sourceId, { type: 'geojson', data: geojson });
    map.addLayer({
      id: `${sourceId}-line`,
      type: 'line',
      source: sourceId,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': opts.color || '#ff5722',
        'line-width': opts.width ?? 5,
        'line-dasharray': opts.dash || [1, 0],
      },
    });
  }

  // Text labels from a GeoJSON Point layer. `field` is the property used as text.
  function addLabels(sourceId, geojson, opts = {}) {
    if (map.getSource(sourceId)) return;
    map.addSource(sourceId, { type: 'geojson', data: geojson });
    map.addLayer({
      id: `${sourceId}-label`,
      type: 'symbol',
      source: sourceId,
      layout: {
        'text-field': opts.field || 'name',
        'text-font': ['Noto Sans Regular'],
        'text-size': opts.size || 12,
        'text-anchor': 'bottom',
        'text-offset': [0, -0.6],
      },
      paint: {
        'text-color': opts.color || '#1a1a1a',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    });
  }

  // Data-driven circles: radius + color interpolated from a numeric property.
  function addDataDriven(sourceId, geojson, opts = {}) {
    if (map.getSource(sourceId)) return;
    map.addSource(sourceId, { type: 'geojson', data: geojson });
    const sizeProp = opts.sizeProp || 'value';
    const colorProp = opts.colorProp || 'value';
    map.addLayer({
      id: `${sourceId}-circle`,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['get', sizeProp],
          opts.sizeMin ?? 0, opts.radiusMin ?? 4,
          opts.sizeMax ?? 100, opts.radiusMax ?? 22,
        ],
        'circle-color': [
          'interpolate', ['linear'], ['get', colorProp],
          opts.cMin ?? 0, '#2980b9',
          opts.cMid ?? 50, '#f1c40f',
          opts.cMax ?? 100, '#e74c3c',
        ],
        'circle-opacity': opts.opacity ?? 0.8,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff',
      },
    });
  }

  function fitToGeoJSON(geojson, padding = 60) {
    const b = new maplibregl.LngLatBounds();
    const add = (c) => {
      if (Array.isArray(c) && typeof c[0] === 'number') b.extend(c);
    };
    geojson.features.forEach((f) => {
      const g = f.geometry;
      if (g.type === 'Point') add(g.coordinates);
      else if (g.type === 'LineString' || g.type === 'MultiPoint') g.coordinates.forEach(add);
      else if (g.type === 'Polygon' || g.type === 'MultiLineString')
        g.coordinates.forEach((ring) => ring.forEach(add));
      else if (g.type === 'MultiPolygon')
        g.coordinates.forEach((poly) => poly.forEach((ring) => ring.forEach(add)));
    });
    if (!b.isEmpty()) map.fitBounds(b, { padding });
  }

  function destroy() {
    if (map) map.remove();
    map = null;
  }

  return {
    get map() {
      return map;
    },
    initMap,
    addGeoJSON,
    addRoute,
    addLabels,
    addDataDriven,
    fitToGeoJSON,
    destroy,
  };
}
