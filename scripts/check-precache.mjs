#!/usr/bin/env node
// Verifica: (1) ogni file elencato in PRECACHE esiste; (2) ogni file js/css/icona del progetto è in PRECACHE;
// (3) CACHE_VERSION == APP_VERSION; (4) nessun URL assoluto esterno nei sorgenti.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
const root = new URL('..', import.meta.url).pathname;
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const list = [...sw.match(/const PRECACHE = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const errs = [];
for (const f of list) if (f !== './' && !existsSync(join(root, f))) errs.push(`PRECACHE: file inesistente ${f}`);
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
for (const dir of ['js', 'css', 'icons']) for (const f of walk(join(root, dir))) { const r = relative(root, f); if (!list.includes(r)) errs.push(`Non in PRECACHE: ${r}`); }
const cv = /CACHE_VERSION = '([^']+)'/.exec(sw)[1];
const av = /APP_VERSION = '([^']+)'/.exec(readFileSync(join(root, 'js/version.js'), 'utf8'))[1];
if (cv !== av) errs.push(`Versioni diverse: sw.js ${cv} ≠ version.js ${av}`);
for (const f of [...walk(join(root, 'js')), join(root, 'index.html'), join(root, 'sw.js'), join(root, 'css/app.css'), join(root, 'manifest.webmanifest')]) {
  const t = readFileSync(f, 'utf8');
  for (const m of t.matchAll(/https?:\/\/[^\s'"`)]+/g)) if (!/w3\.org\/2000\/svg|^http:\/\/x$|localhost|domus\.local/.test(m[0])) errs.push(`URL esterno in ${relative(root, f)}: ${m[0]}`);
}
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log(`OK: ${list.length} risorse in precache, versione ${cv}, nessun URL esterno.`);
