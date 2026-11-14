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
      window.createTimeline(document.getElementById('timeline'), {
        // From the decade of the oldest Austragung up to this year.
        minYear: Math.floor(Math.min(...years, new Date().getFullYear()) / 10) * 10,
        maxYear: Math.max(...years, new Date().getFullYear()),
        items: layer.years,
        // Undated Austragungen only show while every year is selected.
        onChange: (from, to, all) => layer.setFilter(all ? null : (a) => {
          const y = parseInt(String(a.datumStart ?? '').slice(0, 4), 10);
          return y >= from && y <= to;
        }),
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
