// Small helpers shared by every API route. They only rely on the plain
// Node request/response objects, so they behave the same on Vercel and
// in the local dev server.

export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (typeof body === 'string') {
    if (!headers['Content-Type']) res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(body);
  } else {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  }
}

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function query(req) {
  if (req.query) return req.query;
  const url = new URL(req.url, 'http://local');
  return Object.fromEntries(url.searchParams);
}

async function body(req) {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body || '{}'); } catch { throw new HttpError(400, 'Invalid JSON body'); }
    }
    return req.body || {};
  }
  return {};
}

// route({ GET: fn, POST: fn }) – dispatches on method, parses the body and
// turns thrown HttpErrors into JSON responses.
export function route(methods) {
  return async function handler(req, res) {
    const fn = methods[req.method];
    if (!fn) return send(res, 405, { error: 'Method not allowed' }, { Allow: Object.keys(methods).join(', ') });
    try {
      const data = await fn({ req, res, query: query(req), body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? await body(req) : {} });
      if (!res.writableEnded) send(res, 200, data ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message, details: err.details });
      console.error('[widoph] API error', err);
      send(res, 500, { error: 'Something went wrong on our side. Please try again or contact us on WhatsApp.' });
    }
  };
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (Array.isArray(fwd) ? fwd[0] : fwd || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

// Best-effort per-instance throttle (serverless instances don't share memory).
const hits = new Map();
export function throttle(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) throw new HttpError(429, 'Too many requests – please wait a few minutes and try again.');
  list.push(now);
  hits.set(key, list);
}
