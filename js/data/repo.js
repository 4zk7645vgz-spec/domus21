// Operazioni di dominio. Ogni operazione che tocca più record è una singola transazione IndexedDB (tutto o niente).
import * as db from './db.js';
import { DomusError } from './db.js';
import { sanitize, errText, STORES, STORE_OF, DEFAULT_CATEGORIES, BILL_MONTHS, PRACTICE_STATUS } from './schema.js';
import { nextAfterCompletion } from '../lib/recurrence.js';
import { todayStr, addMonths, dayOf, addDays } from '../lib/dates.js';
import { sha256, uid } from '../lib/hash.js';

export { DomusError };
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
const nowIso = () => new Date().toISOString();
const asVal = (store, data, meta) => {
  const { value, errors } = sanitize(store, data, { meta });
  if (errors.length) throw new DomusError('VALIDATION', errText(errors), { errors });
  return value;
};

function finalizeTask(rec) {
  if (rec.recurrence) { rec.seriesId ||= rec.id; rec.occKey = `${rec.seriesId}:${rec.due}`; }
  else { delete rec.seriesId; delete rec.occKey; }
  return rec;
}
function finalizePractice(rec, prev) {
  const today = todayStr();
  if (rec.status === 'closed' || rec.status === 'archived') rec.concludedAt ||= today; else delete rec.concludedAt;
  const label = (s) => PRACTICE_STATUS.find(([v]) => v === s)?.[1];
  if (!prev) rec.history = [{ at: nowIso(), text: 'Pratica aperta' }, ...(rec.history || [])];
  else if (prev.status !== rec.status) rec.history = [...(rec.history || []), { at: nowIso(), text: `Stato: ${label(rec.status)}` }];
  return rec;
}
const FINAL = { tasks: finalizeTask, practices: finalizePractice };

export async function create(store, data) {
  const base = { ...data };
  const rec = { ...asVal(store, base), id: uid(), createdAt: nowIso(), updatedAt: nowIso() };
  FINAL[store]?.(rec, null);
  await db.run([store], 'readwrite', (t) => t.put(store, rec));
  return rec;
}

export async function update(store, id, patch) {
  return db.run([store], 'readwrite', async (t) => {
    const prev = await t.get(store, id);
    if (!prev) throw new DomusError('NOT_FOUND', 'Elemento non trovato (forse eliminato).');
    const merged = { ...prev, ...patch };
    const rec = { ...asVal(store, merged), id: prev.id, createdAt: prev.createdAt, updatedAt: nowIso() };
    FINAL[store]?.(rec, prev);
    await t.put(store, rec);
    return rec;
  });
}

export const get = (store, id) => db.run([store], 'readonly', (t) => t.get(store, id));
export async function snapshot() {
  return db.run(STORES, 'readonly', async (t) => {
    const out = {};
    for (const s of STORES) out[s] = await t.all(s);
    return out;
  });
}
export const blobIds = () => db.run(['blobs'], 'readonly', (t) => t.keys('blobs'));
export const listPayments = (parentId) => db.run(['payments'], 'readonly', (t) => t.byIndex('payments', 'parentId', parentId));
export const listChecklist = (practiceId) => db.run(['checklist'], 'readonly', async (t) => (await t.byIndex('checklist', 'practiceId', practiceId)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

// ---------- relazioni ----------
async function relsOf(t, type, id) {
  const [a, b] = await Promise.all([t.byIndex('relationships', 'a', [type, id]), t.byIndex('relationships', 'b', [type, id])]);
  return [...a, ...b];
}
async function dropRels(t, type, id) { for (const r of await relsOf(t, type, id)) await t.del('relationships', r.id); }

export async function link(aType, aId, bType, bId) {
  if (aType === bType && aId === bId) throw new DomusError('VALIDATION', 'Un elemento non può essere collegato a se stesso.');
  return db.run(['relationships', STORE_OF[aType], STORE_OF[bType]], 'readwrite', async (t) => {
    if (!(await t.get(STORE_OF[aType], aId)) || !(await t.get(STORE_OF[bType], bId))) throw new DomusError('NOT_FOUND', 'Elemento da collegare non trovato.');
    const existing = await relsOf(t, aType, aId);
    if (existing.some((r) => (r.aType === aType && r.aId === aId && r.bType === bType && r.bId === bId) || (r.aType === bType && r.aId === bId && r.bType === aType && r.bId === aId))) return null;
    const rec = { id: uid(), aType, aId, bType, bId, createdAt: nowIso(), updatedAt: nowIso() };
    await t.put('relationships', rec);
    return rec;
  });
}
/** Rimuove SOLO il collegamento: nessun elemento collegato viene eliminato. */
export const unlink = (relId) => db.run(['relationships'], 'readwrite', (t) => t.del('relationships', relId));

/** Elementi collegati a (type,id), risolti: [{relId, type, id, rec}] */
export async function linksOf(type, id) {
  return db.run(STORES, 'readonly', async (t) => {
    const out = [];
    for (const r of await relsOf(t, type, id)) {
      const o = r.aType === type && r.aId === id ? { type: r.bType, id: r.bId } : { type: r.aType, id: r.aId };
      const rec = await t.get(STORE_OF[o.type], o.id);
      if (rec) out.push({ relId: r.id, ...o, rec });
    }
    return out;
  });
}

// ---------- eliminazione con regole di integrità ----------
const REFS = { propertyId: ['tasks', 'practices', 'maintenance', 'utilities', 'contracts', 'documents'], contactId: ['maintenance'], categoryId: ['tasks', 'practices', 'documents'] };
async function clearRefs(t, key, id) {
  for (const s of REFS[key]) for (const r of await t.all(s)) if (r[key] === id) { delete r[key]; r.updatedAt = nowIso(); await t.put(s, r); }
}
export async function remove(type, id) {
  const store = STORE_OF[type];
  const stores = type === 'document' ? [...STORES, 'blobs'] : STORES;
  return db.run(stores, 'readwrite', async (t) => {
    if (!(await t.get(store, id))) return false;
    await dropRels(t, type, id);
    if (type === 'practice') for (const c of await t.byIndex('checklist', 'practiceId', id)) await t.del('checklist', c.id);
    if (type === 'utility' || type === 'contract') for (const p of await t.byIndex('payments', 'parentId', id)) await t.del('payments', p.id);
    if (type === 'document') await t.del('blobs', id);
    if (type === 'property') await clearRefs(t, 'propertyId', id);
    if (type === 'contact') await clearRefs(t, 'contactId', id);
    await t.del(store, id);
    await t.put('audit', { id: uid(), at: nowIso(), type: 'delete', summary: `Eliminato: ${type}`, createdAt: nowIso(), updatedAt: nowIso() });
    return true;
  });
}
export async function removeCategory(id) {
  return db.run(STORES, 'readwrite', async (t) => { await clearRefs(t, 'categoryId', id); await t.del('categories', id); });
}
export async function removeTag(id) {
  return db.run(STORES, 'readwrite', async (t) => {
    for (const s of ['tasks', 'documents']) for (const r of await t.all(s)) if (r.tagIds?.includes(id)) { r.tagIds = r.tagIds.filter((x) => x !== id); r.updatedAt = nowIso(); await t.put(s, r); }
    await t.del('tags', id);
  });
}

// ---------- tag e categorie ----------
export async function tagIdsFor(names) {
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 30);
  return db.run(['tags'], 'readwrite', async (t) => {
    const all = await t.all('tags'); const ids = [];
    for (const n of clean) {
      let tag = all.find((x) => x.name.toLowerCase() === n.toLowerCase());
      if (!tag) { tag = { id: uid(), name: n.slice(0, 60), createdAt: nowIso(), updatedAt: nowIso() }; await t.put('tags', tag); all.push(tag); }
      ids.push(tag.id);
    }
    return ids;
  });
}
export async function ensureDefaults() {
  const done = await db.getMeta('defaultsSeeded');
  if (done) return;
  await db.run(['categories', 'meta'], 'readwrite', async (t) => {
    if ((await t.all('categories')).length === 0) for (const name of DEFAULT_CATEGORIES) await t.put('categories', { id: uid(), name, createdAt: nowIso(), updatedAt: nowIso() });
    await t.put('meta', true, 'defaultsSeeded');
  });
}

// ---------- attività ricorrenti ----------
/** Completa un'attività. Idempotente. Se ricorrente crea l'occorrenza successiva (una sola serie aperta alla volta). */
export async function completeTask(id, today = todayStr()) {
  return db.run(['tasks'], 'readwrite', async (t) => {
    const task = await t.get('tasks', id);
    if (!task) throw new DomusError('NOT_FOUND', 'Attività non trovata.');
    if (task.status === 'done') return { task, next: null, skipped: 0 };
    const done = { ...task, status: 'done', completedAt: nowIso(), updatedAt: nowIso() };
    let next = null, skipped = 0;
    if (task.recurrence && task.due) {
      const r = nextAfterCompletion(task.recurrence, task.due, today);
      if (r) {
        const open = (await t.byIndex('tasks', 'seriesId', task.seriesId)).filter((x) => x.status === 'open' && x.id !== id);
        if (open.length === 0) {
          skipped = r.skipped;
          next = { ...task, id: uid(), status: 'open', due: r.next, occKey: `${task.seriesId}:${r.next}`, createdAt: nowIso(), updatedAt: nowIso() };
          delete next.completedAt; delete next.skipped;
          // Il giorno àncora resta quello originale (31 gen → 28 feb → 31 mar).
          next.recurrence = { ...task.recurrence, anchorDay: task.recurrence.anchorDay || dayOf(task.due) };
          await t.put('tasks', next);
        }
      }
      done.skipped = skipped;
    }
    await t.put('tasks', done);
    return { task: done, next, skipped };
  });
}
export async function reopenTask(id) {
  return db.run(['tasks'], 'readwrite', async (t) => {
    const task = await t.get('tasks', id);
    if (!task || task.status !== 'done') return task;
    if (task.seriesId) {
      const open = (await t.byIndex('tasks', 'seriesId', task.seriesId)).filter((x) => x.status === 'open');
      if (open.length) throw new DomusError('CONFLICT', 'Esiste già una successiva occorrenza aperta di questa attività ricorrente: non è possibile riaprire quella completata (evita duplicati).');
    }
    const rec = { ...task, status: 'open', updatedAt: nowIso() }; delete rec.completedAt;
    await t.put('tasks', rec); return rec;
  });
}

// ---------- pratiche / checklist ----------
export async function addChecklistItem(practiceId, data) {
  const existing = await listChecklist(practiceId);
  const rec = { ...asVal('checklist', { ...data, practiceId, order: (existing.at(-1)?.order ?? 0) + 1 }), id: uid(), createdAt: nowIso(), updatedAt: nowIso() };
  await db.run(['checklist', 'practices'], 'readwrite', async (t) => {
    if (!(await t.get('practices', practiceId))) throw new DomusError('NOT_FOUND', 'Pratica non trovata.');
    await t.put('checklist', rec);
  });
  return rec;
}
export async function setChecklistDone(id, done) {
  return db.run(['checklist', 'practices'], 'readwrite', async (t) => {
    const it = await t.get('checklist', id); if (!it) return;
    it.done = done; it.updatedAt = nowIso(); await t.put('checklist', it);
    const p = await t.get('practices', it.practiceId);
    if (p) { p.history = [...(p.history || []), { at: nowIso(), text: `${done ? 'Completato' : 'Riaperto'}: ${it.text}`.slice(0, 480) }].slice(-400); p.updatedAt = nowIso(); await t.put('practices', p); }
  });
}
export const removeChecklistItem = (id) => db.run(['checklist'], 'readwrite', (t) => t.del('checklist', id));
export async function addPracticeNote(id, text) {
  return db.run(['practices'], 'readwrite', async (t) => {
    const p = await t.get('practices', id); if (!p) throw new DomusError('NOT_FOUND', 'Pratica non trovata.');
    const s = String(text || '').trim().slice(0, 480); if (!s) return p;
    p.history = [...(p.history || []), { at: nowIso(), text: s }].slice(-400); p.updatedAt = nowIso(); await t.put('practices', p); return p;
  });
}

// ---------- manutenzioni ----------
export async function markMaintenanceDone(id, { date = todayStr(), cost, note } = {}) {
  return db.run(['maintenance'], 'readwrite', async (t) => {
    const m = await t.get('maintenance', id); if (!m) throw new DomusError('NOT_FOUND', 'Manutenzione non trovata.');
    const entry = { at: nowIso(), text: `Eseguita il ${date}${note ? ' — ' + note : ''}`.slice(0, 480) };
    if (Number.isFinite(cost) && cost >= 0) entry.cost = cost;
    m.history = [...(m.history || []), entry].slice(-400);
    if (!m.lastDone || date >= m.lastDone) m.lastDone = date;
    if (m.intervalMonths > 0) m.nextDue = addMonths(date, m.intervalMonths, dayOf(date));
    else if (m.kind === 'programmata') delete m.nextDue;
    m.updatedAt = nowIso(); await t.put('maintenance', m); return m;
  });
}

// ---------- pagamenti ----------
export async function registerPayment(parentType, parentId, { paidAt = todayStr(), amount, notes } = {}) {
  const store = parentType === 'utility' ? 'utilities' : 'contracts';
  return db.run([store, 'payments'], 'readwrite', async (t) => {
    const parent = await t.get(store, parentId); if (!parent) throw new DomusError('NOT_FOUND', 'Elemento non trovato.');
    const forDue = parent.nextDue || undefined;
    if (forDue) {
      const dup = (await t.byIndex('payments', 'parentId', parentId)).find((p) => p.forDue === forDue);
      if (dup) throw new DomusError('DUPLICATE', `Il pagamento con scadenza ${forDue} risulta già registrato.`);
    }
    const rec = { ...asVal('payments', { parentType, parentId, forDue, paidAt, amount: amount ?? parent.amount, notes }), id: uid(), createdAt: nowIso(), updatedAt: nowIso() };
    await t.put('payments', rec);
    const months = BILL_MONTHS[parent.billingFrequency];
    if (forDue && months) { parent.nextDue = addMonths(forDue, months, dayOf(forDue)); } else if (forDue) delete parent.nextDue;
    parent.updatedAt = nowIso(); await t.put(store, parent);
    return { payment: rec, parent };
  });
}

// ---------- documenti ----------
export async function importDocument(file, { categoryId, links = [], allowDuplicate = false } = {}) {
  if (file.size > MAX_FILE_BYTES) throw new DomusError('TOO_BIG', `Il file "${file.name}" supera il limite di ${MAX_FILE_BYTES / 1048576} MB.`);
  const buf = await file.arrayBuffer();
  const hash = await sha256(buf);
  if (!allowDuplicate) {
    const dup = (await snapshot()).documents.find((d) => d.sha256 === hash);
    if (dup) throw new DomusError('DUPLICATE', `Un file identico è già in archivio: "${dup.name}".`, { existing: dup });
  }
  const lm = file.lastModified ? new Date(file.lastModified) : new Date();
  const meta = {
    ...asVal('documents', { name: file.name || 'Documento', categoryId, date: todayStr(lm), size: file.size, mime: file.type || 'application/octet-stream', sha256: hash, hasBlob: true, exportState: 'none' }),
    id: uid(), createdAt: nowIso(), updatedAt: nowIso(),
  };
  await db.run([...STORES, 'blobs'], 'readwrite', async (t) => {
    await t.put('blobs', { buf, type: meta.mime, name: meta.name }, meta.id);   // ArrayBuffer: più affidabile dei Blob in IndexedDB su Safari
    await t.put('documents', meta);
    for (const l of links) {
      if (!(await t.get(STORE_OF[l.type], l.id))) continue;
      await t.put('relationships', { id: uid(), aType: l.type, aId: l.id, bType: 'document', bId: meta.id, createdAt: nowIso(), updatedAt: nowIso() });
    }
  });
  return meta;
}
export async function getDocumentBlob(id) {
  const b = await db.run(['blobs'], 'readonly', (t) => t.get('blobs', id));
  return b ? new Blob([b.buf], { type: b.type || 'application/octet-stream' }) : null;
}
export const hasBlobStored = async (id) => !!(await getDocumentBlob(id));
export async function markShared(id) { return update('documents', id, { exportState: 'shared', exportedAt: nowIso(), verifiedAt: '' }); }
/** Confronta un file scelto dall'utente (es. dalla cartella Domus in File) con l'hash del documento. */
export async function verifyDocumentFile(id, file) {
  const doc = await get('documents', id);
  if (!doc) throw new DomusError('NOT_FOUND', 'Documento non trovato.');
  const hash = await sha256(file);
  const ok = hash === doc.sha256;
  const rec = await update('documents', id, ok ? { exportState: 'verified', verifiedAt: nowIso(), externalName: file.name } : { exportState: 'mismatch', externalName: file.name });
  return { ok, doc: rec };
}

// ---------- audit / meta ----------
export async function audit(type, summary) {
  await db.run(['audit'], 'readwrite', async (t) => {
    await t.put('audit', { id: uid(), at: nowIso(), type, summary: String(summary).slice(0, 400), createdAt: nowIso(), updatedAt: nowIso() });
    const all = (await t.all('audit')).sort((a, b) => (a.at < b.at ? 1 : -1));
    for (const old of all.slice(300)) await t.del('audit', old.id);
  });
}
export const getMeta = db.getMeta;
export const setMeta = db.setMeta;

/** Riparazioni automatiche semplici per i problemi rilevati da integrity.js */
export async function applyFixes(issues) {
  let n = 0;
  await db.run([...STORES, 'blobs'], 'readwrite', async (t) => {
    for (const i of issues) {
      if (!i.fix) continue;
      if (i.fix.op === 'del') { await t.del(i.fix.store, i.fix.id); n++; }
      else if (i.fix.op === 'patch') { const r = await t.get(i.fix.store, i.fix.id); if (r) { Object.assign(r, i.fix.patch); r.updatedAt = nowIso(); await t.put(i.fix.store, r); n++; } }
      else if (i.fix.op === 'unset') { const r = await t.get(i.fix.store, i.fix.id); if (r) { delete r[i.fix.key]; r.updatedAt = nowIso(); await t.put(i.fix.store, r); n++; } }
    }
  });
  return n;
}
