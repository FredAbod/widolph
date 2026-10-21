// GET /api/track?code=WDP-…   public shipment lookup
import { route, HttpError, clientIp, throttle } from '../lib/http.js';
import { getShipment } from '../lib/db.js';
import { publicView } from '../lib/shipments.js';

export default route({
  GET: async ({ req, query }) => {
    throttle('track:' + clientIp(req), 60, 60 * 1000);
    const code = String(query.code || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!code) throw new HttpError(400, 'Please enter a tracking number.');
    if (!/^[A-Z0-9-]{4,24}$/.test(code)) throw new HttpError(404, 'We couldn\'t find that tracking number.');
    const shipment = await getShipment(code);
    if (!shipment) throw new HttpError(404, 'We couldn\'t find that tracking number.');
    return { shipment: publicView(shipment) };
  }
});
