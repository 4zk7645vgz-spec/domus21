import { DB_NAME, DB_VERSION, runMigrations } from './migrations.js';

export class DomusError extends Error { constructor(code, msg, extra) { super(msg); this.code = code; Object.assign(this, extra); } }
let dbp = null;

export function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new DomusError('NO_IDB', 'IndexedDB non è disponibile in questo browser.'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => runMigrations(req.result, req.transaction, e.oldVersion, DB_VERSION);
    req.onblocked = () => reject(new DomusError('BLOCKED', 'Aggiornamento database bloccato: chiudere le altre schede/finestre di Domus e riaprire.'));
    req.onerror = () => reject(mapErr(req.error));
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbp = null; };
      resolve(db);
    };
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}

export function mapErr(e) {
  if (e instanceof DomusError) return e;
  if (e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || ''))) return new DomusError('QUOTA', 'Spazio di archiviazione esaurito. Nessun dato è stato modificato: libera spazio o esporta un backup e rimuovi documenti.');
  if (e && e.name === 'ConstraintError') return new DomusError('CONSTRAINT', 'Operazione non consentita: elemento duplicato.', { cause: e });
  return new DomusError('DB', `Errore del database: ${e?.message || e}`, { cause: e });
}
const p = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

/** Transazione atomica. `fn(t)` può attendere SOLO le operazioni di `t` (altrimenti la transazione si chiude). */
export async function run(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    let tx, result, failed = false;
    try { tx = db.transaction(stores, mode); } catch (e) { return reject(mapErr(e)); }
    const t = {
      get: (s, k) => p(tx.objectStore(s).get(k)),
      all: (s) => p(tx.objectStore(s).getAll()),
      put: (s, v, k) => p(tx.objectStore(s).put(v, k)),
      del: (s, k) => p(tx.objectStore(s).delete(k)),
      byIndex: (s, i, k) => p(tx.objectStore(s).index(i).getAll(k)),
      keys: (s) => p(tx.objectStore(s).getAllKeys()),
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(mapErr(tx.error || failed));
    tx.onerror = () => { /* gestito da onabort */ };
    Promise.resolve().then(() => fn(t)).then((r) => { result = r; }, (e) => { failed = e; try { tx.abort(); } catch {} ; reject(mapErr(e)); });
  });
}

export const getMeta = (k) => run(['meta'], 'readonly', (t) => t.get('meta', k));
export const setMeta = (k, v) => run(['meta'], 'readwrite', (t) => t.put('meta', v, k));
