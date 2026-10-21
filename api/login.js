// POST /api/login   { password } → { token, exp }
// GET  /api/login   checks the current Bearer token
import { route, clientIp, throttle } from '../lib/http.js';
import { login, requireAdmin } from '../lib/auth.js';

export default route({
  POST: async ({ req, body }) => {
    throttle('login:' + clientIp(req), 10, 15 * 60 * 1000);
    return login(String(body.password || ''));
  },
  GET: async ({ req }) => {
    const session = requireAdmin(req);
    return { ok: true, exp: session.exp };
  }
});
