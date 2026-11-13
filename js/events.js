// Event layer: one marker per distinct location of each event's Austragungen.
// If an Austragung ends somewhere else than it starts, it gets a start pin,
// an end pin and a straight line between them.
// Austragungen of the same event at the same start point share one marker,
// whose popup lists all of them.
(function () {
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // Coordinates are compared at ~1 m precision (5 decimals).
  function pointKey(p) {
    return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
  }

  function isPoint(p) {
    return !!p && typeof p.lat === 'number' && typeof p.lng === 'number';
  }

  function year(d) {
    return d ? String(d).slice(0, 4) : '';
  }

  // URL of a displayable image for a medium. Memobase links point to an HTML
  // viewer; the same image is served as JPEG through its IIIF endpoint.
  function imageSrc(url) {
    const memo = String(url).match(/^(https:\/\/media\.memobase\.ch\/memo\/[^/?#]+)\/viewer/);
    if (memo) return `${memo[1]}/iiif/full/600,/0/default.jpg`;
    return url;
  }

  // Horizontally scrollable strip of photos; each opens the full image in a new tab.
  // Images that fail to load (e.g. expired links) are removed from the strip.
  function photosHtml(photos) {
    if (!photos.length) return '';
    const figs = photos.map((m) => {
      const caption = m.legende || m.titel || '';
      return `<figure class="popup-photo">
          <a href="${esc(m.url)}" target="_blank" rel="noopener">
            <img src="${esc(imageSrc(m.url))}" alt="${esc(caption)}" loading="lazy"
                 onerror="var f=this.closest('figure'),s=f.parentNode;f.remove();if(!s.children.length)s.remove();">
          </a>
          ${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}
          ${m.credits ? `<div class="popup-credits">${esc(m.credits)}</div>` : ''}
        </figure>`;
    }).join('');
    return `<div class="popup-photos">${figs}</div>`;
  }

  function popupHtml(event, group, photos = []) {
    const items = group
      .slice()
      .sort((a, b) => String(a.datumStart).localeCompare(String(b.datumStart)))
      .map((a) => `<li>${esc(a.name)}${a.datumStart ? ` <span class="popup-date">(${esc(year(a.datumStart))})</span>` : ''}</li>`)
      .join('');
    return `
      <div class="event-popup">
        <strong>${esc(event ? event.name : 'Unbekanntes Event')}</strong>
        ${event && event.sportart ? `<div class="popup-sport">${esc(event.sportart)}</div>` : ''}
        <div class="popup-location">${esc(group[0].location)}</div>
        <ul>${items}</ul>
        ${photosHtml(photos)}
      </div>`;
  }

  // Ten distinct colours (Tableau 10); repeats after 10 events.
  const PALETTE = [
    '#1f77b4', '#d62728', '#2ca02c', '#9467bd', '#ff7f0e',
    '#17becf', '#e377c2', '#8c564b', '#bcbd22', '#7f7f7f',
  ];

  // White symbols drawn inside the pin head (head centre is 12.5/12.5).
  const PIN_SYMBOLS = {
    // Start of a route: an air horn (canister with a flared horn on top, sound waves).
    start: `<rect x="5.5" y="11.5" width="5" height="8" rx="1.3" fill="#fff"/>
      <path d="M6.5 11.5V10h3v1.5z" fill="#fff"/>
      <path d="M8 8.6h1.6l6.4-3.6v8.6l-6.4-3.6H8z" fill="#fff"/>
      <path d="M17.8 7.4a3.2 3.2 0 0 1 0 3.8M19.8 5.9a5.6 5.6 0 0 1 0 6.8" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>`,
    // End of a route: a chequered finish flag on a pole.
    end: (color) => `<path d="M7 5.5v14" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
      <rect x="7.75" y="6" width="10.5" height="7.5" fill="#fff"/>
      <g fill="${color}">
        <rect x="11.25" y="6" width="3.5" height="2.5"/><rect x="7.75" y="8.5" width="3.5" height="2.5"/>
        <rect x="14.75" y="8.5" width="3.5" height="2.5"/><rect x="11.25" y="11" width="3.5" height="2.5"/>
      </g>`,
    // Single location (start = end, or no end): a trophy cup.
    single: `<path d="M8.5 6h8v4a4 4 0 0 1-8 0z" fill="#fff"/>
      <path d="M8.5 7.3H6.6v1.2a2.6 2.6 0 0 0 2.4 2.6M16.5 7.3h1.9v1.2a2.6 2.6 0 0 1-2.4 2.6" fill="none" stroke="#fff" stroke-width="1.2"/>
      <path d="M11.6 13.8h1.8v2.4h-1.8zM9.3 16.2h6.4v2h-6.4z" fill="#fff"/>`,
  };

  // Pin size relative to Leaflet's default marker (25 x 41 px). Change this to resize all pins.
  const PIN_SCALE = 0.75;
  const PIN_W = 25 * PIN_SCALE;
  const PIN_H = 41 * PIN_SCALE;

  // Pin-shaped marker in the given colour; its tip sits on the coordinate.
  // kind: 'start' or 'end' of a route, or 'single' for a one-location Austragung.
  function pinIcon(color, kind = 'single') {
    const sym = PIN_SYMBOLS[kind];
    const inner = typeof sym === 'function' ? sym(color) : sym;
    return L.divIcon({
      className: 'event-pin',
      html: `<svg width="${PIN_W}" height="${PIN_H}" viewBox="0 0 25 41" aria-hidden="true">
        <path d="M12.5 0C5.6 0 0 5.6 0 12.5 0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z"
              fill="${color}" stroke="#fff" stroke-width="1.5"/>
        ${inner}
      </svg>`,
      iconSize: [PIN_W, PIN_H],
      iconAnchor: [PIN_W / 2, PIN_H],
      popupAnchor: [0, -PIN_H * 0.88],
    });
  }

  const POPUP_OPTS = { maxWidth: 280, minWidth: 220 };

  window.buildEventLayer = function buildEventLayer(data) {
    const eventsById = new Map((data.events || []).map((e) => [e.id, e]));
    const colorByEvent = new Map();
    function colorFor(eventId) {
      if (!colorByEvent.has(eventId)) {
        colorByEvent.set(eventId, PALETTE[colorByEvent.size % PALETTE.length]);
      }
      return colorByEvent.get(eventId);
    }
    (data.events || []).forEach((e) => colorFor(e.id));

    // Photos per Austragung and per event (medien with typ "Foto" and a URL).
    const photosByAustragung = new Map();
    const photosByEvent = new Map();
    (data.medien || []).forEach((m) => {
      if (m.typ !== 'Foto' || !m.url) return;
      const [map, id] = m.austragungId ? [photosByAustragung, m.austragungId] : [photosByEvent, m.eventId];
      if (!id) return;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(m);
    });

    // Group Austragungen by event + start point (+ end point if it is a route).
    const groups = new Map();
    (data.austragungen || []).forEach((a) => {
      if (!isPoint(a.start)) return;
      const end = isPoint(a.ende) && pointKey(a.ende) !== pointKey(a.start) ? a.ende : null;
      const key = `${a.eventId}|${pointKey(a.start)}|${end ? pointKey(end) : ''}`;
      if (!groups.has(key)) groups.set(key, { start: a.start, end, items: [] });
      groups.get(key).items.push(a);
    });

    const layers = [];
    groups.forEach(({ start, end, items }) => {
      const event = eventsById.get(items[0].eventId);
      const color = colorFor(items[0].eventId);
      const title = event ? event.name : items[0].name;
      const photos = [
        ...items.flatMap((it) => photosByAustragung.get(it.id) || []),
        ...(photosByEvent.get(items[0].eventId) || []),
      ];
      const html = popupHtml(event, items, photos);
      const a = [start.lat, start.lng];

      if (!end) {
        layers.push(L.marker(a, { title, icon: pinIcon(color, 'single') }).bindPopup(html, POPUP_OPTS));
        return;
      }
      // Route: start pin, end pin and a straight line between them, all opening the same popup.
      const b = [end.lat, end.lng];
      layers.push(
        L.polyline([a, b], { color, weight: 4, opacity: 0.85, className: 'event-route' }).bindPopup(html, POPUP_OPTS),
        L.marker(a, { title: `${title} – Start`, icon: pinIcon(color, 'start') }).bindPopup(html, POPUP_OPTS),
        L.marker(b, { title: `${title} – Ziel`, icon: pinIcon(color, 'end') }).bindPopup(html, POPUP_OPTS),
      );
    });
    return L.featureGroup(layers);
  };

  window.loadEvents = async function loadEvents(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  };
})();
