// GET /api/schedule   public – Sydney LCL sailings
// PUT /api/schedule   admin  – replace all rows: { rows: [{ departure, cutoff, eta }] } (ISO dates)
import { route, HttpError } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { listSchedule, replaceSchedule } from '../lib/db.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const date = (v) => (v && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);

export default route({
  GET: async () => ({ rows: await listSchedule() }),

  PUT: async ({ req, body }) => {
    requireAdmin(req);
    if (!Array.isArray(body.rows) || body.rows.length > 20) throw new HttpError(422, 'Send between 0 and 20 rows.');
    const rows = body.rows.map((r, i) => {
      const row = { order: i + 1, departure: date(r.departure), cutoff: date(r.cutoff), eta: date(r.eta) };
      row.placeholder = !row.departure && !row.cutoff && !row.eta;
      return row;
    });
    return { rows: await replaceSchedule(rows) };
  }
});
