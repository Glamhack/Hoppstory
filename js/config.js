// Central settings. Change things here rather than in map.js.
window.APP_CONFIG = {
  // Extent of Switzerland. On start the map is centred on it and zoomed to fit it
  // (as far as the screen allows; on phones only part of it fits).
  startBounds: [[45.818, 5.956], [47.808, 10.492]],
  minZoom: 7,
  maxZoom: 18,
  // Panning is limited to this box (Switzerland plus a margin). It must stay
  // inside the area every base layer has tiles for, so the map never shows
  // white edges (aerial imagery is the smallest: about 45.3–48.7 N, 4.7–11.5 E).
  // The margins are equal on opposite sides (in map projection), so that when
  // fully zoomed out Switzerland sits in the middle of the screen.
  // minZoom is only a lower floor: map.js raises it so the view always fits in the box.
  bounds: [[45.4, 5.0], [48.2, 11.5]],

  // swisstopo WMTS in Web Mercator (EPSG:3857). Free to use with attribution.
  // Other layers: replace the layer id, e.g. ch.swisstopo.pixelkarte-grau,
  // ch.swisstopo.swissimage (use format "jpeg").
  // The first entry is the default base layer.
  baseLayers: {
    'Landeskarte grau': {
      url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-grau/default/current/3857/{z}/{x}/{y}.jpeg',
    },
    'Landeskarte farbig': {
      url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
    },
    'Luftbild': {
      url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg',
    },
  },
  attribution: '&copy; <a href="https://www.swisstopo.admin.ch/" target="_blank" rel="noopener">swisstopo</a>',

  // Address of the live app (GitHub Pages); shown with the QR code in the header.
  liveUrl: 'https://glamhack.github.io/Hoppstory/',

  // Exported data (Event / Austragung / Medien).
  dataUrl: 'data/data.json',
  // Fake races for fun, shown as the "Easter Eggs" layer (off by default). Set to null to drop them.
  eastereggsUrl: 'data/eastereggs.json',
  // Milestones shown on the timeline (racing ban 1955–2026).
  milestonesUrl: 'data/meilensteine.json',

  // Routes (Austragungen whose end differs from their start) follow the road network,
  // using the free public OSRM demo server (car profile, OpenStreetMap data; light use only).
  // Set to null to draw straight lines instead.
  routingUrl: 'https://router.project-osrm.org/route/v1/driving',
};
