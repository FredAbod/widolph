// Optional new-lead email via Resend (https://resend.com). Enabled only when
// RESEND_API_KEY and NOTIFY_EMAIL are set; failures never block the quote.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function notifyNewQuote(q) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!key || !to) return;

  const size = q.sizeMode === 'cbm'
    ? (q.cbm != null ? `${q.cbm} CBM` : '—')
    : ([q.length, q.width, q.height].some((v) => v != null) ? `${q.length ?? '?'} × ${q.width ?? '?'} × ${q.height ?? '?'} cm` : '—');
  const rows = [
    ['Reference', q.ref], ['Route', `${q.origin} → ${q.destination}`], ['Method', q.method], ['Goods', q.goods],
    ['Weight', q.weight != null ? `${q.weight} kg` : '—'], ['Packages', q.packages ?? '—'], ['Size', size],
    ['Door-to-door', q.door], ['Customs clearance', q.customs], ['Sailing', q.sailing || '—'],
    ['Name', q.name], ['Email', q.email], ['Phone / WhatsApp', q.phone], ['Message', q.message || '—']
  ];
  const html = `<h2 style="font-family:sans-serif">New quote request ${esc(q.ref)}</h2><table style="font-family:sans-serif;border-collapse:collapse">${rows
    .map(([k, v]) => `<tr><td style="padding:6px 12px;color:#4A5568">${esc(k)}</td><td style="padding:6px 12px;font-weight:600">${esc(v)}</td></tr>`)
    .join('')}</table>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Widoph Quotes <onboarding@resend.dev>',
        to: to.split(',').map((s) => s.trim()),
        reply_to: q.email,
        subject: `New quote: ${q.origin} → ${q.destination} · ${q.method} (${q.ref})`,
        html
      }),
      signal: AbortSignal.timeout(4000)
    });
    if (!r.ok) console.warn('[widoph] Resend responded', r.status, await r.text());
  } catch (err) {
    console.warn('[widoph] Quote email failed:', err.message);
  }
}
