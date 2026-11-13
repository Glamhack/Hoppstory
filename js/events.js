// Event layer: one marker per distinct location of each event's Austragungen.
// If an Austragung ends somewhere else than it starts, it gets a start pin,
// an end pin and a line between them that follows the road (straight if routing fails).
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

  // Lower-case words of a name without accents, digits or punctuation:
  // "Grand Prix, Bern 1954" -> ["grand", "prix", "bern"].
  function nameWords(s) {
    return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .split(/[^a-z]+/).filter((w) => w.length > 1);
  }

  // Fallback when an Austragung has no (or an unknown) eventId: the event whose
  // name words all appear in the Austragung's name; the most specific match wins.
  function guessEvent(austragung, events) {
    const words = new Set(nameWords(austragung.name));
    let best = null;
    events.forEach((e) => {
      const ew = nameWords(e.name);
      if (ew.length && ew.every((w) => words.has(w)) && (!best || ew.length > best.n)) best = { e, n: ew.length };
    });
    return best ? best.e : null;
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

  // Photo carousel: one photo at a time, with previous/next buttons, a counter and
  // swipe on touch screens. Each photo opens the full image in a new tab.
  // Images that fail to load (e.g. expired links) are dropped from the carousel.
  function photosHtml(photos) {
    if (!photos.length) return '';
    const figs = photos.map((m, i) => {
      const caption = m.legende || m.titel || '';
      return `<figure class="popup-photo"${i ? ' hidden' : ''}>
          <a href="${esc(m.url)}" target="_blank" rel="noopener">
            <img src="${esc(imageSrc(m.url))}" alt="${esc(caption)}" loading="lazy" onerror="hoppPhotoFailed(this)">
          </a>
          ${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}
          ${m.credits ? `<div class="popup-credits">${esc(m.credits)}</div>` : ''}
        </figure>`;
    }).join('');
    const nav = photos.length > 1 ? '' : ' hidden';
    return `<div class="carousel" data-index="0">
        <div class="carousel-track">${figs}</div>
        <div class="carousel-nav"${nav}>
          <button type="button" class="carousel-btn" data-step="-1" aria-label="Vorheriges Foto">&#8249;</button>
          <span class="carousel-count">1 / ${photos.length}</span>
          <button type="button" class="carousel-btn" data-step="1" aria-label="Nächstes Foto">&#8250;</button>
        </div>
      </div>`;
  }

  // Show photo number `index` (wrapping around) and update the counter.
  function showPhoto(carousel, index) {
    const figs = carousel.querySelectorAll('.popup-photo');
    if (!figs.length) { carousel.remove(); return; }
    const i = ((index % figs.length) + figs.length) % figs.length;
    figs.forEach((f, k) => { f.hidden = k !== i; });
    carousel.dataset.index = i;
    carousel.querySelector('.carousel-count').textContent = `${i + 1} / ${figs.length}`;
    carousel.querySelector('.carousel-nav').hidden = figs.length < 2;
  }

  // Called by a photo that failed to load: drop it and show the next one.
  window.hoppPhotoFailed = function (img) {
    const fig = img.closest('.popup-photo');
    const carousel = fig && fig.closest('.carousel');
    if (!carousel) return;
    const pos = [...carousel.querySelectorAll('.popup-photo')].indexOf(fig);
    let index = +carousel.dataset.index;
    fig.remove();
    if (pos < index) index -= 1; // keep showing the same photo; if the shown one failed, the next moves up
    showPhoto(carousel, index);
  };

  // Buttons and swipes, handled once for all popups. Capture phase, because
  // Leaflet stops clicks inside popups from bubbling up to the document.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.carousel-btn');
    if (!btn) return;
    const carousel = btn.closest('.carousel');
    showPhoto(carousel, +carousel.dataset.index + +btn.dataset.step);
  }, true);
  let touchX = null;
  document.addEventListener('touchstart', (e) => {
    touchX = e.target.closest && e.target.closest('.carousel') ? e.touches[0].clientX : null;
  }, { capture: true, passive: true });
  document.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    const carousel = e.target.closest && e.target.closest('.carousel');
    if (carousel && Math.abs(dx) > 40) showPhoto(carousel, +carousel.dataset.index + (dx < 0 ? 1 : -1));
  }, { capture: true, passive: true });

  // "1950-06-03" + "1950-06-04" -> "3.–4. Juni 1950". Dates with only a year
  // (or none) give '' because the year is already shown in the badge.
  const DAY_FMT = new Intl.DateTimeFormat('de-CH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  function fullDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''));
    return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3])) : null;
  }
  function dateText(start, end) {
    const a = fullDate(start);
    if (!a) return '';
    const b = fullDate(end);
    if (!b || b <= a) return DAY_FMT.format(a);
    return DAY_FMT.formatRange ? DAY_FMT.formatRange(a, b) : `${DAY_FMT.format(a)} – ${DAY_FMT.format(b)}`;
  }

  const LOCATION_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill="currentColor"/>
    </svg>`;

  // Popup layout: coloured header (event name + sport), location, a list of the
  // Austragungen with a year badge each (oldest first), then the photo carousel.
  function popupHtml(event, group, photos, color) {
    const items = group
      .slice()
      .sort((a, b) => String(a.datumStart ?? '9999').localeCompare(String(b.datumStart ?? '9999')))
      .map((a) => {
        const date = dateText(a.datumStart, a.datumEnde);
        return `<li>
            <span class="popup-year">${esc(year(a.datumStart) || '–')}</span>
            <span class="popup-edition">
              <span class="popup-edition-name">${esc(a.name)}</span>
              ${date ? `<span class="popup-edition-date">${esc(date)}</span>` : ''}
            </span>
          </li>`;
      })
      .join('');
    return `
      <div class="event-popup" style="--event-color: ${color}">
        <header class="popup-header">
          <div class="popup-title">${esc(event ? event.name : 'Unbekanntes Event')}</div>
          ${event && event.sportart ? `<div class="popup-sport">${esc(event.sportart)}</div>` : ''}
        </header>
        <div class="popup-body">
          ${group[0].location ? `<div class="popup-location">${LOCATION_ICON}${esc(group[0].location)}</div>` : ''}
          <div class="popup-heading">Austragungen</div>
          <ul class="popup-editions">${items}</ul>
          ${photosHtml(photos)}
        </div>
      </div>`;
  }

  // Six event colours, chosen to sit well with the app:
  // - no red (reserved for the Hopp!story header/logo) and no gray (vanishes on the gray map)
  // - dark enough that the white pin symbols stay readable (>= 3.2:1 against white)
  // - every pair stays distinguishable with red-green colour blindness (OKLab ΔE >= 10)
  //   and >= 3:1 against the gray map; ordered so neighbouring slots differ most.
  // Colours repeat after six events; the popup always names the event.
  const PALETTE = [
    '#1251b4', // blue
    '#b07932', // ochre
    '#0d9282', // teal
    '#902275', // plum
    '#436416', // olive
    '#956ed2', // lavender
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

  // autoPan off: map.js moves (and if needed zooms) the map so the whole popup is visible.
  const POPUP_OPTS = { maxWidth: 290, minWidth: 240, className: 'event-popup-wrap', autoPan: false };

  // Road route between two points from an OSRM server, as [[lat, lng], ...].
  // Identical start/end pairs share one request. Resolves to null on any failure.
  const routeCache = new Map();
  function fetchRoute(routingUrl, a, b) {
    const coords = `${a[1].toFixed(6)},${a[0].toFixed(6)};${b[1].toFixed(6)},${b[0].toFixed(6)}`;
    if (!routeCache.has(coords)) {
      const url = `${routingUrl}/${coords}?overview=full&geometries=geojson`;
      routeCache.set(coords, fetch(url)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          const line = json && json.code === 'Ok' && json.routes[0] && json.routes[0].geometry.coordinates;
          return line && line.length > 1 ? line.map(([lng, lat]) => [lat, lng]) : null;
        })
        .catch((err) => {
          console.warn('Routing failed, keeping straight line:', err);
          return null;
        }));
    }
    return routeCache.get(coords);
  }

  // options.routingUrl: OSRM route endpoint; routes are drawn as straight lines if not set.
  window.buildEventLayer = function buildEventLayer(data, options = {}) {
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

    // Link each Austragung to its event. If the export left eventId empty or it
    // points nowhere, fall back to matching by name (and say so in the console).
    const austragungen = (data.austragungen || []).map((a) => {
      if (eventsById.has(a.eventId)) return a;
      const guess = guessEvent(a, data.events || []);
      console.warn(`Austragung ${a.id} "${a.name}" has eventId ${JSON.stringify(a.eventId)};`,
        guess ? `matched to event ${guess.id} "${guess.name}" by name.` : 'no event matched by name.');
      return guess ? { ...a, eventId: guess.id } : a;
    });

    // Group Austragungen by event + start point (+ end point if it is a route).
    const groups = new Map();
    austragungen.forEach((a) => {
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
      const html = popupHtml(event, items, photos, color);
      const a = [start.lat, start.lng];

      if (!end) {
        layers.push(L.marker(a, { title, icon: pinIcon(color, 'single') }).bindPopup(html, POPUP_OPTS));
        return;
      }
      // Route: start pin, end pin and a line between them, all opening the same popup.
      // The line starts out straight and follows the road once the route has loaded.
      const b = [end.lat, end.lng];
      const line = L.polyline([a, b], { color, weight: 4, opacity: 0.85, className: 'event-route' });
      if (options.routingUrl) {
        fetchRoute(options.routingUrl, a, b).then((path) => {
          if (path) line.setLatLngs([a, ...path, b]);
        });
      }
      layers.push(
        line.bindPopup(html, POPUP_OPTS),
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
