// POST   /api/quotes             public – submit a quote request
// GET    /api/quotes             admin  – list (?status=&q=) with stats; ?format=csv to export
// PATCH  /api/quotes?ref=WQ-…    admin  – update status / internal notes
import { route, send, HttpError, clientIp, throttle } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { insertQuote, listQuotes, quoteStats, updateQuote } from '../lib/db.js';
import { parseQuote, code, QUOTE_STATUSES } from '../lib/validate.js';
import { notifyNewQuote } from '../lib/notify.js';

const CSV_COLUMNS = ['ref', 'createdAt', 'status', 'name', 'email', 'phone', 'origin', 'destination', 'method', 'goods', 'weight', 'packages', 'length', 'width', 'height', 'cbm', 'door', 'customs', 'sailing', 'message', 'adminNotes'];

function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // keep spreadsheet apps from running formulas
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default route({
  POST: async ({ req, body }) => {
    // Honeypot: real visitors never fill the hidden "company" field.
    if (body.company) return { ok: true, ref: 'WQ-' + code(6) };
    throttle('quote:' + clientIp(req), 8, 10 * 60 * 1000);

    const now = new Date().toISOString();
    const quote = { ref: 'WQ-' + code(6), ...parseQuote(body), status: 'new', adminNotes: '', createdAt: now, updatedAt: now };
    await insertQuote(quote);
    await notifyNewQuote(quote);
    return { ok: true, ref: quote.ref };
  },

  GET: async ({ req, res, query }) => {
    requireAdmin(req);
    const status = QUOTE_STATUSES.includes(query.status) ? query.status : undefined;
    const quotes = await listQuotes({ status, q: String(query.q || '').slice(0, 80), limit: query.format === 'csv' ? 5000 : 300 });
    if (query.format === 'csv') {
      const csv = [CSV_COLUMNS.join(','), ...quotes.map((q) => CSV_COLUMNS.map((c) => csvCell(q[c])).join(','))].join('\n');
      return send(res, 200, '﻿' + csv, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="widoph-quotes-${new Date().toISOString().slice(0, 10)}.csv"`
      });
    }
    return { quotes, stats: await quoteStats() };
  },

  PATCH: async ({ req, query, body }) => {
    requireAdmin(req);
    const patch = {};
    if (body.status !== undefined) {
      if (!QUOTE_STATUSES.includes(body.status)) throw new HttpError(422, 'Unknown status.');
      patch.status = body.status;
    }
    if (body.adminNotes !== undefined) patch.adminNotes = String(body.adminNotes).slice(0, 4000);
    if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to update.');
    const quote = await updateQuote(String(query.ref || ''), patch);
    if (!quote) throw new HttpError(404, 'Quote not found.');
    return { quote };
  }
});
