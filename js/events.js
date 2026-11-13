// Event layer: one marker per distinct location of each event's Austragungen.
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

  function year(d) {
    return d ? String(d).slice(0, 4) : '';
  }

  function popupHtml(event, group) {
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
      </div>`;
  }

  // Ten distinct colours (Tableau 10); repeats after 10 events.
  const PALETTE = [
    '#1f77b4', '#d62728', '#2ca02c', '#9467bd', '#ff7f0e',
    '#17becf', '#e377c2', '#8c564b', '#bcbd22', '#7f7f7f',
  ];

  // Pin-shaped marker in the given colour (same size/anchor as Leaflet's default).
  function pinIcon(color) {
    return L.divIcon({
      className: 'event-pin',
      html: `<svg width="25" height="41" viewBox="0 0 25 41" aria-hidden="true">
        <path d="M12.5 0C5.6 0 0 5.6 0 12.5 0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z"
              fill="${color}" stroke="#fff" stroke-width="1.5"/>
        <circle cx="12.5" cy="12.5" r="4.5" fill="#fff"/>
      </svg>`,
      iconSize: [25, 41],
      iconAnchor: [12.5, 41],
      popupAnchor: [0, -36],
    });
  }

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

    // Group Austragungen by event + start point.
    const groups = new Map();
    (data.austragungen || []).forEach((a) => {
      if (!a.start || typeof a.start.lat !== 'number' || typeof a.start.lng !== 'number') return;
      const key = `${a.eventId}|${pointKey(a.start)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(a);
    });

    const markers = [];
    groups.forEach((group) => {
      const event = eventsById.get(group[0].eventId);
      const { lat, lng } = group[0].start;
      markers.push(
        L.marker([lat, lng], {
          title: event ? event.name : group[0].name,
          icon: pinIcon(colorFor(group[0].eventId)),
        })
          .bindPopup(popupHtml(event, group))
      );
    });
    return L.featureGroup(markers);
  };

  window.loadEvents = async function loadEvents(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  };
})();
