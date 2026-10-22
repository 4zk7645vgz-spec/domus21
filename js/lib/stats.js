// Statistiche e scadenziario unificato. Funzioni PURE (snapshot, oggi) → dati. Nessun dato inventato:
// ogni voce nasce da un record reale e porta con sé tipo e id per aprire l'elemento d'origine.
import { addDays, cmp, diffDays, parseDate } from './dates.js';
import { findRelated } from './extract.js';
import { bucketOf, yearOf } from './expenses.js';

export const DEADLINE_LABEL = { task: 'Attività', document: 'Documento', utility: 'Pagamento utenza', contract: 'Contratto', maintenance: 'Manutenzione', warranty: 'Garanzia', notice: 'Disdetta', checklist: 'Pratica' };

/** Tutte le scadenze datate, ordinate. `propertyId` filtra per immobile. */
export function collectDeadlines(snap, today, { propertyId, until } = {}) {
  const out = [];
  const add = (kind, type, rec, title, date, o = {}) => { if (!date) return; if (propertyId && rec.propertyId !== propertyId) return; if (until && cmp(date, until) > 0) return; out.push({ kind, type, id: rec.id, title, date, days: diffDays(date, today), overdue: cmp(date, today) < 0, ...o }); };
  const taskDocDue = new Set();
  const byId = new Map((snap.tasks || []).map((t) => [t.id, t]));
  for (const r of snap.relationships || []) {
    const [a, b] = [[r.aType, r.aId], [r.bType, r.bId]];
    const t = a[0] === 'task' ? byId.get(a[1]) : b[0] === 'task' ? byId.get(b[1]) : null; const d = a[0] === 'document' ? a[1] : b[0] === 'document' ? b[1] : null;
    if (t && d && t.status === 'open' && t.due) taskDocDue.add(`${d}:${t.due}`);
  }
  for (const t of snap.tasks || []) if (t.status === 'open') add('task', 'task', t, t.title, t.due, { sub: t.priority === 'high' ? 'Priorità alta' : '' });
  for (const d of snap.documents || []) if (d.expires && !taskDocDue.has(`${d.id}:${d.expires}`)) add('document', 'document', d, d.name, d.expires, { sub: d.issuer || '', amount: d.payState === 'unpaid' ? d.amount : undefined, unpaid: d.payState === 'unpaid' });
  for (const u of snap.utilities || []) if (u.active !== false) add('utility', 'utility', u, u.name, u.nextDue, { sub: u.provider || '', amount: u.amount });
  for (const c of snap.contracts || []) if (c.active !== false) {
    add('contract', 'contract', c, c.title, c.nextDue, { sub: c.counterparty || '', amount: c.amount });
    add('contract', 'contract', c, `${c.autoRenew ? 'Rinnovo' : 'Scadenza'}: ${c.title}`, c.endDate, { sub: c.counterparty || '' });
    if (c.endDate && c.noticeDays && c.autoRenew) add('notice', 'contract', c, `Ultimo giorno per disdire: ${c.title}`, addDays(c.endDate, -c.noticeDays), { sub: `preavviso ${c.noticeDays} giorni` });
  }
  for (const m of snap.maintenance || []) { add('maintenance', 'maintenance', m, m.title, m.nextDue); if (m.kind === 'garanzia' || m.warrantyEnd) add('warranty', 'maintenance', m, `Fine garanzia: ${m.title}`, m.warrantyEnd); }
  const pr = new Map((snap.practices || []).map((p) => [p.id, p]));
  for (const c of snap.checklist || []) if (!c.done && c.due) { const p = pr.get(c.practiceId); if (p && p.status !== 'closed' && p.status !== 'archived' && (!propertyId || p.propertyId === propertyId) && (!until || cmp(c.due, until) <= 0)) out.push({ kind: 'checklist', type: 'practice', id: p.id, title: c.text, sub: p.title, date: c.due, days: diffDays(c.due, today), overdue: cmp(c.due, today) < 0 }); }
  return out.sort((a, b) => cmp(a.date, b.date) || a.title.localeCompare(b.title, 'it'));
}

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const ymAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number); const t = y * 12 + m - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };

/** Documenti con importo, senza duplicati. */
export function spendDocs(snap) {
  const docs = (snap.documents || []).slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  return docs.filter((d) => d.amount != null && !findRelated(d, docs).some((r) => r.doc.createdAt < d.createdAt || (r.doc.createdAt === d.createdAt && r.doc.id < d.id)));
}

/** Spesa degli ultimi `months` mesi (esclusi i preventivi): [{key,label,total,paid,other}] */
export function monthlySpend(snap, today, months = 12) {
  const end = today.slice(0, 7); const keys = Array.from({ length: months }, (_, i) => ymAdd(end, i - months + 1));
  const rows = keys.map((key) => ({ key, label: MESI[+key.slice(5) - 1], year: key.slice(0, 4), total: 0, paid: 0, other: 0 }));
  const idx = new Map(rows.map((r) => [r.key, r]));
  for (const d of spendDocs(snap)) {
    if (bucketOf(d) === 'quote') continue; const r = idx.get((d.date || d.createdAt || '').slice(0, 7)); if (!r) continue;
    r.total += d.amount; if (bucketOf(d) === 'paid') r.paid += d.amount; else r.other += d.amount;
  }
  for (const r of rows) { r.total = Math.round(r.total * 100) / 100; r.paid = Math.round(r.paid * 100) / 100; r.other = Math.round(r.other * 100) / 100; }
  return rows;
}

/** Spesa per categoria (anno opzionale), esclusi i preventivi, ordinata per importo. */
export function spendByCategory(snap, year) {
  const cats = new Map((snap.categories || []).map((c) => [c.id, c.name])); const m = new Map();
  for (const d of spendDocs(snap)) { if (bucketOf(d) === 'quote' || (year && yearOf(d) !== String(year))) continue; const k = cats.get(d.categoryId) || 'Senza categoria'; m.set(k, (m.get(k) || 0) + d.amount); }
  return [...m].map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value);
}

/** Spesa dell'anno per stato, esclusi i preventivi. */
export function spendByState(snap, year) {
  const t = { paid: 0, due: 0, unverified: 0, quote: 0 };
  for (const d of spendDocs(snap)) if (!year || yearOf(d) === String(year)) t[bucketOf(d)] += d.amount;
  return t;
}

/** Griglia del mese (settimane da lunedì): [{date, inMonth}] */
export function monthGrid(ym) {
  const first = `${ym}-01`; const p = parseDate(first); const dow = (new Date(Date.UTC(p.y, p.m - 1, 1)).getUTCDay() + 6) % 7;
  const start = addDays(first, -dow); const cells = [];
  for (let i = 0; i < 42; i++) { const date = addDays(start, i); cells.push({ date, inMonth: date.slice(0, 7) === ym }); }
  const last = cells.map((c) => c.inMonth).lastIndexOf(true);
  return cells.slice(0, Math.ceil((last + 1) / 7) * 7);
}
export { ymAdd, MESI };
