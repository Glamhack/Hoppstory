// App entry point.
(function () {
  const cfg = window.APP_CONFIG;
  const { map, addOverlay } = window.createMap('map', cfg);
  window.app = { map, addOverlay }; // handy in the browser console

  // Data layers (Google Sheet: Event / Austragung / Medien) will be wired up here.

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) =>
        console.warn('Service worker registration failed:', err));
    });
  }
})();
