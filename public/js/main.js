// Widoph Logistics – homepage behaviour.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const WA = '61488860700';
const DEMO_CODE = 'WDP-DEMO-1024';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = (id, size = 18) => `<svg class="ic" width="${size}" height="${size}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, details: data.details });
  return data;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('on'), 2600);
}

// Schedule dates are stored as YYYY-MM-DD; parse them as local dates.
const fmtDate = (day) => new Date(day + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDateTime = (iso) => new Date(iso).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' });

/* ---------- header & nav ---------- */
function initHeader() {
  const header = $('#header');
  const fabs = $('.fabs');
  const onScroll = () => {
    header.classList.toggle('scrolled', scrollY > 10);
    // Contact buttons appear once the visitor starts scrolling past the hero.
    fabs.classList.toggle('show', scrollY > innerHeight * 0.35);
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const burger = $('#burger');
  const mnav = $('#mnav');
  const setMenu = (open) => {
    mnav.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    burger.innerHTML = icon(open ? 'x' : 'menu', 24);
  };
  burger.addEventListener('click', () => setMenu(!mnav.classList.contains('open')));
  $$('a', mnav).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  addEventListener('keydown', (e) => e.key === 'Escape' && setMenu(false));

  // Highlight the section in view.
  const links = new Map($$('.desk a').map((a) => [a.getAttribute('href').slice(1), a]));
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach((a) => a.classList.remove('active'));
      links.get(e.target.id)?.classList.add('active');
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
}

/* ---------- reveal & micro-interactions ---------- */
function initReveal() {
  const els = $$('[data-reveal]');
  if (reducedMotion || !('IntersectionObserver' in window)) return els.forEach((el) => el.classList.add('in'));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  els.forEach((el) => io.observe(el));
}

function initTilt() {
  if (reducedMotion || !matchMedia('(hover: hover)').matches) return;
  for (const card of $$('[data-tilt]')) {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', `${x * 100}%`);
      card.style.setProperty('--my', `${y * 100}%`);
      card.style.setProperty('--rx', `${(0.5 - y) * 5}deg`);
      card.style.setProperty('--ry', `${(x - 0.5) * 6}deg`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  }
}

function initFaq() {
  for (const d of $$('.faq details')) {
    const wrap = $('.ans-wrap', d);
    $('summary', d).addEventListener('click', (e) => {
      if (reducedMotion) return;
      e.preventDefault();
      if (d.open) {
        const h = wrap.scrollHeight;
        wrap.animate([{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)' }).onfinish = () => (d.open = false);
      } else {
        d.open = true;
        const h = wrap.scrollHeight;
        wrap.animate([{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.22,1,.36,1)' });
      }
    });
  }
}

function initTicker() {
  const items = [
    ['plane', 'Sydney → Lagos'], ['ship', 'Melbourne → Lagos'], ['plane', 'Brisbane → Abuja'], ['ship', 'Perth → Lagos'],
    ['truck', 'Door-to-door in Nigeria'], ['plane', 'Sydney → Port Harcourt'], ['doc', 'Customs clearance'], ['ship', 'Sydney → Onitsha'],
    ['warehouse', 'Warehousing & distribution'], ['clipboard', 'Procurement & supply']
  ];
  const html = items.map(([i, t]) => `<span>${icon(i)}${esc(t)}</span>`).join('');
  $('#ticker').innerHTML = html + html.replace(/<span>/g, '<span aria-hidden="true">');
}

/* ---------- quote form ---------- */
function initQuote() {
  const form = $('#qform');
  const success = $('#q-success');
  const submitBtn = $('#q-submit');
  const formErr = $('#form-err');
  const submitLabel = submitBtn.innerHTML;

  // Size mode toggle.
  const setSize = (mode) => {
    $('#q-sizemode').value = mode;
    $$('[data-size]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.size === mode)));
    $('#size-dims').hidden = mode !== 'dims';
    $('#size-cbm').hidden = mode !== 'cbm';
    updateCalc();
  };
  $$('[data-size]').forEach((b) => b.addEventListener('click', () => setSize(b.dataset.size)));

  // Volume helper – a measurement aid only, never a price.
  function updateCalc() {
    const n = (id) => parseFloat($(id).value);
    const pk = Math.max(1, parseInt($('#q-pkgs').value, 10) || 1);
    let text = '';
    if ($('#q-sizemode').value === 'dims') {
      const [l, w, h] = ['#q-l', '#q-w', '#q-h'].map(n);
      if (l > 0 && w > 0 && h > 0) {
        const cbm = (l * w * h) / 1e6;
        text = `≈ ${cbm.toFixed(3)} m³ per package${pk > 1 ? ` · ${(cbm * pk).toFixed(3)} m³ for ${pk} packages` : ''}`;
      }
    }
    $('#calc').textContent = text;
  }

  // Progress meter + side steps.
  const required = ['origin', 'destination', 'method', 'goods', 'door', 'customs', 'name', 'email', 'phone'];
  function progress() {
    const fd = new FormData(form);
    const has = (k) => String(fd.get(k) || '').trim() !== '';
    const done = required.filter(has).length;
    const pct = Math.round((done / required.length) * 100);
    $('#meter-bar').style.setProperty('--p', pct + '%');
    $('#meter-pct').textContent = pct + '%';
    const steps = {
      route: ['origin', 'destination', 'method'].every(has),
      cargo: has('goods') && has('door') && has('customs'),
      send: ['name', 'email', 'phone'].every(has)
    };
    $$('#qsteps li').forEach((li) => li.classList.toggle('done', steps[li.dataset.step]));
  }

  form.addEventListener('input', (e) => {
    const field = e.target.closest('[data-field]');
    if (field?.classList.contains('bad')) field.classList.remove('bad');
    updateCalc();
    progress();
  });
  form.addEventListener('change', progress);

  // Sailing chip.
  $('#sailing-clear').addEventListener('click', () => setSailing(''));
  function setSailing(label) {
    $('#q-sailing').value = label;
    $('#sailing-label').textContent = label;
    $('#sailing-chip').classList.toggle('on', !!label);
  }

  // Deep links from service cards / schedule rows.
  const pickMethod = (m) => {
    const r = form.querySelector(`input[name="method"][value="${m}"]`);
    if (r) { r.checked = true; progress(); }
  };
  const pickCustoms = () => { const r = form.querySelector('input[name="customs"][value="Yes"]'); if (r) { r.checked = true; progress(); } };
  const showForm = () => { form.hidden = false; success.hidden = true; };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-method],[data-customs],[data-note],[data-sailing]');
    if (!el) return;
    showForm();
    if (el.dataset.method) pickMethod(el.dataset.method);
    if (el.hasAttribute('data-customs')) pickCustoms();
    if (el.dataset.note && !$('#q-msg').value) $('#q-msg').value = el.dataset.note;
    if (el.hasAttribute('data-sailing')) {
      e.preventDefault();
      pickMethod('Sea freight LCL');
      setSailing(el.dataset.sailing || 'Next available Sydney LCL sailing');
      const o = $('#q-origin');
      if (!o.value) o.value = 'Sydney';
      const d = $('#q-dest');
      if (!d.value) d.value = 'Lagos';
      progress();
      $('#quote').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  });

  function showErrors(details = {}) {
    let first = null;
    for (const [key, msg] of Object.entries(details)) {
      const wrap = form.querySelector(`[data-field="${['length', 'width', 'height', 'cbm'].includes(key) ? 'size' : key}"]`);
      if (!wrap) continue;
      wrap.classList.add('bad');
      const err = $('.err', wrap);
      if (err) err.textContent = msg;
      first ??= wrap;
    }
    first?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    first?.querySelector('input,select,textarea')?.focus({ preventScroll: true });
  }

  function clientValidate(data) {
    const e = {};
    const msg = { origin: 'Please choose an origin city.', destination: 'Please choose a destination.', method: 'Please choose a shipping method.', goods: 'Please choose a goods type.', door: 'Please choose Yes or No.', customs: 'Please choose Yes or No.', name: 'Please enter your name.', email: 'Please enter a valid email address.', phone: 'Please enter a valid phone or WhatsApp number.' };
    for (const k of required) if (!String(data[k] || '').trim()) e[k] = msg[k];
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) e.email = msg.email;
    if (data.phone && !/^[+()\d\s.-]{6,24}$/.test(data.phone)) e.phone = msg.phone;
    return e;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formErr.classList.remove('on');
    $$('.bad', form).forEach((x) => x.classList.remove('bad'));
    const data = Object.fromEntries(new FormData(form));
    const errors = clientValidate(data);
    if (Object.keys(errors).length) return showErrors(errors);

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spin" aria-hidden="true"></span> Sending your request…';
    try {
      const res = await api('/api/quotes', { method: 'POST', body: JSON.stringify(data) });
      $('#q-ref').textContent = res.ref;
      $('#q-wa').href = `https://wa.me/${WA}?text=${encodeURIComponent(`Hi Widoph, I just sent a quote request (${res.ref}) for ${data.origin} → ${data.destination}.`)}`;
      form.hidden = true;
      success.hidden = false;
      $('#quote').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
      burst($('.okdot', success));
    } catch (err) {
      if (err.details) showErrors(err.details);
      formErr.textContent = err.details ? err.message : `${err.message} You can also reach us on WhatsApp: 0488 860 700.`;
      formErr.classList.add('on');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = submitLabel;
    }
  });

  $('#q-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#q-ref').textContent); toast('Reference copied'); } catch { toast($('#q-ref').textContent); }
  });
  $('#q-again').addEventListener('click', () => {
    form.reset();
    setSize('dims');
    setSailing('');
    progress();
    showForm();
    $('#q-origin').focus();
  });
  progress();
}

// Small celebratory particle burst around the success tick.
function burst(anchor) {
  if (reducedMotion || !anchor) return;
  const colors = ['#F5A524', '#0B1F3A', '#2E5A94', '#0E7A3E', '#FFD27A'];
  for (let i = 0; i < 26; i++) {
    const p = document.createElement('i');
    const a = (i / 26) * Math.PI * 2 + Math.random() * 0.3;
    const d = 70 + Math.random() * 70;
    Object.assign(p.style, { position: 'absolute', left: '50%', top: '50%', width: '8px', height: '8px', margin: '-4px', borderRadius: i % 3 ? '2px' : '99px', background: colors[i % colors.length], pointerEvents: 'none' });
    anchor.appendChild(p);
    p.animate(
      [{ transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(.4) rotate(${Math.random() * 360}deg)`, opacity: 0 }],
      { duration: 900 + Math.random() * 400, easing: 'cubic-bezier(.22,1,.36,1)', delay: 250 }
    ).onfinish = () => p.remove();
  }
}

/* ---------- tracking ---------- */
function initTracking() {
  const form = $('#tform');
  const input = $('#t-no');
  const panel = $('#tpanel');

  const view = {
    loading: () => `<div class="tload" aria-label="Looking up your shipment"><div class="sk" style="width:40%;height:26px"></div><div class="sk" style="width:100%;height:10px;margin:18px 0"></div>${'<div class="sk"></div>'.repeat(5)}</div>`,
    empty: () => `<div class="nf"><h3>Please enter a tracking number</h3><p>You'll find it on your booking confirmation. For this demo, use ${DEMO_CODE}.</p><button class="btn btn-line btn-sm" type="button" data-demo-track>Use demo number</button></div>`,
    notFound: (msg) => `<div class="nf"><h3>${esc(msg || "We couldn't find that tracking number")}</h3><p>Check the number and try again, or contact the Widoph team. Try the demo number ${DEMO_CODE} to see how tracking works.</p><div class="row-btns" style="justify-content:flex-start"><button class="btn btn-line btn-sm" type="button" data-demo-track>Use demo number</button><a class="btn btn-wa btn-sm" href="https://wa.me/${WA}" target="_blank" rel="noopener">Ask on WhatsApp</a></div></div>`,
    result: (s) => {
      const total = s.timeline.length - 1;
      const pct = Math.min(100, (s.stage / total) * 100);
      const delivered = s.timeline[total].state === 'done';
      const shareUrl = `${location.origin}/?track=${encodeURIComponent(s.code)}#track`;
      return `<div>
        <div class="tsum">
          <div><small>Tracking number</small><strong>${esc(s.code)}</strong><small style="margin-top:4px">${esc(s.origin)} → ${esc(s.destination)} · ${esc(s.method)}</small></div>
          <div class="right">
            ${s.demo ? '<span class="ph">Demo · sample data</span>' : '<span class="ph live">Live</span>'}
            <span class="status${delivered ? ' delivered' : ''}"><i></i>${esc(s.status)}</span>
          </div>
        </div>
        <div class="rail" aria-hidden="true">
          <div class="rail-line"><i data-w="${pct}"></i><span class="rail-ship" data-l="${pct}">${icon(s.method.startsWith('Air') ? 'plane' : 'ship', 18)}</span></div>
          <div class="rail-ends"><span>AUS<small>${esc(s.origin)}</small></span><span>NGA<small>${esc(s.destination)}</small></span></div>
        </div>
        <ol class="tl">${s.timeline.map((t, i) => `
          <li class="${t.state}" style="--i:${i}">
            <span class="dot">${t.state === 'done' ? icon('check', 16) : t.state === 'cur' ? '<i></i>' : ''}</span>
            <div><b>${esc(t.title)}</b><span>${esc(
              t.state === 'up' ? 'Upcoming' : [t.location, t.at ? fmtDateTime(t.at) : t.state === 'cur' ? 'In progress' : 'Completed'].filter(Boolean).join(' · ')
            )}${t.note ? ` — ${esc(t.note)}` : ''}</span></div>
          </li>`).join('')}
        </ol>
        <div class="tshare">
          <a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`Track my Widoph shipment ${s.code}: ${shareUrl}`)}">${icon('share')}Share on WhatsApp</a>
          <a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://wa.me/${WA}?text=${encodeURIComponent(`Hi Widoph, a question about shipment ${s.code}.`)}">Ask about this shipment</a>
        </div>
      </div>`;
    }
  };

  const render = (html) => {
    panel.innerHTML = html;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $$('[data-w]', panel).forEach((el) => (el.style.width = el.dataset.w + '%'));
      $$('[data-l]', panel).forEach((el) => (el.style.left = el.dataset.l + '%'));
    }));
  };

  async function track(raw) {
    const code = String(raw || '').trim().toUpperCase();
    input.value = code;
    if (!code) return render(view.empty());
    render(view.loading());
    const started = performance.now();
    try {
      const { shipment } = await api(`/api/track?code=${encodeURIComponent(code)}`);
      await new Promise((r) => setTimeout(r, Math.max(0, 450 - (performance.now() - started))));
      render(view.result(shipment));
    } catch (err) {
      render(view.notFound(err.message));
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); track(input.value); });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-demo-track]')) track(DEMO_CODE);
  });

  const deep = new URLSearchParams(location.search).get('track');
  if (deep) {
    track(deep);
    setTimeout(() => $('#track').scrollIntoView(), 50);
  }
}

/* ---------- schedule ---------- */
async function initSchedule() {
  const PH = '[DD Mon YYYY]';
  try {
    const { rows } = await api('/api/schedule');
    if (!rows?.length) return;
    const anyPlaceholder = rows.some((r) => r.placeholder || !r.departure);
    const now = Date.now();
    const soonest = rows.find((r) => r.cutoff && Date.parse(r.cutoff) >= now - 86400000);
    $('#sched-rows').innerHTML = rows.map((r) => {
      const cell = (v) => (v ? `<td class="real">${esc(fmtDate(v))}</td>` : `<td class="mono">${PH}</td>`);
      const label = r.departure ? `Sydney LCL departing ${fmtDate(r.departure)}` : '';
      const badge = soonest === r ? '<span class="soon">Next cut-off</span>' : '';
      return `<tr>${cell(r.departure).replace('</td>', badge + '</td>')}${cell(r.cutoff)}${cell(r.eta)}<td><button class="more" type="button" data-sailing="${esc(label)}">Quote this sailing</button></td></tr>`;
    }).join('');
    const badge = $('#sched-badge');
    if (!anyPlaceholder) {
      badge.textContent = 'Updated by Widoph';
      badge.classList.add('live');
      $('#sched-note span').textContent = 'Dates are set by the Widoph team and may change. Confirm your cut-off when you book.';
    }
  } catch {
    /* keep the static placeholder rows */
  }
}

/* ---------- guide ---------- */
function initGuide() {
  const btn = $('#guide-btn');
  btn.addEventListener('click', () => {
    const note = $('#gnote');
    note.hidden = !note.hidden;
    btn.setAttribute('aria-expanded', String(!note.hidden));
  });
}

/* ---------- globe ---------- */
function initGlobe() {
  const host = $('#globe');
  const showFallback = () => document.documentElement.classList.remove('webgl');
  if (!document.documentElement.classList.contains('webgl')) return;
  import('/js/globe.js')
    .then(({ initGlobe }) => initGlobe(host, { labels: $('#glabels'), reducedMotion }))
    .then((ok) => (ok ? $('.hero').classList.add('globe-ready') : showFallback()))
    .catch((err) => {
      console.warn('Globe unavailable, showing the illustration.', err);
      showFallback();
    });
}

$('#year').textContent = new Date().getFullYear();
initHeader();
initReveal();
initTilt();
initFaq();
initTicker();
initQuote();
initTracking();
initSchedule();
initGuide();
initGlobe();
