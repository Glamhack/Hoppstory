// Creates the Leaflet map with swisstopo base layers.
// Returns the map plus an empty overlay group that data layers can fill later.
window.createMap = function createMap(elementId, cfg) {
  const map = L.map(elementId, {
    center: cfg.center,
    zoom: cfg.zoom,
    minZoom: cfg.minZoom,
    maxZoom: cfg.maxZoom,
    maxBounds: cfg.bounds,
    maxBoundsViscosity: 1.0,
  });

  const baseLayers = {};
  Object.entries(cfg.baseLayers).forEach(([name, def], i) => {
    baseLayers[name] = L.tileLayer(def.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
      bounds: cfg.bounds,
    });
    if (i === 0) baseLayers[name].addTo(map);
  });

  // Overlays added later (e.g. events, routes from Start/End Lat/Lon) go here.
  const overlays = {};
  const layerControl = L.control.layers(baseLayers, overlays, { collapsed: true }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);

  // Usage later: addOverlay('Events', L.layerGroup([...markers]))
  function addOverlay(name, layer, visible = true) {
    layerControl.addOverlay(layer, name);
    if (visible) layer.addTo(map);
    return layer;
  }

  return { map, addOverlay };
};
