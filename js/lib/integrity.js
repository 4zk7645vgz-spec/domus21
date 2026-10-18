import { STORE_OF, TYPE_LABEL } from '../data/schema.js';
import { sanitize } from '../data/schema.js';

/**
 * Verifica coerenza dei dati. `blobIds`: Set degli id con file presente nello storage della PWA.
 * Restituisce [{severity:'error'|'warn', msg, fix?}] — `fix` descrive una riparazione sicura e non distruttiva
 * (mai la cancellazione di documenti o file).
 */
export function checkIntegrity(snap, blobIds = new Set()) {
  const issues = [];
  const ids = {}; for (const [t, s] of Object.entries(STORE_OF)) ids[t] = new Set((snap[s] || []).map((r) => r.id));
  const add = (severity, msg, fix) => issues.push({ severity, msg, fix });

  for (const r of snap.relationships || []) {
    if (!ids[r.aType]?.has(r.aId) || !ids[r.bType]?.has(r.bId)) add('warn', `Collegamento orfano (${TYPE_LABEL[r.aType]} ↔ ${TYPE_LABEL[r.bType]})`, { op: 'del', store: 'relationships', id: r.id });
  }
  const practiceIds = ids.practice;
  for (const c of snap.checklist || []) if (!practiceIds.has(c.practiceId)) add('warn', `Voce di checklist senza pratica: ${c.text}`, { op: 'del', store: 'checklist', id: c.id });
  for (const p of snap.payments || []) {
    const ok = p.parentType === 'utility' ? ids.utility.has(p.parentId) : ids.contract.has(p.parentId);
    if (!ok) add('warn', 'Pagamento senza utenza/contratto', { op: 'del', store: 'payments', id: p.id });
  }
  const catIds = new Set((snap.categories || []).map((c) => c.id));
  const refCheck = (store, key, set, label) => { for (const r of snap[store] || []) if (r[key] && !set.has(r[key])) add('warn', `${label} inesistente in "${r.title || r.name}"`, { op: 'unset', store, id: r.id, key }); };
  for (const s of ['tasks', 'practices', 'documents']) refCheck(s, 'categoryId', catIds, 'Categoria');
  for (const s of ['tasks', 'practices', 'maintenance', 'utilities', 'contracts']) refCheck(s, 'propertyId', ids.property, 'Immobile');
  refCheck('maintenance', 'contactId', ids.contact, 'Contatto');

  for (const d of snap.documents || []) {
    const has = blobIds.has(d.id);
    if (d.hasBlob && !has) add('error', `File mancante nella PWA: "${d.name}" (metadati presenti, contenuto assente)`, { op: 'patch', store: 'documents', id: d.id, patch: { hasBlob: false } });
    if (!d.hasBlob && has) add('warn', `File presente ma non indicato: "${d.name}"`, { op: 'patch', store: 'documents', id: d.id, patch: { hasBlob: true } });
  }
  const docIds = ids.document;
  for (const b of blobIds) if (!docIds.has(b)) add('warn', `File orfano nello storage (senza documento): ${String(b).slice(0, 8)}…`);

  const open = new Map();
  for (const t of snap.tasks || []) {
    if (t.recurrence && !t.due) add('error', `Attività ricorrente senza scadenza: ${t.title}`);
    if (t.seriesId && t.status === 'open') { open.set(t.seriesId, (open.get(t.seriesId) || []).concat(t)); }
  }
  for (const [, list] of open) if (list.length > 1) add('error', `Occorrenze aperte duplicate per "${list[0].title}" (${list.length})`);

  for (const [store, list] of Object.entries(snap)) {
    if (!['tasks', 'practices', 'documents', 'properties', 'maintenance', 'utilities', 'contracts', 'contacts'].includes(store)) continue;
    for (const r of list) { const { errors } = sanitize(store, r, { meta: true }); if (errors.length) add('error', `Record non valido in ${store}: ${r.title || r.name || r.id}`); }
  }
  return issues;
}
