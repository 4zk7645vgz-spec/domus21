export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Costruisce un indice in memoria a partire dallo snapshot dei dati (volumi personali: migliaia di record al massimo). */
export function buildIndex(snap) {
  const items = [];
  const add = (type, r, title, sub, extra) => items.push({ type, id: r.id, title: title || '(senza titolo)', sub: sub || '', t: norm(title), text: norm([title, sub, ...extra].join(' ')) });
  const tag = (r) => (r.tagIds || []).map((id) => snap.tags?.find((t) => t.id === id)?.name || '');
  for (const r of snap.tasks || []) add('task', r, r.title, r.status === 'done' ? 'Completata' : r.due || 'Senza scadenza', [r.description, r.notes, ...tag(r)]);
  for (const r of snap.practices || []) add('practice', r, r.title, r.entity || r.kind, [r.kind, r.entity, r.notes, r.references]);
  for (const r of snap.documents || []) add('document', r, r.name, r.date || '', [r.notes, r.externalName, ...tag(r)]);
  for (const r of snap.contacts || []) add('contact', r, r.name, [r.role, r.company].filter(Boolean).join(' · '), [r.company, r.role, r.phone, r.email, r.notes]);
  for (const r of snap.contracts || []) add('contract', r, r.title, r.counterparty, [r.counterparty, r.kind, r.notes]);
  for (const r of snap.utilities || []) add('utility', r, r.name, r.provider, [r.provider, r.serviceType, r.reference, r.notes]);
  for (const r of snap.maintenance || []) add('maintenance', r, r.title, r.nextDue || r.kind, [r.room, r.notes]);
  for (const r of snap.properties || []) add('property', r, r.name, r.address, [r.address, r.rooms, r.notes]);
  return items;
}
/** Tutti i termini devono comparire (AND); punteggio: titolo esatto > prefisso > parola > altrove. */
export function query(index, q, limit = 60) {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const out = [];
  for (const it of index) {
    let score = 0, ok = true;
    for (const t of terms) {
      if (!it.text.includes(t)) { ok = false; break; }
      if (it.t === t) score += 10; else if (it.t.startsWith(t)) score += 6; else if (it.t.includes(' ' + t)) score += 4; else if (it.t.includes(t)) score += 3; else score += 1;
    }
    if (ok) out.push({ ...it, score });
  }
  return out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'it')).slice(0, limit);
}
