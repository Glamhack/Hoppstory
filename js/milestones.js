// Milestones on the timeline under the map (data/meilensteine.json).
// Adds two things to the existing timeline (js/timeline.js):
// - a hatched band for a period, here the Swiss ban on circuit races (1958–2026)
// - a diamond marker per milestone; tapping it opens a card above the timeline
//   with the text, the vote result and the sources, plus buttons to step
//   to the previous / next milestone
//
// addMilestones(timelineRoot, data, { minYear, maxYear })
window.addMilestones = function addMilestones(root, data, opts) {
  const track = root.querySelector('.tl-track');
  if (!track || !data || !Array.isArray(data.meilensteine)) return null;
  const first = opts.minYear;
  const n = opts.maxYear - first + 1;

  // Position of a date (YYYY-MM-DD) on the track, in percent.
  function pos(dateStr) {
    const [y, m = 1, d = 1] = String(dateStr).split('-').map(Number);
    const frac = ((m - 1) + (d - 1) / 31) / 12;
    return Math.max(0, Math.min(100, ((y + frac - first) / n) * 100));
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Band for the ban period.
  if (data.verbot) {
    const a = pos(data.verbot.von);
    const b = pos(data.verbot.bis);
    const band = document.createElement('div');
    band.className = 'tl-ban';
    band.style.left = `${a}%`;
    band.style.width = `${b - a}%`;
    band.title = `${data.verbot.label}: ${data.verbot.von.slice(0, 4)}–${data.verbot.bis.slice(0, 4)}`;
    band.innerHTML = `<span>${esc(data.verbot.label)}</span>`;
    track.appendChild(band);
  }

  const sources = (qs) => (qs && qs.length ? `
        <ul class="ms-sources">
          ${qs.map((q) => `
            <li><a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.titel)}</a>
              <small>${esc(q.typ)}${q.herausgeber ? ` · ${esc(q.herausgeber)}` : ''}</small></li>`).join('')}
        </ul>` : '');
  const note = '<p class="ms-note">Stimmenzahlen aus automatischer Texterkennung, am Original (PDF) noch zu prüfen.</p>';

  // A milestone with "schritte" (steps) shows them as a small chronology,
  // each step with its own date, text, vote and sources.
  function stepsHtml(steps) {
    return `<ol class="ms-steps">${steps.map((st) => `
      <li>
        <div class="ms-step-date">${esc(st.datumAnzeige)}</div>
        <h3>${esc(st.titel)}</h3>
        <p>${esc(st.kurztext)}</p>
        ${voteBar(st.abstimmung)}
        ${st.zuPruefen ? note : ''}
        ${sources(st.quellen)}
      </li>`).join('')}</ol>`;
  }

  let current = -1; // index of the open milestone, -1 when the card is closed
  const items = [...data.meilensteine].sort((x, y) => x.datum.localeCompare(y.datum));

  // Markers. Milestones closer together than MIN_GAP pixels share one marker;
  // it opens the earliest, and the card's arrows step through the rest. (A
  // milestone can also hold several steps itself, see "schritte" below.) Markers stop the pointer events, so a tap opens a card instead
  // of selecting a decade on the timeline.
  const MIN_GAP = 18;
  let markers = []; // [{ el, idx: [item indexes] }]
  function layoutMarkers() {
    markers.forEach((m) => m.el.remove());
    const width = track.clientWidth || 1;
    const groups = [];
    items.forEach((m, i) => {
      const x = (pos(m.datum) / 100) * width;
      const g = groups[groups.length - 1];
      if (g && x - g.x0 < MIN_GAP) g.idx.push(i);
      else groups.push({ x0: x, idx: [i] });
    });
    markers = groups.map((g) => {
      const its = g.idx.map((i) => items[i]);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'tl-ms';
      el.style.left = `${pos(its[0].datum)}%`;
      const label = its.map((m) => `${m.datumAnzeige}: ${m.titel}`).join('\n');
      el.title = label;
      el.setAttribute('aria-label', its.length > 1
        ? `${its.length} Meilensteine, ab ${its[0].datumAnzeige}` : `Meilenstein ${label}`);
      ['pointerdown', 'pointerup', 'pointermove'].forEach((t) =>
        el.addEventListener(t, (e) => e.stopPropagation()));
      el.addEventListener('click', (e) => { e.stopPropagation(); open(g.idx[0]); });
      track.appendChild(el);
      return { el, idx: g.idx };
    });
    if (current >= 0) markActive();
  }
  function markActive() {
    markers.forEach((m) => m.el.classList.toggle('is-active', m.idx.includes(current)));
  }
  const markerOf = (i) => markers.find((m) => m.idx.includes(i));

  // The card sits above the timeline, over the map.
  const card = document.createElement('section');
  card.className = 'ms-card';
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-live', 'polite');
  document.body.appendChild(card);

  function voteBar(v) {
    if (!v) return '';
    const total = v.ja + v.nein;
    const pctJa = Math.round((v.ja / total) * 100);
    return `
      <div class="ms-vote" aria-label="${esc(v.rat)}: ${v.ja} Ja, ${v.nein} Nein">
        <div class="ms-vote-label"><span>${esc(v.rat)}</span><span>${v.ja} : ${v.nein}</span></div>
        <div class="ms-vote-bar"><i class="ms-ja" style="width:${pctJa}%"></i><i class="ms-nein"></i></div>
        <div class="ms-vote-legend"><span>Ja ${v.ja}</span><span>Nein ${v.nein}</span></div>
      </div>`;
  }

  function open(i) {
    current = i;
    const m = items[i];
    markActive();
    card.innerHTML = `
      <header class="ms-head">
        <div>
          <div class="ms-date">${esc(m.datumAnzeige)}${m.kategorie ? ` · ${esc(m.kategorie)}` : ''}</div>
          <h2>${esc(m.titel)}</h2>
        </div>
        <button type="button" class="ms-close" aria-label="Schliessen">×</button>
      </header>
      <div class="ms-body">
        <p class="ms-lead">${esc(m.kurztext)}</p>
        ${voteBar(m.abstimmung)}
        <p>${esc(m.beschreibung)}</p>
        ${Array.isArray(m.schritte) ? stepsHtml(m.schritte) : `
          ${m.zuPruefen ? note : ''}
          ${m.quellen && m.quellen.length ? '<h3>Quellen</h3>' : ''}
          ${sources(m.quellen)}`}
      </div>
      <footer class="ms-nav">
        <button type="button" class="ms-prev" ${i === 0 ? 'disabled' : ''}>‹ Früher</button>
        <span>${i + 1} / ${items.length}</span>
        <button type="button" class="ms-next" ${i === items.length - 1 ? 'disabled' : ''}>Später ›</button>
      </footer>`;
    card.hidden = false;
    card.querySelector('.ms-close').addEventListener('click', close);
    card.querySelector('.ms-prev').addEventListener('click', () => open(i - 1));
    card.querySelector('.ms-next').addEventListener('click', () => open(i + 1));
    card.querySelector('.ms-body').scrollTop = 0;
    // Keep the card just above the timeline, whatever its height.
    card.style.bottom = `${root.getBoundingClientRect().height + 10}px`;
  }
  function close() {
    card.hidden = true;
    const m = markerOf(current);
    current = -1;
    markActive();
    if (m) m.el.focus();
  }
  document.addEventListener('keydown', (e) => {
    if (card.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft' && current > 0) open(current - 1);
    else if (e.key === 'ArrowRight' && current < items.length - 1) open(current + 1);
  });

  layoutMarkers();
  if ('ResizeObserver' in window) new ResizeObserver(layoutMarkers).observe(track);
  else window.addEventListener('resize', layoutMarkers);

  return { open, close };
};
