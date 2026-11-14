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

  // URL of a displayable image for a medium. Some sources link to an HTML page
  // about the image rather than the image itself:
  // - Memobase viewer -> the same image as JPEG through its IIIF endpoint
  // - Wikimedia Commons file page (…/wiki/File:Name.jpg) -> Special:FilePath,
  //   which redirects to a scaled copy of the actual image
  function imageSrc(url) {
    const s = String(url);
    const memo = s.match(/^(https:\/\/media\.memobase\.ch\/memo\/[^/?#]+)\/viewer/);
    if (memo) return `${memo[1]}/iiif/full/600,/0/default.jpg`;
    const commons = s.match(/^https:\/\/commons\.(?:m\.)?wikimedia\.org\/wiki\/File:([^?#]+)/);
    if (commons) return `https://commons.wikimedia.org/wiki/Special:FilePath/${commons[1]}?width=800`;
    return url;
  }

  // Embeddable player URL for a video medium, or null if the source has none:
  // - Memobase player (media.memobase.ch/memo/<id>/viewer…) -> as is, without query
  // - Memobase record page (memobase.ch/<lang>/object/<id>) -> its player, <id>-1/viewer
  //   (record pages themselves refuse to be embedded)
  // - SRF Play (…?urn=urn:srf:video:<id>) -> SRF's embed player
  function videoEmbedSrc(url) {
    const s = String(url);
    let m = s.match(/^https:\/\/media\.memobase\.ch\/memo\/([A-Za-z0-9_.-]+)\/viewer/);
    if (m) return `https://media.memobase.ch/memo/${m[1]}/viewer`;
    m = s.match(/^https:\/\/(?:www\.)?memobase\.ch\/[a-z]{2}\/object\/([A-Za-z0-9_.-]+)/);
    if (m) return `https://media.memobase.ch/memo/${m[1]}-1/viewer`;
    m = s.match(/^https:\/\/(?:www\.)?srf\.ch\/play\/.*[?&]urn=(urn:srf:video:[0-9a-f-]+)/i);
    if (m) return `https://www.srf.ch/play/embed?urn=${m[1]}`;
    return null;
  }

  // Name of a video's source, for the "watch at the source" link.
  // Name of a medium's source, for "open at the source" links.
  function sourceName(url) {
    const s = String(url);
    if (/memobase\.ch/.test(s)) return 'Memobase';
    if (/srf\.ch/.test(s)) return 'SRF Play';
    if (/wikimedia\.org/.test(s)) return 'Wikimedia Commons';
    if (/ethz\.sharedien\.com|e-pics\.ethz\.ch/.test(s)) return 'der ETH-Bibliothek';
    if (/staatsarchiv-findsystem\.gr\.ch/.test(s)) return 'dem Staatsarchiv Graubünden';
    if (/exlibrisgroup\.com/.test(s)) return 'der Bibliothek';
    if (/zem\.ch/.test(s)) return 'der Quelle';
    return 'der Quelle';
  }

  // Media carousel: one photo or video at a time, with previous/next buttons, a
  // counter and swipe on touch screens. Photos come first, then videos.
  // Photos open the full image in a new tab; images that fail to load (e.g.
  // expired links) show a "Foto bei … ansehen" link box instead (see hoppPhotoFailed). Videos play in the
  // source's embedded player (a link box if it fails, see hoppCheckVideo),
  // which is only loaded while its slide is shown (see showPhoto).
  function mediaHtml(media) {
    const items = [...media.filter((m) => m.typ === 'Foto'), ...media.filter((m) => m.typ !== 'Foto')];
    if (!items.length) return '';
    const figs = items.map((m, i) => {
      const caption = m.legende || m.titel || '';
      let body;
      if (m.typ === 'Foto') {
        body = `<a href="${esc(m.url)}" target="_blank" rel="noopener">
            <img src="${esc(imageSrc(m.url))}" alt="${esc(caption)}" loading="lazy" onerror="hoppPhotoFailed(this)">
          </a>`;
      } else {
        const embed = videoEmbedSrc(m.url);
        // Memobase films are mostly 4:3 and its player scrolls inside a wider
        // frame, so it gets a 4:3 frame; SRF is 16:9. scrolling="no" hides the
        // player's own scrollbar in any case.
        const ratio = embed && embed.includes('memobase.ch') ? ' media-frame-4x3' : '';
        // onload: checks once that the player URL works (see hoppCheckVideo).
        body = embed
          ? `<div class="media-frame${ratio}">
              <iframe data-src="${esc(embed)}"${i === 0 ? ` src="${esc(embed)}"` : ''} title="${esc(caption || 'Video')}"
                      onload="hoppCheckVideo(this)"
                      scrolling="no" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>
            </div>`
          : `<a class="media-frame media-placeholder" href="${esc(m.url)}" target="_blank" rel="noopener">&#9654; Video bei ${sourceName(m.url)} ansehen &#8599;</a>`;
      }
      return `<figure class="popup-photo" data-media-id="${esc(m.id || '')}" data-url="${esc(m.url)}"${i ? ' hidden' : ''}>
          ${body}
          ${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}
          ${m.credits ? `<div class="popup-credits">${esc(m.credits)}</div>` : ''}
        </figure>`;
    }).join('');
    const nav = items.length > 1 ? '' : ' hidden';
    return `<div class="carousel" data-index="0">
        <div class="carousel-track">${figs}</div>
        <div class="carousel-nav"${nav}>
          <button type="button" class="carousel-btn" data-step="-1" aria-label="Vorheriges Medium">&#8249;</button>
          <span class="carousel-count">1 / ${items.length}</span>
          <button type="button" class="carousel-btn" data-step="1" aria-label="Nächstes Medium">&#8250;</button>
        </div>
      </div>`;
  }

  // Show slide number `index` (wrapping around) and update the counter.
  // A video player is loaded when its slide is shown and unloaded when it is
  // hidden, so a video stops playing as soon as you move to another slide.
  function showPhoto(carousel, index) {
    const figs = carousel.querySelectorAll('.popup-photo');
    if (!figs.length) { carousel.remove(); return; }
    const i = ((index % figs.length) + figs.length) % figs.length;
    figs.forEach((f, k) => {
      f.hidden = k !== i;
      const frame = f.querySelector('iframe[data-src]');
      if (!frame) return;
      if (k === i && !frame.getAttribute('src')) frame.setAttribute('src', frame.dataset.src);
      if (k !== i && frame.getAttribute('src')) frame.removeAttribute('src');
    });
    carousel.dataset.index = i;
    carousel.querySelector('.carousel-count').textContent = `${i + 1} / ${figs.length}`;
    carousel.querySelector('.carousel-nav').hidden = figs.length < 2;
  }

  // Media that cannot be shown stay in the carousel as a dark box that only
  // links to the medium at its source ("Foto bei … ansehen"), the same as videos
  // without an embeddable player. The medium's ID and URL go to the console.
  function sourceLinkBox(fig, kind) {
    const url = fig.dataset.url;
    console.warn(`Medium ${fig.dataset.mediaId || '(ohne ID)'} konnte nicht geladen werden:`, url);
    const box = document.createElement('a');
    box.className = 'media-frame media-placeholder';
    box.href = url;
    box.target = '_blank';
    box.rel = 'noopener';
    box.textContent = kind === 'Video'
      ? `▶ Video bei ${sourceName(url)} ansehen ↗`
      : `Foto bei ${sourceName(url)} ansehen ↗`;
    return box;
  }

  // Called by a photo that failed to load (e.g. an expired or wrong link).
  window.hoppPhotoFailed = function (img) {
    const link = img.closest('a');
    const fig = img.closest('.popup-photo');
    if (link && fig) link.replaceWith(sourceLinkBox(fig, 'Foto'));
  };

  // Called when a video player frame loads. Whether an embedded player works
  // cannot be seen from outside, so the player URL is requested once (Memobase
  // and SRF allow this); if it fails, the player is replaced by the link box.
  window.hoppCheckVideo = function (frame) {
    const src = frame.dataset.src;
    if (!src || frame.dataset.checked) return;
    frame.dataset.checked = '1';
    const fail = () => {
      const fig = frame.closest('.popup-photo');
      const box = frame.closest('.media-frame');
      if (fig && box) box.replaceWith(sourceLinkBox(fig, 'Video'));
    };
    fetch(src, { mode: 'cors', credentials: 'omit' })
      .then((res) => { if (!res.ok) fail(); })
      .catch(fail);
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

  // Description text -> paragraphs (split at line breaks).
  function paragraphsHtml(text) {
    return String(text ?? '').split(/\r?\n/).map((p) => p.trim()).filter(Boolean)
      .map((p) => `<p>${esc(p)}</p>`).join('');
  }

  // Event card, used for the map popups and the event page: coloured header
  // (event name + sport), location(s), the photo carousel, then a list of the
  // Austragungen with a year badge each (oldest first).
  // opts.link: URL of the event page, shown as a link at the bottom (popups).
  // opts.description: true to add the event description at the bottom (event page).
  // opts.maxEditions: show at most this many Austragungen (the most recent ones)
  // plus a "weitere" link to opts.link (popups, to keep them short).
  function eventHtml(event, group, media, color, opts = {}) {
    const locations = [...new Set(group.map((a) => a.location).filter(Boolean))];
    let editions = group
      .slice()
      .sort((a, b) => String(a.datumStart ?? '9999').localeCompare(String(b.datumStart ?? '9999')));
    let hidden = 0;
    // Only shorten when it saves at least two rows ("1 weitere" instead of the row itself is no gain).
    if (opts.maxEditions && editions.length > opts.maxEditions + 1) {
      hidden = editions.length - opts.maxEditions;
      editions = editions.slice(hidden);
    }
    const more = hidden
      ? `<li><a class="popup-editions-more" href="${esc(opts.link || '#')}">+ ${hidden} frühere Austragung${hidden > 1 ? 'en' : ''}</a></li>`
      : '';
    const items = more + editions
      .map((a) => {
        const date = dateText(a.datumStart, a.datumEnde);
        return `<li>
            <a class="popup-edition-link" href="${esc(austragungPageUrl(a.id))}">
              <span class="popup-year">${esc(year(a.datumStart) || '–')}</span>
              <span class="popup-edition">
                <span class="popup-edition-name">${esc(a.name)}</span>
                ${date ? `<span class="popup-edition-date">${esc(date)}</span>` : ''}
              </span>
              <span class="popup-edition-chevron" aria-hidden="true">&#8250;</span>
            </a>
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
          ${locations.length ? `<div class="popup-location">${LOCATION_ICON}${esc(locations.join(' · '))}</div>` : ''}
          ${mediaHtml(media)}
          <div class="popup-heading">Austragungen</div>
          <ul class="popup-editions">${items}</ul>
          ${opts.description && event && event.beschreibung ? `
            <div class="popup-heading">Beschreibung</div>
            <div class="popup-description">${paragraphsHtml(event.beschreibung)}</div>` : ''}
        </div>
        ${opts.link ? `<footer class="popup-footer"><a class="popup-more" href="${esc(opts.link)}">Mehr zum Event &rarr;</a></footer>` : ''}
      </div>`;
  }

  // URLs of the event and Austragung pages.
  function eventPageUrl(eventId) {
    return `event.html?id=${encodeURIComponent(eventId)}`;
  }
  function austragungPageUrl(austragungId) {
    return `austragung.html?id=${encodeURIComponent(austragungId)}`;
  }

  // One date for the Austragung page: "29. Juli 1923", or just "1957" when only
  // the year is known, or "unbekannt".
  function singleDate(s) {
    const d = fullDate(s);
    if (d) return DAY_FMT.format(d);
    return year(s) || 'unbekannt';
  }

  // Rangliste: free text from the sheet (events are not uniform), shown as written,
  // one paragraph per line; empty lines are dropped.
  function rankingHtml(text) {
    const html = paragraphsHtml(text);
    return html
      ? `<div class="ranking-text">${html}</div>`
      : '<p class="page-empty">Für diese Austragung ist keine Rangliste erfasst.</p>';
  }

  // Newspaper articles: one card per article linking to the archive (the articles
  // are copyrighted, so they are linked rather than copied or embedded).
  function pressHtml(articles) {
    if (!articles.length) return '';
    const cards = articles.map((m) => {
      const source = [m.urheber, m.datum ? singleDate(m.datum) : ''].filter(Boolean).join(' · ');
      return `<li>
          <a class="press-card" href="${esc(m.url)}" target="_blank" rel="noopener">
            <svg class="press-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M4 5h13v13a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z M17 9h3v9a2 2 0 0 1-4 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              <path d="M7 8.5h7M7 11.5h7M7 14.5h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
            <span class="press-text">
              ${source ? `<span class="press-source">${esc(source)}</span>` : ''}
              <span class="press-title">${esc(m.titel || 'Zeitungsartikel')}</span>
              ${m.legende ? `<span class="press-summary">${esc(m.legende)}</span>` : ''}
              <span class="press-open">Artikel lesen &#8599;</span>
              ${m.credits ? `<span class="popup-credits">${esc(m.credits)}</span>` : ''}
            </span>
          </a>
        </li>`;
    }).join('');
    return `<div class="popup-heading">Presse</div>
      <ul class="press-list">${cards}</ul>`;
  }

  // Austragung page: header in the event colour (Austragung name, link to its
  // event), location, exact start and end date, its photos and videos, the Rangliste,
  // its newspaper articles, the link to the event, and at the bottom a mini map.
  function austragungHtml(a, event, media, color, articles = []) {
    return `
      <div class="event-popup" style="--event-color: ${color}">
        <header class="popup-header">
          <div class="popup-title">${esc(a.name)}</div>
          <div class="popup-sport">
            ${event ? `<a href="${esc(eventPageUrl(event.id))}">${esc(event.name)}</a>` : 'Unbekanntes Event'}
            ${event && event.sportart ? ` · ${esc(event.sportart)}` : ''}
          </div>
        </header>
        <div class="popup-body">
          <dl class="facts">
            <div><dt>Ort</dt><dd>${esc(a.location || 'unbekannt')}</dd></div>
            <div><dt>Startdatum</dt><dd>${esc(singleDate(a.datumStart))}</dd></div>
            <div><dt>Enddatum</dt><dd>${esc(singleDate(a.datumEnde))}</dd></div>
          </dl>
          ${mediaHtml(media)}
          <div class="popup-heading">Rangliste</div>
          ${rankingHtml(a.rangliste)}
          ${pressHtml(articles)}
          ${event ? `<a class="popup-more" href="${esc(eventPageUrl(event.id))}">Alle Austragungen von ${esc(event.name)} &rarr;</a>` : ''}
          ${isPoint(a.start) ? '<div id="mini-map" class="mini-map" role="img" aria-label="Karte: Ort der Austragung"></div>' : ''}
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
  const PIN_SCALE = 1.2;
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

  // Prepares the exported data for display: event lookup, event colours,
  // Austragungen linked to their event, and media. Shared by map and pages.
  function prepare(data) {
    const eventsById = new Map((data.events || []).map((e) => [e.id, e]));
    const colorByEvent = new Map();
    function colorFor(eventId) {
      if (!colorByEvent.has(eventId)) {
        colorByEvent.set(eventId, PALETTE[colorByEvent.size % PALETTE.length]);
      }
      return colorByEvent.get(eventId);
    }
    (data.events || []).forEach((e) => colorFor(e.id));

    // Photos and videos per Austragung and per event (medien of typ "Foto" or "Video" with a URL).
    const mediaByAustragung = new Map();
    const mediaByEvent = new Map();
    (data.medien || []).forEach((m) => {
      if ((m.typ !== 'Foto' && m.typ !== 'Video') || !m.url) return;
      const [map, id] = m.austragungId ? [mediaByAustragung, m.austragungId] : [mediaByEvent, m.eventId];
      if (!id) return;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(m);
    });
    // Newspaper articles per Austragung (medien of typ "Text" with a URL), oldest first.
    // Only shown on the Austragung page, not in the map popups.
    const articlesByAustragung = new Map();
    (data.medien || []).forEach((m) => {
      if (m.typ !== 'Text' || !m.url || !m.austragungId) return;
      if (!articlesByAustragung.has(m.austragungId)) articlesByAustragung.set(m.austragungId, []);
      articlesByAustragung.get(m.austragungId).push(m);
    });
    articlesByAustragung.forEach((list) => list.sort((x, y) => String(x.datum).localeCompare(String(y.datum))));
    function articlesFor(austragungId) {
      return articlesByAustragung.get(austragungId) || [];
    }

    // Media of these Austragungen plus the media of the event as a whole.
    function mediaFor(items, eventId) {
      return [
        ...items.flatMap((it) => mediaByAustragung.get(it.id) || []),
        ...(mediaByEvent.get(eventId) || []),
      ];
    }

    // Link each Austragung to its event. If the export left eventId empty or it
    // points nowhere, fall back to matching by name (and say so in the console).
    const austragungen = (data.austragungen || []).map((a) => {
      if (eventsById.has(a.eventId)) return a;
      const guess = guessEvent(a, data.events || []);
      console.warn(`Austragung ${a.id} "${a.name}" has eventId ${JSON.stringify(a.eventId)};`,
        guess ? `matched to event ${guess.id} "${guess.name}" by name.` : 'no event matched by name.');
      return guess ? { ...a, eventId: guess.id } : a;
    });

    return { eventsById, colorFor, mediaFor, articlesFor, austragungen };
  }

  // Draws one Austragung on a Leaflet map (the mini map on the Austragung page)
  // with the same pins as the main map: a cup for a single location, or start
  // pin, finish pin and the route between them (following the road once loaded).
  // Zooms the map to fit, and refits when the road route arrives.
  function drawAustragung(map, a, color, routingUrl) {
    if (!isPoint(a.start)) return;
    const s = [a.start.lat, a.start.lng];
    const pin = (latlng, kind) => L.marker(latlng, { icon: pinIcon(color, kind), interactive: false, keyboard: false });
    const hasEnd = isPoint(a.ende) && pointKey(a.ende) !== pointKey(a.start);
    if (!hasEnd) {
      pin(s, 'single').addTo(map);
      map.setView(s, 13);
      return;
    }
    const e = [a.ende.lat, a.ende.lng];
    const line = L.polyline([s, e], { color, weight: 5, opacity: 0.85, interactive: false }).addTo(map);
    pin(s, 'start').addTo(map);
    pin(e, 'end').addTo(map);
    // Extra room at the top for the pins (they stand above their coordinate) and
    // on the left for the zoom buttons.
    const fit = () => map.fitBounds(line.getBounds(), { paddingTopLeft: [56, 60], paddingBottomRight: [30, 24], maxZoom: 15 });
    fit();
    if (routingUrl) {
      fetchRoute(routingUrl, s, e).then((path) => {
        if (path) { line.setLatLngs([s, ...path, e]); fit(); }
      });
    }
  }

  // For the event and Austragung pages (js/event-page.js, js/austragung-page.js).
  window.HoppEvents = { prepare, eventHtml, austragungHtml, drawAustragung };

  // options.routingUrl: OSRM route endpoint; routes are drawn as straight lines if not set.
  // The returned layer also has:
  // - setFilter(fn): show only the markers/routes that have at least one
  //   Austragung for which fn(austragung) is true (null shows all). Popups
  //   always list all Austragungen of the marker, whatever the filter.
  // - years: [{ year, color }] for every dated Austragung, for the timeline
  window.buildEventLayer = function buildEventLayer(data, options = {}) {
    const { eventsById, colorFor, mediaFor, austragungen } = prepare(data);
    const layer = L.featureGroup();
    layer.setFilter = (fn) => {
      layer.clearLayers();
      buildLayers(fn).forEach((l) => layer.addLayer(l));
      return layer;
    };
    layer.years = austragungen
      .filter((a) => /^\d{4}/.test(String(a.datumStart ?? '')))
      .map((a) => ({ year: +year(a.datumStart), color: colorFor(a.eventId) }));
    return layer.setFilter(null);

    function buildLayers(fn) {
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
        if (fn && !items.some(fn)) return;
        const event = eventsById.get(items[0].eventId);
        const color = colorFor(items[0].eventId);
        const title = event ? event.name : items[0].name;
        const media = mediaFor(items, items[0].eventId);
        const html = eventHtml(event, items, media, color, { link: event ? eventPageUrl(event.id) : null, maxEditions: 3 });
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
      return layers;
    }
  };

  window.loadEvents = async function loadEvents(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  };
})();
