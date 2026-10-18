// Langkah live walk page (guide Section 16.1). A friend opens walk.html?t=TOKEN and
// sees the walker's latest position until they arrive. One call, share_view(token),
// with the public anon key, every 10 s. Everything from the server is set as text.
(function () {
  'use strict';

  const CFG = window.LANGKAH_CONFIG;
  const STYLE = 'https://tiles.openfreemap.org/styles/positron';
  const IPOH = [101.0795, 4.5985];
  const POLL_MS = 10000;
  const STALE_S = 120; // no update for this long: say so
  const WALK_SPEED = 1.3; // m/s, as route_safe

  // English only for the prototype (owner's call, 2026-10-17), as the dashboard.
  const ENGLISH_ONLY = true;
  const STRINGS = {
    en: {
      sub: 'Live walk',
      mapLabel: 'Map of the shared walk',
      walking: '{name} is walking to {to}',
      someone: 'A Langkah walker',
      live: 'Live',
      stale: 'No recent update',
      arrived: 'Arrived',
      ended: 'Walk ended',
      gone: 'Link ended',
      etaMin: 'About {n} min left',
      etaSoon: 'Almost there',
      seenNow: 'Updated just now',
      seenAgo: 'Updated {n} min ago',
      staleHint: 'No update for {n} min. Their phone may have lost signal.',
      waiting: 'Waiting for their first position…',
      arrivedTitle: '{name} arrived at {time}',
      endedTitle: '{name} ended the walk at {time}',
      goneTitle: 'This live walk has ended',
      doneBody: 'Sharing has stopped and their position was deleted.',
      goneBody: 'The link is no longer active. Live walks stop on arrival and after 2 hours.',
      keyYou: 'Walker',
      keyLine: 'Planned route',
      keyEnd: 'Destination',
      follow: 'Follow walker',
      privacy: 'Only the latest position is kept, never the full track. Map data © OpenStreetMap contributors.',
      noConfig: 'This page is not set up yet.',
      offline: 'Cannot reach Langkah. Retrying…',
    },
    ms: {
      sub: 'Perjalanan langsung',
      mapLabel: 'Peta perjalanan yang dikongsi',
      walking: '{name} sedang berjalan ke {to}',
      someone: 'Seorang pengguna Langkah',
      live: 'Langsung',
      stale: 'Tiada kemas kini terbaru',
      arrived: 'Telah tiba',
      ended: 'Perjalanan tamat',
      gone: 'Pautan tamat',
      etaMin: 'Kira-kira {n} min lagi',
      etaSoon: 'Hampir sampai',
      seenNow: 'Dikemas kini sebentar tadi',
      seenAgo: 'Dikemas kini {n} min lalu',
      staleHint: 'Tiada kemas kini selama {n} min. Telefon mereka mungkin hilang isyarat.',
      waiting: 'Menunggu lokasi pertama mereka…',
      arrivedTitle: '{name} tiba pada {time}',
      endedTitle: '{name} menamatkan perjalanan pada {time}',
      goneTitle: 'Perjalanan langsung ini telah tamat',
      doneBody: 'Perkongsian telah berhenti dan lokasi mereka telah dipadam.',
      goneBody: 'Pautan ini tidak lagi aktif. Perjalanan langsung berhenti apabila tiba dan selepas 2 jam.',
      keyYou: 'Pejalan kaki',
      keyLine: 'Laluan dirancang',
      keyEnd: 'Destinasi',
      follow: 'Ikut pejalan kaki',
      privacy: 'Hanya lokasi terkini disimpan, bukan keseluruhan laluan. Data peta © penyumbang OpenStreetMap.',
      noConfig: 'Halaman ini belum disediakan.',
      offline: 'Tidak dapat menghubungi Langkah. Mencuba semula…',
    },
  };
  const nav = (navigator.language || 'en').toLowerCase();
  const lang = !ENGLISH_ONLY && nav.startsWith('ms') ? 'ms' : 'en';
  const S = STRINGS[lang];
  const t = (k, vars) => {
    let s = S[k] || STRINGS.en[k] || k;
    if (vars) for (const v in vars) s = s.replace('{' + v + '}', vars[v]);
    return s;
  };
  const $ = (id) => document.getElementById(id);
  const time = (iso) => new Intl.DateTimeFormat(lang === 'ms' ? 'ms-MY' : 'en-MY', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

  const token = new URLSearchParams(location.search).get('t') || '';
  let map = null;
  let ready = false;
  let follow = true;
  let fitted = false;
  let lastRoute = null;
  let last = null;
  let timer = null;

  // Google encoded polyline, 5 decimals, to [lng, lat] pairs.
  function decode(str) {
    const pts = [];
    let i = 0, lat = 0, lng = 0;
    function next() {
      let r = 0, s = 0, b;
      do {
        if (i >= str.length) return null;
        b = str.charCodeAt(i++) - 63;
        r |= (b & 31) << s;
        s += 5;
      } while (b >= 32);
      return r & 1 ? ~(r >> 1) : r >> 1;
    }
    while (i < str.length) {
      const a = next(), o = next();
      if (a === null || o === null) break;
      lat += a; lng += o;
      pts.push([lng / 1e5, lat / 1e5]);
    }
    return pts;
  }

  function metres(a, b) {
    const k = Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
    return Math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 111320;
  }

  // Metres left along the planned line from the point on it closest to the walker.
  function leftAlong(line, p) {
    if (line.length < 2) return null;
    let best = Infinity, bestI = 0;
    for (let i = 0; i < line.length; i++) {
      const d = metres(line[i], p);
      if (d < best) { best = d; bestI = i; }
    }
    let m = 0;
    for (let i = bestI; i < line.length - 1; i++) m += metres(line[i], line[i + 1]);
    return m;
  }

  function setTag(kind, text) {
    const tag = $('tag');
    tag.hidden = false;
    tag.className = 'tag ' + kind;
    tag.replaceChildren();
    // Each state has its own mark and word, never colour alone.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('d', {
      live: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z',
      done: 'M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6 11-11-1.4-1.4Z',
      stale: 'M11 6h2v8h-2zm0 10h2v2h-2z',
      gone: 'M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6Z',
    }[kind]);
    svg.append(path);
    tag.append(svg, document.createTextNode(text));
  }

  function show(id, text) {
    const n = $(id);
    n.hidden = text == null;
    if (text != null) n.textContent = text;
  }

  // ------------------------------------------------------------- map
  function initMap() {
    map = new maplibregl.Map({
      container: 'map',
      style: STYLE,
      center: IPOH,
      zoom: 14,
      attributionControl: { compact: false },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('dragstart', () => {
      follow = false;
      $('follow').hidden = !(last && last.state === 'live' && last.pos);
    });
    // A page that opens small, or whose box gets its size late, keeps a 400 x 300 map
    // unless it is told to measure again (test note N3).
    window.addEventListener('resize', () => map.resize());
    if (window.ResizeObserver) new ResizeObserver(() => map.resize()).observe(document.getElementById('map'));
    map.on('load', () => {
      map.resize();
      map.addSource('route', { type: 'geojson', data: line([]) });
      map.addSource('dest', { type: 'geojson', data: point(null) });
      map.addSource('you', { type: 'geojson', data: point(null) });
      // Planned route: solid teal with a white outline, as Safest in the app.
      map.addLayer({ id: 'route-casing', type: 'line', source: 'route', paint: { 'line-color': '#FFFFFF', 'line-width': 9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#009E73', 'line-width': 5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      map.addLayer({ id: 'dest', type: 'circle', source: 'dest', paint: { 'circle-radius': 8, 'circle-color': '#0F2A47', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 } });
      map.addLayer({ id: 'you-halo', type: 'circle', source: 'you', paint: { 'circle-radius': 18, 'circle-color': 'rgba(86, 180, 233, 0.3)' } });
      map.addLayer({ id: 'you', type: 'circle', source: 'you', paint: { 'circle-radius': 8, 'circle-color': '#1F6FB2', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 } });
      ready = true;
      if (last) draw(last);
    });
  }

  const line = (pts) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } });
  const point = (p) => ({ type: 'FeatureCollection', features: p ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }] : [] });

  function draw(d) {
    if (!ready) return;
    const live = d.state === 'live';
    if (d.route !== lastRoute) {
      lastRoute = d.route || null;
      map.getSource('route').setData(line(lastRoute ? decode(lastRoute) : []));
    }
    if (!live) lastRoute = null;
    if (!live) map.getSource('route').setData(line([]));
    map.getSource('dest').setData(point(live ? d.dest : null));
    map.getSource('you').setData(point(live ? d.pos : null));
    if (!live) return;

    if (!fitted) {
      fitted = true;
      const pts = (d.route ? decode(d.route) : []).concat([d.dest], d.pos ? [d.pos] : []);
      const b = new maplibregl.LngLatBounds(pts[0], pts[0]);
      pts.forEach((p) => b.extend(p));
      map.fitBounds(b, { padding: { top: 200, bottom: 60, left: 40, right: 40 }, maxZoom: 17, duration: 0 });
    } else if (follow && d.pos) {
      map.easeTo({ center: d.pos, duration: 800 });
    }
  }

  // ------------------------------------------------------------- state
  function render(d) {
    last = d;
    const name = d.name || t('someone');
    if (d.state === 'live') {
      const ageS = Math.max(0, (Date.now() - new Date(d.updated).getTime()) / 1000);
      const stale = ageS > STALE_S;
      setTag(stale ? 'stale' : 'live', stale ? t('stale') : t('live'));
      show('title', t('walking', { name, to: d.to }));
      // The server's time left, or the rest of the planned line at walking speed.
      let left = typeof d.eta === 'number' ? d.eta : null;
      if (left === null && d.pos && d.route) {
        const m = leftAlong(decode(d.route), d.pos);
        if (m !== null) left = m / WALK_SPEED;
      }
      show('eta', left === null ? null : left < 60 ? t('etaSoon') : t('etaMin', { n: Math.round(left / 60) }));
      const mins = Math.floor(ageS / 60);
      show('seen', !d.pos ? t('waiting') : stale ? t('staleHint', { n: mins }) : mins < 1 ? t('seenNow') : t('seenAgo', { n: mins }));
      $('legend').hidden = false;
      $('follow').hidden = follow || !d.pos;
    } else {
      $('legend').hidden = true;
      $('follow').hidden = true;
      show('eta', null);
      if (d.state === 'arrived' || d.state === 'ended') {
        setTag(d.state === 'arrived' ? 'done' : 'gone', d.state === 'arrived' ? t('arrived') : t('ended'));
        show('title', t(d.state === 'arrived' ? 'arrivedTitle' : 'endedTitle', { name, time: time(d.at) }));
        show('seen', t('doneBody'));
      } else {
        setTag('gone', t('gone'));
        show('title', t('goneTitle'));
        show('seen', t('goneBody'));
      }
    }
    draw(d);
  }

  async function poll() {
    try {
      const res = await fetch(CFG.url.replace(/\/$/, '') + '/rest/v1/rpc/share_view', {
        method: 'POST',
        headers: { apikey: CFG.anonKey, Authorization: 'Bearer ' + CFG.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_token: token }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      render(d && typeof d === 'object' ? d : { state: 'gone' });
      if (d.state !== 'live') return; // nothing more will change
    } catch (e) {
      console.error(e);
      if (!last) show('seen', t('offline'));
    }
    timer = setTimeout(poll, POLL_MS);
  }

  // ------------------------------------------------------------- start
  document.documentElement.lang = lang;
  document.title = 'Langkah · ' + t('sub');
  document.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); });
  $('map').setAttribute('aria-label', t('mapLabel'));
  $('follow').textContent = t('follow');
  $('follow').onclick = () => {
    follow = true;
    $('follow').hidden = true;
    if (last && last.pos) map.easeTo({ center: last.pos, zoom: Math.max(map.getZoom(), 16), duration: 600 });
  };

  if (!CFG || !CFG.url || !CFG.anonKey) {
    show('title', t('noConfig'));
    return;
  }
  initMap();
  if (!/^[0-9a-f]{32}$/.test(token)) {
    render({ state: 'gone' });
    return;
  }
  poll();
  // Back in view: refresh at once rather than waiting for the next poll.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && last && last.state === 'live') {
      clearTimeout(timer);
      poll();
    }
  });
})();
