// Admin shipment management.
// GET    /api/shipments                list
// POST   /api/shipments                create (optionally from a quote: { quoteRef })
// PATCH  /api/shipments?code=WDP-…     { stage, location, note } – move along the timeline
// DELETE /api/shipments?code=WDP-…     remove (the demo shipment is protected)
import { route, HttpError } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { listShipments, insertShipment, getShipment, replaceShipment, deleteShipment, getQuote, updateQuote } from '../lib/db.js';
import { ORIGINS, DESTINATIONS, METHODS, code } from '../lib/validate.js';
import { STAGES, setStage, publicView } from '../lib/shipments.js';

const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const withView = (s) => ({ ...s, view: publicView(s) });

export default route({
  GET: async ({ req }) => {
    requireAdmin(req);
    return { shipments: (await listShipments()).map(withView), stages: STAGES };
  },

  POST: async ({ req, body }) => {
    requireAdmin(req);
    let base = body;
    if (body.quoteRef) {
      const quote = await getQuote(clean(body.quoteRef, 20));
      if (!quote) throw new HttpError(404, 'Quote not found.');
      base = { origin: quote.origin, destination: quote.destination, method: quote.method, customerName: quote.name, quoteRef: quote.ref };
    }
    const origin = ORIGINS.includes(base.origin) ? base.origin : 'Sydney';
    const destination = DESTINATIONS.includes(base.destination) ? base.destination : 'Lagos';
    const now = new Date().toISOString();
    let shipment = {
      code: `WDP-${code(4)}-${code(4)}`,
      demo: false,
      origin,
      destination,
      method: METHODS.includes(base.method) ? base.method : 'Not sure',
      customerName: clean(base.customerName, 120) || 'Customer',
      quoteRef: base.quoteRef || null,
      stage: 0,
      events: [],
      createdAt: now,
      updatedAt: now
    };
    shipment = setStage(shipment, 0, { location: `${origin}, Australia` });
    await insertShipment(shipment);
    if (shipment.quoteRef) await updateQuote(shipment.quoteRef, { status: 'won', shipmentCode: shipment.code });
    return { shipment: withView(shipment) };
  },

  PATCH: async ({ req, query, body }) => {
    requireAdmin(req);
    const current = await getShipment(clean(query.code, 24).toUpperCase());
    if (!current) throw new HttpError(404, 'Shipment not found.');
    const stage = Number(body.stage ?? current.stage);
    if (!Number.isInteger(stage) || stage < 0 || stage >= STAGES.length) throw new HttpError(422, 'Unknown stage.');
    const next = setStage(current, stage, {
      location: body.location !== undefined ? clean(body.location, 120) : undefined,
      note: body.note !== undefined ? clean(body.note, 300) : undefined
    });
    return { shipment: withView(await replaceShipment(current.code, next)) };
  },

  DELETE: async ({ req, query }) => {
    requireAdmin(req);
    const c = clean(query.code, 24).toUpperCase();
    const s = await getShipment(c);
    if (!s) throw new HttpError(404, 'Shipment not found.');
    if (s.demo) throw new HttpError(409, 'The demo shipment is kept so the homepage demo keeps working.');
    await deleteShipment(c);
    return { ok: true };
  }
});
