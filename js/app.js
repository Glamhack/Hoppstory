// App entry point.
(function () {
  const cfg = window.APP_CONFIG;
  const { map, addOverlay } = window.createMap('map', cfg);
  window.app = { map, addOverlay }; // handy in the browser console

  // Events: one marker per distinct Austragung location.
  window.loadEvents(cfg.dataUrl)
    .then((data) => addOverlay('Events', window.buildEventLayer(data)))
    .catch((err) => console.error('Could not load event data:', err));

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) =>
        console.warn('Service worker registration failed:', err));
    });
  }
})();
