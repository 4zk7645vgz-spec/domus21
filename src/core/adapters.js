// Storage adapters. The application talks to the `Adapter` interface only:
//   get(store,key) getAll(store) put(store,value) delete(store,key) clear(store)
//   count(store) batch(ops) close()
// IdbAdapter runs in the browser; MemoryAdapter is used by the automated tests
// and mimics structured cloning and quota errors.
import { STORES, STORE_NAMES, DB_NAME, SCHEMA_VERSION } from './schema.js';

export class DomusError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'DomusError';
    this.code = code; // STORAGE_FULL | NOT_FOUND | INVALID | BACKUP_INVALID | ...
    if (cause) this.cause = cause;
  }
}

function wrapStorageError(e) {
  if (e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota/i.test(e.message || ''))) {
    return new DomusError('STORAGE_FULL', 'Spazio di archiviazione esaurito. Libera spazio sul dispositivo o esporta e rimuovi documenti.', e);
  }
  return e;
}

function sizeOf(value) {
  if (value == null) return 0;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (typeof value === 'string') return value.length * 2;
  if (typeof value !== 'object') return 8;
  let n = 0;
  for (const v of Object.values(value)) n += sizeOf(v);
  return n + 32;
}

export class MemoryAdapter {
  constructor({ quotaBytes = Infinity } = {}) {
    this.kind = 'memory';
    this.stores = new Map(STORE_NAMES.map((s) => [s, new Map()]));
    this.quotaBytes = quotaBytes;
    this.failNext = null;
  }
  _used() {
    let n = 0;
    for (const m of this.stores.values()) for (const v of m.values()) n += sizeOf(v);
    return n;
  }
  _store(name) {
    const s = this.stores.get(name);
    if (!s) throw new DomusError('INVALID', `Archivio sconosciuto: ${name}`);
    return s;
  }
  async get(store, key) {
    const v = this._store(store).get(key);
    return v === undefined ? undefined : structuredClone(v);
  }
  async getAll(store) {
    return [...this._store(store).values()].map((v) => structuredClone(v));
  }
  async put(store, value) { return this.batch([{ op: 'put', store, value }]); }
  async delete(store, key) { return this.batch([{ op: 'delete', store, key }]); }
  async clear(store) { this._store(store).clear(); }
  async count(store) { return this._store(store).size; }
  async batch(ops) {
    if (this.failNext) { const e = this.failNext; this.failNext = null; throw wrapStorageError(e); }
    // atomic: work on snapshots of touched stores, commit only if everything succeeds
    const touched = new Map();
    for (const op of ops) if (!touched.has(op.store)) touched.set(op.store, new Map(this._store(op.store)));
    for (const op of ops) {
      const m = touched.get(op.store);
      if (op.op === 'put') {
        if (!op.value || op.value.id == null) throw new DomusError('INVALID', 'Record senza id');
        m.set(op.value.id, structuredClone(op.value));
      } else if (op.op === 'delete') m.delete(op.key);
      else throw new DomusError('INVALID', 'Operazione sconosciuta');
    }
    const before = new Map();
    for (const name of touched.keys()) before.set(name, this.stores.get(name));
    for (const [name, m] of touched) this.stores.set(name, m);
    if (this._used() > this.quotaBytes) {
      for (const [name, m] of before) this.stores.set(name, m); // roll back
      throw wrapStorageError(Object.assign(new Error('quota'), { name: 'QuotaExceededError' }));
    }
  }
  close() {}
}

export class IdbAdapter {
  constructor(db) { this.kind = 'indexeddb'; this.db = db; }

  static open(name = DB_NAME, version = SCHEMA_VERSION, idb = globalThis.indexedDB) {
    return new Promise((resolve, reject) => {
      const req = idb.open(name, version);
      req.onupgradeneeded = () => {
        const db = req.result;
        const tx = req.transaction;
        for (const [store, def] of Object.entries(STORES)) {
          const os = db.objectStoreNames.contains(store) ? tx.objectStore(store) : db.createObjectStore(store, { keyPath: 'id' });
          for (const [iname, path] of def.indexes) if (!os.indexNames.contains(iname)) os.createIndex(iname, path);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(new IdbAdapter(db));
      };
      req.onerror = () => reject(wrapStorageError(req.error));
      req.onblocked = () => reject(new DomusError('BLOCKED', 'Chiudi le altre schede di Domus e riprova.'));
    });
  }

  _run(storeNames, mode, fn) {
    return new Promise((resolve, reject) => {
      let result;
      let tx;
      try { tx = this.db.transaction(storeNames, mode); } catch (e) { reject(wrapStorageError(e)); return; }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(wrapStorageError(tx.error));
      tx.onabort = () => reject(wrapStorageError(tx.error || new Error('Transazione annullata')));
      try { result = fn(tx); } catch (e) { try { tx.abort(); } catch { /* already finished */ } reject(wrapStorageError(e)); }
    });
  }
  _req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

  async get(store, key) {
    let r;
    await this._run([store], 'readonly', (tx) => { r = tx.objectStore(store).get(key); });
    return r.result;
  }
  async getAll(store) {
    let r;
    await this._run([store], 'readonly', (tx) => { r = tx.objectStore(store).getAll(); });
    return r.result;
  }
  async put(store, value) { return this.batch([{ op: 'put', store, value }]); }
  async delete(store, key) { return this.batch([{ op: 'delete', store, key }]); }
  async clear(store) { await this._run([store], 'readwrite', (tx) => { tx.objectStore(store).clear(); }); }
  async count(store) {
    let r;
    await this._run([store], 'readonly', (tx) => { r = tx.objectStore(store).count(); });
    return r.result;
  }
  async batch(ops) {
    const names = [...new Set(ops.map((o) => o.store))];
    if (!names.length) return;
    await this._run(names, 'readwrite', (tx) => {
      for (const op of ops) {
        const os = tx.objectStore(op.store);
        if (op.op === 'put') os.put(op.value); else os.delete(op.key);
      }
    });
  }
  close() { this.db.close(); }
}
