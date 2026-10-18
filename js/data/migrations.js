// Migrazioni IndexedDB versionate. Ogni migrazione è additiva e non cancella mai dati esistenti.
import { STORES } from './schema.js';
export const DB_NAME = 'domus';
export const DB_VERSION = 2;

const idx = (os, name, kp, o) => { if (!os.indexNames.contains(name)) os.createIndex(name, kp, o); };

export const MIGRATIONS = {
  1(db) {
    for (const s of STORES) db.createObjectStore(s, { keyPath: 'id' });
    db.createObjectStore('blobs');   // chiave = id documento; valore = {buf, type, name}
    db.createObjectStore('meta');    // chiave/valore: impostazioni e stato
  },
  2(db, tx) {
    // 2: indici per scadenze e unicità delle occorrenze ricorrenti (+ riallineamento dei record esistenti)
    const tasks = tx.objectStore('tasks');
    idx(tasks, 'status', 'status'); idx(tasks, 'seriesId', 'seriesId'); idx(tasks, 'due', 'due');
    idx(tx.objectStore('checklist'), 'practiceId', 'practiceId');
    idx(tx.objectStore('payments'), 'parentId', 'parentId');
    idx(tx.objectStore('relationships'), 'a', ['aType', 'aId']); idx(tx.objectStore('relationships'), 'b', ['bType', 'bId']);
    idx(tx.objectStore('documents'), 'expires', 'expires'); idx(tx.objectStore('maintenance'), 'nextDue', 'nextDue');
    // Backfill occKey sui task ricorrenti pre-esistenti; i duplicati non ottengono la chiave (evita l'errore sull'indice univoco).
    const seen = new Set();
    const req = tasks.openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) { if (!tasks.indexNames.contains('occKey')) tasks.createIndex('occKey', 'occKey', { unique: true }); return; }
      const t = c.value;
      if (t.recurrence && t.due) {
        t.seriesId ||= t.id;
        const k = `${t.seriesId}:${t.due}`;
        if (!seen.has(k)) { seen.add(k); t.occKey = k; } else delete t.occKey;
        c.update(t);
      } else if (t.occKey !== undefined) { delete t.occKey; c.update(t); }
      c.continue();
    };
  },
};

export function runMigrations(db, tx, from, to = DB_VERSION) {
  for (let v = from + 1; v <= to; v++) MIGRATIONS[v](db, tx);
}
