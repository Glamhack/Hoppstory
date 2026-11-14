// App entry point.
(function () {
  const cfg = window.APP_CONFIG;
  const { map, addOverlay } = window.createMap('map', cfg);
  window.app = { map, addOverlay }; // handy in the browser console

  // Events: one marker per distinct Austragung location.
  // The timeline under the map filters them by year.
  window.loadEvents(cfg.dataUrl)
    .then((data) => {
      const layer = addOverlay('Events', window.buildEventLayer(data, { routingUrl: cfg.routingUrl }));
      const years = layer.years.map((y) => y.year);

      // After a range is selected, make sure all the matching markers are on
      // screen; if any is not, zoom/pan to show them all. Waits until the
      // selection has stopped changing, so the map does not jump while dragging.
      let fitTimer = null;
      function revealFiltered() {
        clearTimeout(fitTimer);
        fitTimer = setTimeout(() => {
          if (!map.hasLayer(layer) || !layer.getLayers().length) return;
          const target = layer.getBounds();
          // The visible area, minus a margin so pins (which stand above their
          // point) are not cut off at the edges.
          const size = map.getSize();
          const view = L.latLngBounds(
            map.containerPointToLatLng([30, 45]),
            map.containerPointToLatLng([size.x - 30, size.y - 10]),
          );
          if (view.contains(target)) return;
          map.closePopup();
          map.fitBounds(target, { paddingTopLeft: [40, 55], paddingBottomRight: [40, 20], maxZoom: 12 });
        }, 450);
      }

      window.createTimeline(document.getElementById('timeline'), {
        // From the decade of the oldest Austragung up to this year.
        minYear: Math.floor(Math.min(...years, new Date().getFullYear()) / 10) * 10,
        maxYear: Math.max(...years, new Date().getFullYear()),
        items: layer.years,
        // Undated Austragungen only show while every year is selected.
        onChange: (from, to, all) => {
          layer.setFilter(all ? null : (a) => {
            const y = parseInt(String(a.datumStart ?? '').slice(0, 4), 10);
            return y >= from && y <= to;
          });
          if (all) clearTimeout(fitTimer);
          else revealFiltered();
        },
      });
      map.invalidateSize(); // the timeline took some height from the map
    })
    .catch((err) => console.error('Could not load event data:', err));

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) =>
        console.warn('Service worker registration failed:', err));
    });
  }
})();
