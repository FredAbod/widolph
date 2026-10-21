// Single-password admin auth with stateless HMAC-signed tokens.
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http.js';

const ON_VERCEL = !!process.env.VERCEL;
const DEV_PASSWORD = 'widoph-admin';
const TTL_MS = 12 * 60 * 60 * 1000;

function password() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (ON_VERCEL || process.env.NODE_ENV === 'production') return null;
  return DEV_PASSWORD;
}

function secret() {
  return process.env.AUTH_SECRET || createHash('sha256').update('widoph:' + (password() || '')).digest('hex');
}

const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (payload) => createHmac('sha256', secret()).update(payload).digest('base64url');

function safeEqual(a, b) {
  const x = createHash('sha256').update(String(a)).digest();
  const y = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x, y);
}

export function login(candidate) {
  const pw = password();
  if (!pw) throw new HttpError(503, 'Admin is not configured. Set ADMIN_PASSWORD in your environment variables.');
  if (!candidate || !safeEqual(candidate, pw)) throw new HttpError(401, 'Incorrect password.');
  const exp = Date.now() + TTL_MS;
  const payload = b64(JSON.stringify({ role: 'admin', exp }));
  return { token: `${payload}.${sign(payload)}`, exp };
}

export function requireAdmin(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !password() || !safeEqual(sig, sign(payload))) throw new HttpError(401, 'Please sign in again.');
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw new HttpError(401, 'Please sign in again.'); }
  if (!data.exp || data.exp < Date.now()) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  return data;
}
