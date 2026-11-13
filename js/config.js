// Central settings. Change things here rather than in map.js.
window.APP_CONFIG = {
  // Roughly the centre of Switzerland and a zoom that shows the whole country.
  center: [46.8182, 8.2275],
  zoom: 8,
  minZoom: 7,
  maxZoom: 18,
  // Panning is limited to Switzerland plus a margin.
  bounds: [[45.6, 5.7], [48.0, 10.7]],

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

  // Exported data (Event / Austragung / Medien).
  dataUrl: 'data/data.json',

  // Later: the Google Sheet with the Event / Austragung / Medien tabs.
  // Leave null until the data layer is built.
  sheetId: null,
};
