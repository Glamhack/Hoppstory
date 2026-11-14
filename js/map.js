// Creates the Leaflet map with swisstopo base layers.
// Returns the map plus an empty overlay group that data layers can fill later.
window.createMap = function createMap(elementId, cfg) {
  const bounds = L.latLngBounds(cfg.bounds);
  const start = L.latLngBounds(cfg.startBounds);
  const map = L.map(elementId, {
    center: start.getCenter(),
    zoom: cfg.minZoom,
    minZoom: cfg.minZoom,
    maxZoom: cfg.maxZoom,
    maxBounds: bounds,
    maxBoundsViscosity: 1.0,
    // Quarter steps let the minimum zoom fit the screen tightly.
    zoomSnap: 0.25,
    // No pinch "overshoot" past the minimum zoom, which would flash empty edges.
    bounceAtZoomLimits: false,
    // Added below in the bottom-left corner, out of the way of popups.
    zoomControl: false,
  });

  // The view must never be larger than the area that has tiles, otherwise
  // empty (white) edges appear. So the minimum zoom depends on the screen size.
  function updateMinZoom() {
    const fitZoom = map.getBoundsZoom(bounds, true); // smallest zoom whose view fits inside bounds
    map.setMinZoom(Math.max(cfg.minZoom, fitZoom));
    if (map.getZoom() < map.getMinZoom()) map.setZoom(map.getMinZoom(), { animate: false });
  }
  updateMinZoom();
  map.on('resize', updateMinZoom);

  // Start centred on Switzerland, zoomed to fit it (never below the minimum zoom).
  const startZoom = Math.max(map.getBoundsZoom(start, false, L.point(20, 20)), map.getMinZoom());
  map.setView(start.getCenter(), startZoom, { animate: false });

  // Make an opened popup fully visible. Leaflet's own autoPan cannot pan past
  // maxBounds, so near the edges (or when zoomed out) a popup would end up under
  // the header. Instead: find the lowest zoom (current zoom first) at which the
  // map can be moved so the whole popup is on screen without leaving the bounds,
  // and go there. A popup taller than the map is aligned with its top visible.
  const POPUP_PAD = 12; // px kept free around the popup
  function revealPopup(popup) {
    const el = popup.getElement();
    if (!el || !map.hasLayer(popup)) return;
    const size = map.getSize();
    const mapRect = map.getContainer().getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const p = map.latLngToContainerPoint(popup.getLatLng());
    // Popup extent around its anchor point, in pixels (does not change with zoom).
    const up = p.y - (r.top - mapRect.top);
    const down = Math.max(0, (r.bottom - mapRect.top) - p.y);
    const left = p.x - (r.left - mapRect.left);
    const right = (r.right - mapRect.left) - p.x;
    const fitsHeight = up + down + 2 * POPUP_PAD <= size.y;
    const half = size.divideBy(2);
    const z0 = map.getZoom();
    const step = map.options.zoomSnap || 1;

    for (let z = z0; z <= map.getMaxZoom() + 1e-9; z += step) {
      const a = map.project(popup.getLatLng(), z);
      const nw = map.project(bounds.getNorthWest(), z);
      const se = map.project(bounds.getSouthEast(), z);
      // Map centres (projected) that keep the popup on screen AND the view inside the bounds.
      const x0 = Math.max(a.x + right + POPUP_PAD - half.x, nw.x + half.x);
      const x1 = Math.min(a.x - left - POPUP_PAD + half.x, se.x - half.x);
      const y0 = Math.max(fitsHeight ? a.y + down + POPUP_PAD - half.y : -Infinity, nw.y + half.y);
      const y1 = Math.min(a.y - up - POPUP_PAD + half.y, se.y - half.y);
      if (x0 > x1 || y0 > y1) continue; // not possible at this zoom: try closer in
      const cur = map.project(map.getCenter(), z);
      const c = L.point(Math.min(Math.max(cur.x, x0), x1), Math.min(Math.max(cur.y, y0), y1));
      if (z === z0 && c.distanceTo(cur) < 1) return; // already fully visible
      map.setView(map.unproject(c, z), z);
      return;
    }
  }
  // Cap the popup height to what fits in the map (its content then scrolls, see
  // style.css). 20px for the tip below the popup.
  function limitPopupHeight(popup) {
    const el = popup.getElement();
    if (el) el.style.setProperty('--popup-max-h', `${map.getSize().y - 2 * POPUP_PAD - 20}px`);
  }
  // Wait one frame so the popup has its final size before measuring.
  map.on('popupopen', (e) => {
    limitPopupHeight(e.popup);
    requestAnimationFrame(() => revealPopup(e.popup));
  });
  // Window resized or phone rotated: fit the open popup again.
  map.on('resize', () => {
    const popup = map._popup;
    if (!popup || !map.hasLayer(popup)) return;
    limitPopupHeight(popup);
    popup.update();
    requestAnimationFrame(() => revealPopup(popup));
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
  // All controls sit bottom left. In a bottom corner each newly added control is
  // placed above the previous ones, so from the bottom up: scale, layers, zoom.
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
  const layerControl = L.control.layers(baseLayers, overlays, { collapsed: true, position: 'bottomleft' }).addTo(map);
  L.control.zoom({ position: 'bottomleft', zoomInTitle: 'Hineinzoomen', zoomOutTitle: 'Herauszoomen' }).addTo(map);

  // Usage later: addOverlay('Events', L.layerGroup([...markers]))
  function addOverlay(name, layer, visible = true) {
    layerControl.addOverlay(layer, name);
    if (visible) layer.addTo(map);
    return layer;
  }

  return { map, addOverlay };
};
