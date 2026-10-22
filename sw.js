// Service Worker di Domus: SOLO risorse statiche dell'app. Non tocca mai IndexedDB né i dati personali.
// La versione deve coincidere con APP_VERSION (js/version.js) — controllato da scripts/check-precache.mjs.
const CACHE_VERSION = '1.2.0';
const CACHE = `domus-shell-${CACHE_VERSION}`;
const PRECACHE = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'js/app.js', 'js/app-sw.js', 'js/version.js',
  'js/lib/ask.js', 'js/lib/inbox.js', 'js/lib/proposals.js', 'js/lib/stats.js', 'js/lib/suppliers.js', 'js/lib/backup-core.js', 'js/lib/dashboard.js', 'js/lib/dates.js', 'js/lib/deliver.js', 'js/lib/expenses.js', 'js/lib/extract.js', 'js/lib/hash.js', 'js/lib/ics.js', 'js/lib/integrity.js', 'js/lib/pdftext.js', 'js/lib/recurrence.js', 'js/lib/search.js', 'js/lib/zip.js',
  'js/data/backup-io.js', 'js/data/db.js', 'js/data/dirs.js', 'js/data/intel.js', 'js/data/migrations.js', 'js/data/repo.js', 'js/data/schema.js',
  'js/ui/archive.js', 'js/ui/calendar.js', 'js/ui/charts.js', 'js/ui/inbox.js', 'js/ui/suppliers.js', 'js/ui/widgets.js', 'js/ui/common.js', 'js/ui/contacts.js', 'js/ui/expenses.js', 'js/ui/h.js', 'js/ui/intel-panel.js', 'js/ui/house.js', 'js/ui/kit.js', 'js/ui/links.js', 'js/ui/money.js', 'js/ui/more.js', 'js/ui/practices.js', 'js/ui/prompt.js', 'js/ui/search.js', 'js/ui/settings.js', 'js/ui/tasks.js', 'js/ui/today.js',
];

self.addEventListener('install', (event) => {
  // addAll è atomico: se un file manca l'installazione fallisce e resta la versione precedente. 'reload' evita la cache HTTP.
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('domus-shell-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;     // nessuna richiesta esterna viene mai gestita/emessa
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {                                              // cache incompleta: recupero dalla rete e riparo la cache
      const res = await fetch(req);
      if (res.ok && PRECACHE.some((p) => new URL(p, self.registration.scope).href === url.href)) cache.put(req, res.clone());
      return res;
    } catch {
      if (req.mode === 'navigate') { const shell = await cache.match('index.html'); if (shell) return shell; }
      return new Response('Risorsa non disponibile offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
