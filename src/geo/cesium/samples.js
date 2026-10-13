// Sample spatial data, centered on the Swiss Alps — the region covered by the
// free geo.admin.ch quantized-mesh terrain used by default.

export const ALPS_CENTER = { lng: 8.55, lat: 46.55, height: 9000 };

// Mountains (point entities + labels).
export const PEAKS = [
  { name: 'Matterhorn', lng: 7.6586, lat: 45.9763, height: 4478 },
  { name: 'Monte Rosa', lng: 7.8669, lat: 45.9369, height: 4634 },
  { name: 'Jungfrau', lng: 7.9615, lat: 46.5471, height: 4158 },
  { name: 'Eiger', lng: 8.0037, lat: 46.5775, height: 3967 },
  { name: 'Piz Bernina', lng: 9.9093, lat: 46.3842, height: 4049 },
];

// Tour route as [lng, lat, height] triples (polyline + animated traveler).
export const TOUR_ROUTE = [
  [7.6586, 45.9763, 4478],
  [7.8669, 45.9369, 4634],
  [7.9615, 46.5471, 4158],
  [8.0037, 46.5775, 3967],
  [9.9093, 46.3842, 4049],
];

// Highlight polygon (region of interest) as [lng, lat] pairs.
export const REGION_POLYGON = [
  [6.5, 45.8],
  [10.5, 45.8],
  [10.5, 47.2],
  [6.5, 47.2],
  [6.5, 45.8],
];
