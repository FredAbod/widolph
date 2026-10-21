// Local dev server that mirrors Vercel: /api/<name> → api/<name>.js,
// everything else is served from public/ with clean URLs.
// On Vercel this file is not used.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.bin': 'application/octet-stream'
};

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 100_000) throw Object.assign(new Error('Body too large'), { status: 413 });
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString();
  if (!raw) return {};
  if ((req.headers['content-type'] || '').includes('application/json')) {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

async function serveApi(req, res, name) {
  if (!/^[a-z-]+$/.test(name)) return notFound(res);
  let mod;
  try {
    mod = await import(pathToFileURL(join(ROOT, 'api', name + '.js')).href);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') return notFound(res);
    throw err;
  }
  const url = new URL(req.url, 'http://local');
  req.query = Object.fromEntries(url.searchParams);
  req.body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : undefined;
  await mod.default(req, res);
}

async function tryFile(path) {
  try {
    const s = await stat(path);
    return s.isFile() ? path : null;
  } catch {
    return null;
  }
}

async function serveStatic(res, pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  const base = join(PUBLIC, safe);
  if (!base.startsWith(PUBLIC + sep) && base !== PUBLIC) return notFound(res);
  const file = (await tryFile(base)) || (await tryFile(base + '.html')) || (await tryFile(join(base, 'index.html')));
  if (!file) return notFound(res);
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(await readFile(file));
}

async function notFound(res) {
  const page = await tryFile(join(PUBLIC, '404.html'));
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page ? await readFile(page) : 'Not found');
}

http
  .createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://local');
    try {
      const api = pathname.match(/^\/api\/([^/]+?)\/?$/);
      if (api) await serveApi(req, res, api[1]);
      else await serveStatic(res, pathname);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(err.status || 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  })
  .listen(PORT, () => {
    console.log(`\n  Widoph Logistics running at http://localhost:${PORT}`);
    console.log(`  Admin back office:          http://localhost:${PORT}/admin`);
    console.log(`  Database:                   ${process.env.MONGODB_URI ? 'MongoDB' : 'in-memory (set MONGODB_URI to use MongoDB)'}\n`);
  });
