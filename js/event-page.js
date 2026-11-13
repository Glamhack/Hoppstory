// Event page (event.html?id=E001): the same card as the map popup, but for the
// whole event (all its Austragungen, locations, photos and videos), plus the description.
(function () {
  const cfg = window.APP_CONFIG;
  const root = document.getElementById('event');
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

  window.loadEvents(cfg.dataUrl)
    .then((data) => {
      const { prepare, eventHtml } = window.HoppEvents;
      const { eventsById, colorFor, mediaFor, austragungen } = prepare(data);
      const event = eventsById.get(id);
      if (!event) {
        message('Dieses Event wurde nicht gefunden.');
        return;
      }
      const items = austragungen.filter((a) => a.eventId === event.id);
      root.innerHTML = eventHtml(event, items, mediaFor(items, event.id), colorFor(event.id), { description: true });
      document.title = `${event.name} – Hopp!story`;
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
