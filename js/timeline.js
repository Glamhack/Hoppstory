// Year range picker shown under the map. The whole period fits the width of
// the screen: a thin axis with a tick and label per decade, a dot for each
// Austragung (in its event colour) at its year, and the selected range as a
// block with a handle on each end.
// - at first nothing is selected: every Austragung shows, including undated ones
// - tap the axis to select that decade
// - drag a handle to change the start or end year (by single years)
// - drag the block itself to move the whole range
// - tapping the block (without dragging) or pressing Escape on a handle
//   clears the selection again
//
// createTimeline(element, { minYear, maxYear, items: [{ year, color }], onChange(from, to, all) })
window.createTimeline = function createTimeline(root, opts) {
  const first = opts.minYear;
  const last = opts.maxYear;
  const n = last - first + 1;
  const MIN_LABEL_GAP = 40; // px; decade labels closer than this are thinned out

  let selected = false; // false: no filter, all years
  let from = 0; // selected range, as indexes into the years (inclusive)
  let to = 0;

  const pct = (i) => `${(i / n) * 100}%`;

  // Dots per year (at most 3 stacked).
  const byYear = new Map();
  opts.items.forEach(({ year, color }) => {
    if (year < first || year > last) return;
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(color);
  });
  const dots = [...byYear].map(([y, colors]) => {
    const i = y - first;
    return `<div class="tl-dots" data-i="${i}" style="left:${pct(i + 0.5)}"
        title="${y}: ${colors.length} Austragung${colors.length > 1 ? 'en' : ''}">
        ${colors.slice(0, 3).map((c) => `<i style="background:${c}"></i>`).join('')}
      </div>`;
  }).join('');

  // Ticks: long ones per decade, short ones at the half decade.
  const ticks = [];
  const labels = [];
  for (let y = Math.ceil(first / 5) * 5; y <= last; y += 5) {
    const decade = y % 10 === 0;
    ticks.push(`<span class="tl-tick${decade ? ' tl-tick-major' : ''}" style="left:${pct(y - first)}"></span>`);
    if (decade) labels.push(`<span class="tl-decade" data-y="${y}" style="left:${pct(y - first)}">${y}</span>`);
  }

  root.classList.add('timeline');
  root.innerHTML = `
    <div class="tl-track">
      <div class="tl-axis"></div>
      ${ticks.join('')}
      <div class="tl-ghost" hidden></div>
      <div class="tl-range" hidden title="Antippen, um die Auswahl aufzuheben">
        <span class="tl-handle tl-handle-from" role="slider" tabindex="0" aria-label="Startjahr"></span>
        <span class="tl-handle tl-handle-to" role="slider" tabindex="0" aria-label="Endjahr"></span>
      </div>
      ${labels.join('')}
      ${dots}
    </div>`;

  const track = root.querySelector('.tl-track');
  const range = root.querySelector('.tl-range');
  const ghost = root.querySelector('.tl-ghost');
  const handleFrom = root.querySelector('.tl-handle-from');
  const handleTo = root.querySelector('.tl-handle-to');
  const dotEls = [...root.querySelectorAll('.tl-dots')];
  const labelEls = [...root.querySelectorAll('.tl-decade')];

  const isAll = () => !selected;
  const inRange = (i) => selected && i >= from && i <= to;

  function render() {
    range.hidden = !selected;
    range.style.left = pct(from);
    range.style.width = pct(to - from + 1);
    dotEls.forEach((el) => el.classList.toggle('in-range', inRange(+el.dataset.i)));
    labelEls.forEach((el) => {
      const i = +el.dataset.y - first;
      el.classList.toggle('in-range', inRange(i) && inRange(Math.min(i + 3, last - first)));
    });
    const a = first + from;
    const b = first + to;
    handleFrom.setAttribute('aria-valuenow', a);
    handleFrom.setAttribute('aria-valuemin', first);
    handleFrom.setAttribute('aria-valuemax', b);
    handleTo.setAttribute('aria-valuenow', b);
    handleTo.setAttribute('aria-valuemin', a);
    handleTo.setAttribute('aria-valuemax', last);
  }

  // Show only every k-th decade label so they never overlap.
  function layoutLabels() {
    const decadePx = (track.clientWidth / n) * 10;
    const k = decadePx > 0 ? Math.max(1, Math.ceil(MIN_LABEL_GAP / decadePx)) : 1;
    labelEls.forEach((el) => { el.hidden = (+el.dataset.y / 10) % k !== 0; });
  }
  if ('ResizeObserver' in window) new ResizeObserver(layoutLabels).observe(track);
  else window.addEventListener('resize', layoutLabels);

  let lastSent = 'all';
  function notify() {
    const key = selected ? `${from}-${to}` : 'all';
    if (key === lastSent) return;
    lastSent = key;
    opts.onChange(first + from, first + to, !selected);
  }
  function set(f, t) {
    selected = true;
    from = Math.max(0, Math.min(f, n - 1));
    to = Math.max(from, Math.min(t, n - 1));
    render();
    notify();
  }
  function clear() {
    selected = false;
    render();
    notify();
  }

  // Pointer position on the track, in years (fractional) from the first year.
  const yearAt = (e) => {
    const r = track.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * n;
  };
  // Index range of the decade around year index i (clamped to the track).
  function decadeOf(i) {
    const d = Math.floor((first + i) / 10) * 10;
    return [Math.max(d, first) - first, Math.min(d + 9, last) - first];
  }

  // Dragging: 'from' / 'to' move one end, 'move' shifts the whole range,
  // 'tap' is a press outside the block (selects a decade if it does not move).
  let drag = null;
  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const pos = yearAt(e);
    const i = Math.max(0, Math.min(Math.floor(pos), n - 1));
    if (e.target === handleFrom) drag = { mode: 'from' };
    else if (e.target === handleTo) drag = { mode: 'to' };
    else if (inRange(i)) drag = { mode: 'move', grab: i - from, len: to - from };
    else drag = { mode: 'tap', i };
    drag.startX = e.clientX;
    track.setPointerCapture(e.pointerId);
    range.classList.toggle('is-dragging', drag.mode !== 'tap');
    ghost.hidden = true;
    e.preventDefault();
  });

  track.addEventListener('pointermove', (e) => {
    const pos = yearAt(e);
    if (!drag) {
      // Mouse hover: preview the decade a click would select.
      const i = Math.max(0, Math.min(Math.floor(pos), n - 1));
      const show = e.pointerType === 'mouse' && !inRange(i) && e.target !== handleFrom && e.target !== handleTo;
      ghost.hidden = !show;
      if (show) {
        const [a, b] = decadeOf(i);
        ghost.style.left = pct(a);
        ghost.style.width = pct(b - a + 1);
      }
      return;
    }
    if (drag.mode === 'tap') return;
    if (drag.mode === 'from') set(Math.min(Math.round(pos), to), to);
    else if (drag.mode === 'to') set(from, Math.max(Math.round(pos) - 1, from));
    else {
      const f = Math.max(0, Math.min(Math.floor(pos) - drag.grab, n - 1 - drag.len));
      set(f, f + drag.len);
    }
  });
  track.addEventListener('pointerleave', () => { ghost.hidden = true; });

  track.addEventListener('pointerup', (e) => {
    const still = drag && Math.abs(e.clientX - drag.startX) < 8;
    if (still && drag.mode === 'tap') {
      const [a, b] = decadeOf(drag.i);
      set(a, b);
    } else if (still && drag.mode === 'move') {
      clear(); // tap on the block
    }
    drag = null;
    range.classList.remove('is-dragging');
  });
  track.addEventListener('pointercancel', () => {
    drag = null;
    range.classList.remove('is-dragging');
  });

  // Keyboard on the handles: arrows move by a year, Page Up/Down by ten.
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selected) clear();
  });
  function keyStep(e) {
    return { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 }[e.key] || 0;
  }
  handleFrom.addEventListener('keydown', (e) => {
    const s = keyStep(e);
    if (!s) return;
    e.preventDefault();
    set(Math.min(from + s, to), to);
  });
  handleTo.addEventListener('keydown', (e) => {
    const s = keyStep(e);
    if (!s) return;
    e.preventDefault();
    set(from, Math.max(to + s, from));
  });

  render();
  layoutLabels();

  return {
    set: (a, b) => set(a - first, b - first),
    clear,
    get: () => ({ from: first + from, to: first + to, all: isAll() }),
  };
};
