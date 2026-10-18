#!/usr/bin/env node
// Server statico minimale per sviluppo/collaudo locale (http://localhost è un "secure context").
// Uso: node scripts/serve.mjs [cartella] [porta]   — non serve per l'uso quotidiano su iPhone (serve HTTPS: vedi README).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
export function createServer(root) {
  const base = resolve(root);
  return http.createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = resolve(join(base, normalize(p)));
      if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
      await stat(file);
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(body);
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || '.'; const port = Number(process.argv[3] || 8080);
  createServer(root).listen(port, () => console.log(`Domus servita su http://localhost:${port}/  (cartella: ${resolve(root)})`));
}
