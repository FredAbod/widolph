// Widoph back office.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = (id, size = 18) => `<svg class="ic" width="${size}" height="${size}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

const STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];
const TOKEN_KEY = 'widoph-admin-token';
let token = null;
try { token = sessionStorage.getItem(TOKEN_KEY); } catch { /* storage blocked */ }

const state = { quotes: [], stats: null, filter: '', q: '', seen: new Set(), shipments: [], stages: [], schedule: [], tab: 'quotes' };

function toast(msg, bad = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('bad', bad);
  el.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('on'), 2800);
}

async function api(path, { method = 'GET', body, raw = false } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401 && path !== '/api/login') {
    signOut();
    throw new Error('Please sign in again.');
  }
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const ago = (iso) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
};
const when = (iso) => new Date(iso).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const statusTag = (s) => `<span class="st" style="--c:var(--s-${s})">${esc(s)}</span>`;

// Turn local numbers into WhatsApp's international format (AU 04… / NG 080…).
function waNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (/^04\d{8}$/.test(d)) d = '61' + d.slice(1);
  else if (/^0[789]\d{9}$/.test(d)) d = '234' + d.slice(1);
  return d;
}

/* ---------- auth ---------- */
function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login-hint').hidden = !/^(localhost|127\.|192\.168\.)/.test(location.hostname);
  setTimeout(() => $('#pw').focus(), 50);
}

function signOut() {
  token = null;
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  clearInterval(state.poll);
  closeDrawer();
  showLogin();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#login-btn');
  btn.disabled = true;
  $('#login-err').textContent = '';
  try {
    const res = await api('/api/login', { method: 'POST', body: { password: $('#pw').value } });
    token = res.token;
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
    $('#pw').value = '';
    start();
  } catch (err) {
    $('#login-err').textContent = err.message;
    $('#login-form').classList.remove('shake');
    void $('#login-form').offsetWidth;
    $('#login-form').classList.add('shake');
  } finally {
    btn.disabled = false;
  }
});
$('#logout').addEventListener('click', signOut);

/* ---------- tabs ---------- */
function setTab(tab) {
  state.tab = tab;
  $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab));
  if (tab === 'shipments') loadShipments();
  if (tab === 'schedule') loadSchedule();
  history.replaceState(null, '', '#' + tab);
}
$$('[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

/* ---------- quotes ---------- */
async function loadQuotes({ quiet = false } = {}) {
  if (!quiet && !state.quotes.length) $('#quote-list').innerHTML = '<div class="skel"></div>'.repeat(4);
  const params = new URLSearchParams();
  if (state.filter) params.set('status', state.filter);
  if (state.q) params.set('q', state.q);
  try {
    const { quotes, stats } = await api('/api/quotes?' + params);
    const fresh = state.seen.size ? quotes.filter((q) => !state.seen.has(q.ref)).map((q) => q.ref) : [];
    quotes.forEach((q) => state.seen.add(q.ref));
    state.quotes = quotes;
    state.stats = stats;
    renderStats();
    renderQuotes(fresh);
    if (fresh.length && quiet) toast(`${fresh.length} new quote request${fresh.length > 1 ? 's' : ''}`);
  } catch (err) {
    if (!quiet) toast(err.message, true);
  }
}

function renderStats() {
  const s = state.stats || { total: 0, byStatus: {} };
  const cards = [['', 'All requests', s.total, 'dark'], ...STATUSES.map((k) => [k, k, s.byStatus[k] || 0, ''])];
  $('#stats').innerHTML = cards
    .map(([k, label, n, cls]) => `<button class="stat ${cls}" data-filter="${k}" style="--c:${k ? `var(--s-${k})` : 'var(--accent)'}"><small>${esc(label)}</small><strong data-count="${n}">0</strong></button>`)
    .join('');
  $$('#stats [data-count]').forEach((el) => countUp(el, +el.dataset.count));
  const pill = $('#new-pill');
  const n = s.byStatus.new || 0;
  pill.hidden = !n;
  pill.textContent = n;
  $('#status-chips').innerHTML = ['', ...STATUSES]
    .map((k) => `<button class="chip" aria-pressed="${state.filter === k}" data-filter="${k}">${k || 'All'}</button>`)
    .join('');
}

function countUp(el, to) {
  const from = +el.dataset.prev || 0;
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / 700);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderQuotes(fresh = []) {
  const list = $('#quote-list');
  if (!state.quotes.length) {
    list.innerHTML = `<div class="empty">${icon('inbox', 40)}<strong>${state.filter || state.q ? 'No matching requests' : 'No quote requests yet'}</strong><span>${state.filter || state.q ? 'Try a different filter or search.' : 'New requests from the website quote form will appear here automatically.'}</span></div>`;
    return;
  }
  list.innerHTML =
    '<div class="list-head"><span>Ref</span><span>Customer</span><span>Route</span><span>Cargo</span><span>Status</span><span>Received</span></div>' +
    state.quotes
      .map((q) => `<button class="row${fresh.includes(q.ref) ? ' fresh' : ''}" data-ref="${esc(q.ref)}">
        <span class="ref">${esc(q.ref)}</span>
        <span class="who"><b>${esc(q.name)}</b><span>${esc(q.phone)}</span></span>
        <span class="route">${esc(q.origin)} → ${esc(q.destination)}<span style="display:block;font-weight:500;font-size:13px;color:var(--muted)">${esc(q.method)}</span></span>
        <span class="meta"><span>${esc(q.goods)}${q.weight != null ? ` · ${q.weight} kg` : ''}${q.packages != null ? ` · ${q.packages} pkg` : ''}</span></span>
        <span class="st-cell">${statusTag(q.status)}</span>
        <span class="when">${ago(q.createdAt)}</span>
      </button>`)
      .join('');
}

document.addEventListener('click', (e) => {
  const f = e.target.closest('[data-filter]');
  if (f) {
    state.filter = f.dataset.filter;
    loadQuotes();
  }
  const row = e.target.closest('.row[data-ref]');
  if (row) openQuote(row.dataset.ref);
});

let searchT;
$('#q-search').addEventListener('input', (e) => {
  clearTimeout(searchT);
  searchT = setTimeout(() => {
    state.q = e.target.value.trim();
    loadQuotes();
  }, 250);
});
$('#q-refresh').addEventListener('click', () => loadQuotes());
$('#q-export').addEventListener('click', async () => {
  try {
    const res = await api('/api/quotes?format=csv', { raw: true });
    if (!res.ok) throw new Error('Export failed');
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: `widoph-quotes-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    toast(err.message, true);
  }
});

/* ---------- drawer ---------- */
function openDrawer(html) {
  const d = $('#drawer');
  d.innerHTML = html;
  d.hidden = false;
  $('#scrim').hidden = false;
  $('.dclose', d)?.focus();
}
function closeDrawer() {
  $('#drawer').hidden = true;
  $('#scrim').hidden = true;
}
$('#scrim').addEventListener('click', closeDrawer);
addEventListener('keydown', (e) => e.key === 'Escape' && closeDrawer());

function openQuote(ref) {
  const q = state.quotes.find((x) => x.ref === ref);
  if (!q) return;
  const size = q.sizeMode === 'cbm'
    ? (q.cbm != null ? `${q.cbm} CBM` : '—')
    : [q.length, q.width, q.height].some((v) => v != null) ? `${q.length ?? '?'} × ${q.width ?? '?'} × ${q.height ?? '?'} cm` : '—';
  const first = q.name.split(/\s+/)[0];
  const waText = encodeURIComponent(`Hi ${first}, this is Widoph Logistics about your quote request ${q.ref} (${q.origin} → ${q.destination}, ${q.method}).`);
  const mailSubject = encodeURIComponent(`Your Widoph quote – ${q.ref}`);
  const mailBody = encodeURIComponent(`Hi ${first},\n\nThanks for your quote request (${q.ref}) for ${q.goods.toLowerCase()} from ${q.origin} to ${q.destination} by ${q.method.toLowerCase()}.\n\n\n\nKind regards,\nWidoph Logistics\n02 8001 6352`);
  const field = (label, value, wide) => `<div${wide ? ' class="wide"' : ''}><small>${esc(label)}</small><b>${esc(value ?? '—')}</b></div>`;

  openDrawer(`
    <div class="dhead">
      <div><small>${esc(q.ref)} · ${esc(when(q.createdAt))}</small><h2 id="d-title">${esc(q.name)}</h2>${statusTag(q.status)}</div>
      <button class="dclose" aria-label="Close">${icon('x', 20)}</button>
    </div>
    <div class="dbody">
      <div class="contact-btns">
        <a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="https://wa.me/${waNumber(q.phone)}?text=${waText}">${icon('chat')}WhatsApp</a>
        <a class="btn btn-navy btn-sm" href="mailto:${esc(q.email)}?subject=${mailSubject}&body=${mailBody}">${icon('mail')}Email</a>
        <a class="btn btn-line btn-sm" href="tel:${esc(q.phone.replace(/[^\d+]/g, ''))}">${icon('phone')}Call</a>
      </div>
      <div class="dsec"><h3>Status</h3>
        <div class="statusbar">${STATUSES.map((s) => `<button data-s="${s}" style="--c:var(--s-${s})" aria-pressed="${q.status === s}">${s}</button>`).join('')}</div>
      </div>
      <div class="dsec"><h3>Shipment</h3>
        <div class="dl">
          ${field('Route', `${q.origin} → ${q.destination}`)}${field('Method', q.method)}
          ${field('Goods', q.goods)}${field('Weight', q.weight != null ? `${q.weight} kg` : '—')}
          ${field('Packages', q.packages)}${field('Size', size)}
          ${field('Door-to-door', q.door)}${field('Customs clearance', q.customs)}
          ${q.sailing ? field('Sailing', q.sailing, true) : ''}
          ${q.message ? field('Message', q.message, true) : ''}
        </div>
      </div>
      <div class="dsec"><h3>Contact</h3>
        <div class="dl">${field('Email', q.email)}${field('Phone / WhatsApp', q.phone)}</div>
      </div>
      <div class="dsec"><h3>Internal notes</h3>
        <textarea class="inp" id="d-notes" placeholder="Visible to staff only – e.g. quoted rate, follow-up date">${esc(q.adminNotes || '')}</textarea>
        <div style="margin-top:8px;display:flex;justify-content:flex-end"><button class="btn btn-line btn-sm" id="d-save">${icon('check')}Save notes</button></div>
      </div>
      <div class="dsec"><h3>Tracking</h3>
        ${q.shipmentCode
          ? `<div class="linked"><span>${esc(q.shipmentCode)}</span><button class="btn btn-line btn-sm" data-goto-ship>Manage shipment</button></div>`
          : `<button class="btn btn-accent" id="d-ship" style="width:100%">${icon('plus')}Create shipment &amp; tracking number</button>`}
      </div>
    </div>`);

  const d = $('#drawer');
  $('.dclose', d).addEventListener('click', closeDrawer);
  $$('.statusbar button', d).forEach((b) => b.addEventListener('click', () => patchQuote(q.ref, { status: b.dataset.s })));
  $('#d-save', d).addEventListener('click', () => patchQuote(q.ref, { adminNotes: $('#d-notes').value }, 'Notes saved'));
  $('#d-ship', d)?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const { shipment } = await api('/api/shipments', { method: 'POST', body: { quoteRef: q.ref } });
      toast(`Shipment ${shipment.code} created`);
      closeDrawer();
      await loadQuotes({ quiet: true });
      state.freshShip = shipment.code;
      setTab('shipments');
    } catch (err) {
      toast(err.message, true);
      e.target.disabled = false;
    }
  });
  $('[data-goto-ship]', d)?.addEventListener('click', () => { closeDrawer(); setTab('shipments'); });
}

async function patchQuote(ref, body, msg = 'Status updated') {
  try {
    const { quote } = await api(`/api/quotes?ref=${encodeURIComponent(ref)}`, { method: 'PATCH', body });
    const i = state.quotes.findIndex((x) => x.ref === ref);
    if (i !== -1) state.quotes[i] = quote;
    toast(msg);
    await loadQuotes({ quiet: true });
    if (!$('#drawer').hidden) openQuote(ref);
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------- shipments ---------- */
async function loadShipments() {
  if (!state.shipments.length) $('#ship-list').innerHTML = '<div class="list">' + '<div class="skel"></div>'.repeat(3) + '</div>';
  try {
    const { shipments, stages } = await api('/api/shipments');
    state.shipments = shipments;
    state.stages = stages;
    renderShipments();
  } catch (err) {
    toast(err.message, true);
  }
}

function renderShipments() {
  const list = $('#ship-list');
  if (!state.shipments.length) {
    list.innerHTML = `<div class="list"><div class="empty">${icon('container', 40)}<strong>No shipments yet</strong><span>Create one, or convert a quote request into a shipment.</span></div></div>`;
    return;
  }
  list.innerHTML = state.shipments
    .map((s) => {
      const cur = s.events.find((e) => e.key === state.stages[s.stage]?.key) || {};
      return `<article class="ship${state.freshShip === s.code ? ' fresh' : ''}" data-code="${esc(s.code)}">
        <div class="ship-top">
          <div>
            <div class="code">${esc(s.code)}${s.demo ? '<span class="demo-badge">Demo</span>' : ''}</div>
            <div class="sub">${esc(s.customerName)} · ${esc(s.origin)} → ${esc(s.destination)} · ${esc(s.method)}${s.quoteRef ? ` · from ${esc(s.quoteRef)}` : ''}</div>
          </div>
          <div class="ship-tools">
            <button class="btn btn-line btn-sm" data-copy>${icon('copy')}Copy link</button>
            <a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="/?track=${encodeURIComponent(s.code)}#track">${icon('ext')}View</a>
            ${s.demo ? '' : `<button class="btn btn-danger btn-sm" data-del aria-label="Delete shipment">${icon('trash')}</button>`}
          </div>
        </div>
        <div class="stepper">${state.stages
          .map((st, i) => {
            const cls = i < s.stage || (i === s.stage && st.key === 'delivered') ? 'done' : i === s.stage ? 'cur' : '';
            return `<button class="${cls}" data-stage="${i}" title="Set stage: ${esc(st.title)}"><i>${cls === 'done' ? '✓' : i + 1}</i>${esc(st.title)}</button>`;
          })
          .join('')}</div>
        <div class="ship-edit">
          <div><label class="lab">Current location</label><input class="inp" data-loc value="${esc(cur.location || '')}"></div>
          <div><label class="lab">Customer-facing note</label><input class="inp" data-note value="${esc(cur.note || '')}" placeholder="e.g. Vessel delayed at port – new ETA to follow"></div>
          <button class="btn btn-navy btn-sm" data-update>Update</button>
        </div>
      </article>`;
    })
    .join('');
  state.freshShip = null;
}

async function patchShipment(code, body) {
  try {
    const { shipment } = await api(`/api/shipments?code=${encodeURIComponent(code)}`, { method: 'PATCH', body });
    const i = state.shipments.findIndex((x) => x.code === code);
    state.shipments[i] = shipment;
    renderShipments();
    toast(`${code}: ${shipment.view.status}`);
  } catch (err) {
    toast(err.message, true);
  }
}

$('#ship-list').addEventListener('click', async (e) => {
  const card = e.target.closest('.ship');
  if (!card) return;
  const code = card.dataset.code;
  const stage = e.target.closest('[data-stage]');
  if (stage) return patchShipment(code, { stage: +stage.dataset.stage });
  if (e.target.closest('[data-update]')) return patchShipment(code, { location: $('[data-loc]', card).value, note: $('[data-note]', card).value });
  if (e.target.closest('[data-copy]')) {
    const url = `${location.origin}/?track=${encodeURIComponent(code)}#track`;
    try { await navigator.clipboard.writeText(url); toast('Tracking link copied'); } catch { toast(url); }
  }
  if (e.target.closest('[data-del]') && confirm(`Delete shipment ${code}? Customers will no longer be able to track it.`)) {
    try {
      await api(`/api/shipments?code=${encodeURIComponent(code)}`, { method: 'DELETE' });
      state.shipments = state.shipments.filter((s) => s.code !== code);
      renderShipments();
      toast('Shipment deleted');
    } catch (err) {
      toast(err.message, true);
    }
  }
});

$('#s-new').addEventListener('click', () => {
  $('#newship').hidden = false;
  $('#ns-name').focus();
});
$('#ns-cancel').addEventListener('click', () => ($('#newship').hidden = true));
$('#newship').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { shipment } = await api('/api/shipments', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
    e.target.reset();
    e.target.hidden = true;
    state.freshShip = shipment.code;
    await loadShipments();
    toast(`Tracking number ${shipment.code} created`);
  } catch (err) {
    toast(err.message, true);
  }
});

/* ---------- schedule ---------- */
async function loadSchedule() {
  try {
    const { rows } = await api('/api/schedule');
    state.schedule = rows;
    renderSchedule();
  } catch (err) {
    toast(err.message, true);
  }
}

function renderSchedule() {
  const row = (r, i) => `<div class="sc-row" data-i="${i}">
      <span class="n">#${i + 1}</span>
      <label><span class="sr">Departure</span><input class="inp" type="date" data-k="departure" value="${esc(r.departure || '')}"></label>
      <label><span class="sr">Cut-off</span><input class="inp" type="date" data-k="cutoff" value="${esc(r.cutoff || '')}"></label>
      <label><span class="sr">ETA Lagos</span><input class="inp" type="date" data-k="eta" value="${esc(r.eta || '')}"></label>
      <button class="sc-del" data-del-row aria-label="Remove sailing ${i + 1}">${icon('trash')}</button>
    </div>`;
  $('#sched').innerHTML =
    '<div class="sc-row"><span>#</span><span>Departure</span><span>Cut-off</span><span>ETA Lagos</span><span></span></div>' +
    (state.schedule.length ? state.schedule.map(row).join('') : `<div class="empty"><strong>No sailings</strong><span>Add a sailing to show it on the homepage.</span></div>`);
}

function readSchedule() {
  return $$('#sched .sc-row[data-i]').map((r) => Object.fromEntries($$('[data-k]', r).map((i) => [i.dataset.k, i.value || null])));
}

$('#sched').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del-row]');
  if (!del) return;
  state.schedule = readSchedule();
  state.schedule.splice(+del.closest('[data-i]').dataset.i, 1);
  renderSchedule();
});
$('#sc-add').addEventListener('click', () => {
  state.schedule = [...readSchedule(), { departure: null, cutoff: null, eta: null }];
  renderSchedule();
});
$('#sc-save').addEventListener('click', async () => {
  const rows = readSchedule();
  const bad = rows.find((r) => r.cutoff && r.departure && r.cutoff > r.departure);
  if (bad) return toast('A cut-off date is after its departure date.', true);
  try {
    const res = await api('/api/schedule', { method: 'PUT', body: { rows } });
    state.schedule = res.rows;
    renderSchedule();
    toast('Schedule saved – live on the homepage');
  } catch (err) {
    toast(err.message, true);
  }
});

/* ---------- boot ---------- */
async function start() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  api('/api/health')
    .then((h) => {
      const tag = $('#dbtag');
      tag.textContent = h.db === 'mongodb' ? 'MongoDB' : 'Memory';
      tag.classList.toggle('mem', h.db !== 'mongodb');
      tag.title = h.db === 'mongodb' ? 'Connected to MongoDB' : 'MONGODB_URI not set – data resets on restart';
    })
    .catch(() => {});
  await loadQuotes();
  const tab = location.hash.slice(1);
  setTab(['quotes', 'shipments', 'schedule'].includes(tab) ? tab : 'quotes');
  clearInterval(state.poll);
  state.poll = setInterval(() => !document.hidden && state.tab === 'quotes' && loadQuotes({ quiet: true }), 20000);
}

if (token) {
  api('/api/login').then(start).catch(showLogin);
} else {
  showLogin();
}
