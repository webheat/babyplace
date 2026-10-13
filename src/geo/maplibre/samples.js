// Sample GeoJSON for the MapLibre demo: region highlight, route, labels, data-driven points.
// All coordinates are in/around Switzerland.

export const regionGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Alpine Region' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[6.0, 45.8], [10.5, 45.8], [10.5, 47.8], [6.0, 47.8], [6.0, 45.8]]],
      },
    },
  ],
};

export const routeGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Alpine Tour' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [7.6586, 45.9763],
          [7.8669, 45.9369],
          [7.9615, 46.5471],
          [8.0037, 46.5775],
          [9.9093, 46.3842],
        ],
      },
    },
  ],
};

export const labelGeoJSON = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Matterhorn' }, geometry: { type: 'Point', coordinates: [7.6586, 45.9763] } },
    { type: 'Feature', properties: { name: 'Monte Rosa' }, geometry: { type: 'Point', coordinates: [7.8669, 45.9369] } },
    { type: 'Feature', properties: { name: 'Jungfrau' }, geometry: { type: 'Point', coordinates: [7.9615, 46.5471] } },
    { type: 'Feature', properties: { name: 'Eiger' }, geometry: { type: 'Point', coordinates: [8.0037, 46.5775] } },
    { type: 'Feature', properties: { name: 'Piz Bernina' }, geometry: { type: 'Point', coordinates: [9.9093, 46.3842] } },
  ],
};

// City points with a numeric `value` property for data-driven circle sizing/coloring.
export const dataGeoJSON = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Zurich', value: 100 }, geometry: { type: 'Point', coordinates: [8.5417, 47.3769] } },
    { type: 'Feature', properties: { name: 'Geneva', value: 70 }, geometry: { type: 'Point', coordinates: [6.1432, 46.2044] } },
    { type: 'Feature', properties: { name: 'Bern', value: 55 }, geometry: { type: 'Point', coordinates: [7.4474, 46.948] } },
    { type: 'Feature', properties: { name: 'Basel', value: 60 }, geometry: { type: 'Point', coordinates: [7.5876, 47.5596] } },
    { type: 'Feature', properties: { name: 'Lausanne', value: 45 }, geometry: { type: 'Point', coordinates: [6.6323, 46.5197] } },
    { type: 'Feature', properties: { name: 'Lugano', value: 30 }, geometry: { type: 'Point', coordinates: [8.9511, 46.0037] } },
  ],
};
