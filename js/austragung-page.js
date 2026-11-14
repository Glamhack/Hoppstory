// Austragung page (austragung.html?id=A001): name, event, location, exact start
// and end date, the photos and videos of this Austragung, the Rangliste (winners)
// and links to newspaper articles about it.
(function () {
  const cfg = window.APP_CONFIG;
  const root = document.getElementById('austragung');
  const id = new URLSearchParams(location.search).get('id');

  function message(text) {
    root.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'page-message';
    p.textContent = text;
    const back = document.createElement('a');
    back.href = 'index.html';
    back.textContent = 'Zurück zur Karte';
    root.append(p, back);
  }

  // Small map close up on where the Austragung took place, on the first base
  // layer from config.js (the grey national map). Scroll-wheel zoom is off so
  // scrolling the page does not get stuck on the map; +/- and pinch still work.
  function showMiniMap(a, color) {
    const el = document.getElementById('mini-map');
    if (!el || !window.L) return;
    const map = L.map(el, { scrollWheelZoom: false, zoomControl: false, maxZoom: cfg.maxZoom });
    L.control.zoom({ position: 'bottomleft', zoomInTitle: 'Hineinzoomen', zoomOutTitle: 'Herauszoomen' }).addTo(map);
    const base = Object.values(cfg.baseLayers)[0];
    L.tileLayer(base.url, { attribution: cfg.attribution, maxZoom: cfg.maxZoom, bounds: cfg.bounds }).addTo(map);
    window.HoppEvents.drawAustragung(map, a, color, cfg.routingUrl);
  }

  window.loadEvents(cfg.dataUrl)
    .then((data) => {
      const { prepare, austragungHtml } = window.HoppEvents;
      const { eventsById, colorFor, mediaFor, articlesFor, austragungen } = prepare(data);
      const a = austragungen.find((x) => x.id === id);
      if (!a) {
        message('Diese Austragung wurde nicht gefunden.');
        return;
      }
      const event = eventsById.get(a.eventId) || null;
      // Only this Austragung's own media (not the event-wide ones).
      root.innerHTML = austragungHtml(a, event, mediaFor([a], null), colorFor(a.eventId), articlesFor(a.id));
      document.title = `${a.name} – Hopp!story`;
      showMiniMap(a, colorFor(a.eventId));
    })
    .catch((err) => {
      console.error('Could not load event data:', err);
      message('Die Daten konnten nicht geladen werden.');
    });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) =>
        console.warn('Service worker registration failed:', err));
    });
  }
})();
