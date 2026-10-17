// Langkah council dashboard (docs/revenue-plan.md Phase 13; guide Section 15.7).
// Read-only: one call to council_data() with the public anon key. No names or user
// ids ever reach this page. User notes are always set as text, never as HTML.
(function () {
  'use strict';

  const CFG = window.LANGKAH_CONFIG;
  const S = window.STRINGS;
  const IPOH = [101.0795, 4.5985];
  const STYLE = 'https://tiles.openfreemap.org/styles/positron';
  const PAGE = 50;
  const HZ_CATS = ['broken_sidewalk', 'blocked_path', 'no_light', 'unsafe_crossing', 'flooding', 'other'];
  const IM_CATS = ['zebra_crossing', 'repaint_crossing', 'fix_sidewalk', 'street_lights', 'shelter', 'kerb_ramp', 'other'];

  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window */ } },
  };

  let lang = store.get('langkah.council.lang') === 'en' ? 'en' : 'ms';
  let days = [30, 90, 365].includes(Number(store.get('langkah.council.days'))) ? Number(store.get('langkah.council.days')) : 90;
  let data = null;
  let shown = PAGE;
  let map = null;
  let mapReady = false;
  let popup = null;
  let picked = null; // id of the highlighted request

  function t(key, vars) {
    let s = (S[lang] && S[lang][key]) || S.en[key] || key;
    if (vars) for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
    return s;
  }
  const locale = () => (lang === 'ms' ? 'ms-MY' : 'en-MY');
  const num = (n) => new Intl.NumberFormat(locale()).format(n);
  const day = (d) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));
  const short = (d) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(d + 'T00:00:00'));
  const cat = (kind, c) => t(kind + '_' + c);
  const photoUrl = (p) => CFG.url.replace(/\/$/, '') + '/storage/v1/object/public/report-photos/' + encodeURIComponent(p);

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---------------------------------------------------------------- data
  async function load() {
    setState('loading');
    try {
      const res = await fetch(CFG.url.replace(/\/$/, '') + '/rest/v1/rpc/council_data', {
        method: 'POST',
        headers: { apikey: CFG.anonKey, Authorization: 'Bearer ' + CFG.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_days: days }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const body = await res.json();
      if (body.error) throw new Error(body.error);
      data = body;
      shown = PAGE;
      setState(null);
      render();
    } catch (e) {
      console.error(e);
      setState('bad');
    }
  }

  function setState(kind) {
    const box = $('state');
    box.className = 'state' + (kind === 'bad' ? ' bad' : '');
    box.replaceChildren();
    if (kind === 'loading') box.append(el('span', null, t('loading')));
    if (kind === 'bad') {
      box.append(el('span', null, t('loadFailed')));
      const b = el('button', 'btn', t('retry'));
      b.type = 'button';
      b.onclick = load;
      box.append(b);
    }
    if (kind === 'config') box.append(el('span', null, t('noConfig')));
  }

  // ---------------------------------------------------------------- text
  function renderText() {
    document.documentElement.lang = lang;
    document.title = t('title');
    document.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); });
    const lb = $('lang');
    lb.textContent = t('lang');
    lb.setAttribute('aria-label', t('langLabel'));
    lb.lang = lang === 'ms' ? 'en' : 'ms';
    $('period').setAttribute('aria-label', t('period'));
    document.querySelectorAll('#period button').forEach((b) => {
      b.textContent = t('days', { n: b.dataset.days });
      b.setAttribute('aria-checked', String(Number(b.dataset.days) === days));
    });
    $('catsTitle').textContent = t('catsTitle', { n: days });
    $('csv').textContent = t('csv');
    $('geojson').textContent = t('geojson');
    fillSelect($('hzCat'), 'hazard', HZ_CATS, t('allHz'));
    fillSelect($('imCat'), 'improvement', IM_CATS, t('allIm'));
  }

  function fillSelect(sel, kind, cats, all) {
    const keep = sel.value;
    sel.replaceChildren(new Option(all, ''), ...cats.map((c) => new Option(cat(kind, c), c)));
    sel.value = keep;
  }

  // ---------------------------------------------------------------- render
  function render() {
    renderText();
    if (!data) return;
    $('updated').textContent = t('updated', {
      time: new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.at)),
    });
    $('sumHz').textContent = num(data.sum.hz);
    $('sumIm').textContent = num(data.sum.im);
    $('sumUp').textContent = num(data.sum.up);
    $('sumMonth').textContent = num(data.sum.month);
    renderList();
    renderCharts();
    renderCats();
    renderMap();
  }

  function ranked() {
    const f = $('imCat').value;
    return data.im.map((r, i) => Object.assign({ rank: i + 1 }, r)).filter((r) => !f || r.cat === f);
  }

  function chip(status) {
    const c = el('span', 'chip chip-' + status);
    c.append(el('span', null, status === 'active' ? '✓' : status === 'pending' ? '…' : '×'), el('span', null, t('status_' + status)));
    c.firstChild.setAttribute('aria-hidden', 'true');
    return c;
  }

  const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><path fill="#fff" d="M11 7h2v4h4v2h-4v4h-2v-4H7v-2h4z"/></svg>';

  function renderList() {
    const rows = ranked();
    const list = $('list');
    list.replaceChildren();
    if (!rows.length) list.append(el('li', 'empty', t('noRows')));
    rows.slice(0, shown).forEach((r) => {
      const li = el('li');
      const b = el('button', 'row' + (r.id === picked ? ' on' : ''));
      b.type = 'button';
      b.dataset.id = r.id;
      let thumb;
      if (r.photo) {
        thumb = el('img', 'thumb');
        thumb.src = photoUrl(r.photo);
        thumb.alt = t('photoAlt');
        thumb.loading = 'lazy';
      } else {
        thumb = el('span', 'thumb');
        thumb.innerHTML = PLUS; // fixed icon, no user data
      }
      const what = el('span', 'what');
      what.append(el('b', null, cat('improvement', r.cat)), el('span', null, (r.street || t('noStreet')) + ' · ' + day(r.created)));
      const votes = el('span', 'votes');
      votes.append(el('b', null, num(r.upvotes)), chip(r.status));
      b.append(el('span', 'rank', String(r.rank)), thumb, what, votes);
      b.setAttribute('aria-label', r.rank + '. ' + cat('improvement', r.cat) + ', ' + (r.street || t('noStreet')) + ', ' +
        t('upvotes', { n: r.upvotes }) + ', ' + t('status_' + r.status));
      b.onclick = () => focusRequest(r);
      li.append(b);
      list.append(li);
    });
    const left = rows.length - shown;
    $('more').hidden = left <= 0;
    $('more').textContent = t('showMore', { n: Math.min(left, PAGE) });
  }

  function bars(id, key, colour, icon) {
    const fig = $(id);
    const weeks = data.weeks;
    const max = Math.max(1, ...weeks.map((w) => w[key]));
    const W = 360, H = 190, top = 22, base = 160, gap = 6;
    const bw = (W - gap * (weeks.length + 1)) / weeks.length;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('role', 'img');
    const total = weeks.reduce((a, w) => a + w[key], 0);
    svg.setAttribute('aria-label', t(id) + ': ' + weeks.map((w) => short(w.w) + ' ' + w[key]).join(', '));
    const axis = document.createElementNS(ns, 'line');
    Object.entries({ x1: gap, x2: W - gap, y1: base, y2: base, stroke: '#D9DEE5' }).forEach(([k, v]) => axis.setAttribute(k, v));
    svg.append(axis);
    weeks.forEach((w, i) => {
      const x = gap + i * (bw + gap);
      const h = (w[key] / max) * (base - top);
      const r = document.createElementNS(ns, 'rect');
      Object.entries({ x, y: base - h, width: bw, height: Math.max(h, 0), rx: 3, fill: colour }).forEach(([k, v]) => r.setAttribute(k, v));
      svg.append(r);
      if (w[key] > 0) {
        const v = document.createElementNS(ns, 'text');
        Object.entries({ x: x + bw / 2, y: base - h - 5, 'text-anchor': 'middle', class: 'val' }).forEach(([k, val]) => v.setAttribute(k, val));
        v.textContent = w[key];
        svg.append(v);
      }
      if (i % 3 === 0 || i === weeks.length - 1) {
        const l = document.createElementNS(ns, 'text');
        Object.entries({ x: i === weeks.length - 1 ? x + bw : x + bw / 2, y: base + 20, 'text-anchor': i === weeks.length - 1 ? 'end' : 'middle' }).forEach(([k, val]) => l.setAttribute(k, val));
        l.textContent = short(w.w);
        svg.append(l);
      }
    });
    const cap = el('figcaption');
    const ic = el('span');
    ic.innerHTML = icon; // fixed icon, no user data
    cap.append(ic, el('span', null, t(id) + ' · ' + num(total)));
    fig.replaceChildren(cap, svg);
  }

  const ICON_HZ = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 22 12 12 22 2 12Z" fill="#E69F00" stroke="#1A1A2E" stroke-width="2"/></svg>';
  const ICON_IM = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#CC79A7"/></svg>';
  const ICON_UP = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 12h-5v8H9v-8H4z" fill="#1F6FB2"/></svg>';

  function renderCharts() {
    bars('wHz', 'hz', '#E69F00', ICON_HZ);
    bars('wIm', 'im', '#CC79A7', ICON_IM);
    bars('wUp', 'up', '#56B4E9', ICON_UP);
  }

  function renderCats() {
    [['catsHz', 'hazard'], ['catsIm', 'improvement']].forEach(([id, kind]) => {
      const ul = $(id);
      const rows = data.cats[kind];
      ul.replaceChildren();
      if (!rows.length) { ul.append(el('li', 'empty', t('none'))); return; }
      const max = rows[0].n;
      rows.forEach((r) => {
        const li = el('li');
        const label = el('div', 'bar-label');
        label.append(el('span', null, cat(kind, r.cat)), el('b', null, num(r.n)));
        const track = el('div', 'bar-track');
        const fill = el('div', 'bar-fill');
        fill.style.width = Math.max(2, (100 * r.n) / max) + '%';
        track.append(fill);
        li.append(label, track);
        ul.append(li);
      });
    });
  }

  // ---------------------------------------------------------------- map
  // Orange diamond with an exclamation mark, like the app's hazard pins.
  function diamond() {
    const s = 64, c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    g.beginPath();
    g.moveTo(s / 2, 4); g.lineTo(s - 4, s / 2); g.lineTo(s / 2, s - 4); g.lineTo(4, s / 2); g.closePath();
    g.fillStyle = '#E69F00'; g.fill();
    g.lineWidth = 5; g.strokeStyle = '#1A1A2E'; g.stroke();
    g.fillStyle = '#1A1A2E';
    g.fillRect(s / 2 - 3.5, 18, 7, 18);
    g.fillRect(s / 2 - 3.5, 40, 7, 7);
    return g.getImageData(0, 0, s, s);
  }

  function hzGeo() {
    const f = $('hzCat').value;
    return {
      type: 'FeatureCollection',
      features: (data ? data.hz : []).filter((h) => !f || h[2] === f).map((h) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [h[0], h[1]] },
        properties: { cat: h[2], w: h[3], day: h[4], status: h[5] },
      })),
    };
  }

  function imGeo() {
    return {
      type: 'FeatureCollection',
      features: (data ? ranked() : []).map((r) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
        properties: { id: r.id, rank: r.rank, up: r.upvotes },
      })),
    };
  }

  function initMap() {
    if (!window.maplibregl) return;
    try {
      map = new maplibregl.Map({
        container: 'map', style: STYLE, center: IPOH, zoom: 14.2, minZoom: 11, maxZoom: 19,
        attributionControl: { compact: false },
        cooperativeGestures: true,
      });
    } catch (e) {
      console.error(e);
      return;
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    // The card changes size with the layout, not only with the window.
    new ResizeObserver(() => map.resize()).observe($('map'));
    map.on('load', () => {
      map.addImage('hz-diamond', diamond(), { pixelRatio: 2 });
      map.addSource('hz', { type: 'geojson', data: hzGeo() });
      map.addSource('im', { type: 'geojson', data: imGeo() });
      map.addLayer({
        id: 'hz-heat', type: 'heatmap', source: 'hz', maxzoom: 17.5,
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'w'], 1, 0.5, 5, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 16, 1.6],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 12, 10, 15, 26, 17, 40],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 15.5, 0.85, 17.5, 0],
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(230,159,0,0)', 0.15, 'rgba(253,230,176,0.7)', 0.4, '#F2C14E', 0.65, '#E69F00', 0.85, '#C2410C', 1, '#7C2D12'],
        },
      });
      map.addLayer({
        id: 'hz-pts', type: 'symbol', source: 'hz', minzoom: 15.5,
        layout: {
          'icon-image': 'hz-diamond', 'icon-allow-overlap': true,
          'icon-size': ['interpolate', ['linear'], ['zoom'], 15.5, 0.6, 18, 1],
        },
        paint: { 'icon-opacity': ['case', ['==', ['get', 'status'], 'expired'], 0.55, 1] },
      });
      map.addLayer({
        id: 'im-pts', type: 'circle', source: 'im',
        paint: {
          'circle-color': '#CC79A7',
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2,
          'circle-radius': ['interpolate', ['linear'], ['get', 'up'], 0, 6, 5, 9, 14, 14],
        },
      });
      map.addLayer({
        id: 'im-rank', type: 'symbol', source: 'im', minzoom: 14.5,
        filter: ['<=', ['get', 'rank'], 20],
        layout: { 'text-field': ['to-string', ['get', 'rank']], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true },
        paint: { 'text-color': '#FFFFFF' },
      });
      ['hz-pts', 'im-pts'].forEach((id) => {
        map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
      });
      map.on('click', 'im-pts', (e) => {
        const r = data.im.find((x) => x.id === e.features[0].properties.id);
        if (r) focusRequest(Object.assign({ rank: data.im.indexOf(r) + 1 }, r), false);
      });
      map.on('click', 'hz-pts', (e) => {
        const p = e.features[0].properties;
        const box = el('div', 'pop');
        box.append(el('b', null, cat('hazard', p.cat)), el('p', null, t('reported', { date: day(p.day) })),
          el('p', null, t('status_' + p.status) + ' · ' + t('stillThere', { n: p.w - 1 })));
        openPopup(e.features[0].geometry.coordinates, box);
      });
      mapReady = true;
      layers();
      renderMap();
    });
  }

  function renderMap() {
    if (!mapReady) return;
    map.getSource('hz').setData(hzGeo());
    map.getSource('im').setData(imGeo());
  }

  function layers() {
    if (!mapReady) return;
    const heat = $('layerHeat').checked ? 'visible' : 'none';
    const im = $('layerIm').checked ? 'visible' : 'none';
    map.setLayoutProperty('hz-heat', 'visibility', heat);
    map.setLayoutProperty('hz-pts', 'visibility', heat);
    map.setLayoutProperty('im-pts', 'visibility', im);
    map.setLayoutProperty('im-rank', 'visibility', im);
  }

  function openPopup(lngLat, content) {
    if (popup) popup.remove();
    popup = new maplibregl.Popup({ offset: 14, maxWidth: '300px' }).setLngLat(lngLat).setDOMContent(content).addTo(map);
  }

  // Shows one request on the map and highlights its row.
  function focusRequest(r, scrollMap = true) {
    picked = r.id;
    document.querySelectorAll('.row').forEach((n) => n.classList.toggle('on', n.dataset.id === r.id));
    if (!mapReady) return;
    if (scrollMap) {
      $('map').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      map.flyTo({ center: [r.lon, r.lat], zoom: Math.max(map.getZoom(), 17) });
    }
    const box = el('div', 'pop');
    box.append(el('b', null, r.rank + '. ' + cat('improvement', r.cat)));
    if (r.photo) {
      const img = el('img');
      img.src = photoUrl(r.photo);
      img.alt = t('photoAlt');
      box.append(img);
    }
    box.append(el('p', null, (r.street || t('noStreet')) + ' · ' + t('upvotes', { n: r.upvotes }) + ' · ' + t('status_' + r.status)));
    box.append(el('p', null, t('reported', { date: day(r.created) })));
    if (r.note) box.append(el('p', 'note', r.note));
    openPopup([r.lon, r.lat], box);
  }

  // ---------------------------------------------------------------- export
  // Same columns as the app export (app/src/features/community/exportFiles.ts).
  function cell(v) {
    if (v == null) return '';
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // a spreadsheet must never run a note as a formula
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function download(format) {
    const rows = ranked();
    let body, type;
    if (format === 'csv') {
      const lines = ['rank,id,category,upvotes,status,street,lon,lat,created_at,note'];
      rows.forEach((r) => lines.push([r.rank, r.id, r.cat, r.upvotes, r.status, r.street, r.lon, r.lat, r.created, r.note].map(cell).join(',')));
      body = '﻿' + lines.join('\r\n') + '\r\n'; // BOM so Excel reads UTF-8
      type = 'text/csv';
    } else {
      body = JSON.stringify({
        type: 'FeatureCollection',
        features: rows.map((r) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
          properties: { rank: r.rank, id: r.id, category: r.cat, upvotes: r.upvotes, status: r.status, street: r.street, created_at: r.created, note: r.note },
        })),
      });
      type = 'application/geo+json';
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type }));
    a.download = 'langkah-most-requested-' + new Date().toISOString().slice(0, 10) + '.' + format;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------------------------------------------------------------- wiring
  $('lang').onclick = () => {
    lang = lang === 'ms' ? 'en' : 'ms';
    store.set('langkah.council.lang', lang);
    if (popup) popup.remove();
    render();
  };
  document.querySelectorAll('#period button').forEach((b) => {
    b.onclick = () => {
      if (Number(b.dataset.days) === days) return;
      days = Number(b.dataset.days);
      store.set('langkah.council.days', String(days));
      renderText();
      load();
    };
  });
  $('hzCat').onchange = renderMap;
  $('imCat').onchange = () => { shown = PAGE; renderList(); renderMap(); };
  $('layerHeat').onchange = layers;
  $('layerIm').onchange = layers;
  $('more').onclick = () => { shown += PAGE; renderList(); };
  $('csv').onclick = () => data && download('csv');
  $('geojson').onclick = () => data && download('geojson');

  renderText();
  if (!CFG || !CFG.url || !CFG.anonKey || /your-/.test(CFG.url + CFG.anonKey)) {
    setState('config');
    return;
  }
  initMap();
  load();
})();
