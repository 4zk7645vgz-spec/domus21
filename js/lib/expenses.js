// Riepilogo economico dai documenti. Funzione pura. Conta SOLO importi presenti nei campi del documento, cioè
// confermati/corretti dall'utente o inseriti a mano (mai importi solo "proposti"). Non considera pagato ciò che è solo archiviato.
import { findRelated } from './extract.js';

export const BUCKETS = { quote: 'Preventivato', paid: 'Pagato', due: 'Da pagare', unverified: 'Fatturato, pagamento non verificato' };
export const bucketOf = (d) => (d.docKind === 'preventivo' ? 'quote' : d.payState === 'paid' ? 'paid' : d.payState === 'unpaid' ? 'due' : 'unverified');
export const yearOf = (d) => (d.date || d.createdAt || '').slice(0, 4);

/** @returns {{rows:object[], totals:Record<string,number>, byProperty:object, byCategory:object, byYear:object, duplicates:object[], noAmount:number}} */
export function computeExpenses(snap, { year, propertyId, categoryId } = {}) {
  const docs = (snap.documents || []).slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const dupIds = new Set(), duplicates = [];
  for (const d of docs) {
    const rel = findRelated(d, docs).filter((r) => r.doc.createdAt < d.createdAt || (r.doc.createdAt === d.createdAt && r.doc.id < d.id));
    if (rel.length) { dupIds.add(d.id); duplicates.push({ doc: d, of: rel[0].doc, reason: rel[0].reason }); }
  }
  const withAmount = docs.filter((d) => d.amount != null && !dupIds.has(d.id));
  const rows = withAmount.filter((d) => (!year || yearOf(d) === String(year)) && (!propertyId || d.propertyId === propertyId) && (!categoryId || d.categoryId === categoryId));
  const sum = (list) => { const t = { quote: 0, paid: 0, due: 0, unverified: 0 }; for (const d of list) t[bucketOf(d)] += d.amount; for (const k in t) t[k] = Math.round(t[k] * 100) / 100; return t; };
  const group = (keyFn) => { const m = {}; for (const d of rows) (m[keyFn(d) || '—'] ||= []).push(d); return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, sum(v)])); };
  return {
    rows, totals: sum(rows), byProperty: group((d) => d.propertyId), byCategory: group((d) => d.categoryId), byYear: group(yearOf), duplicates,
    years: [...new Set(withAmount.map(yearOf))].sort().reverse(),
    noAmount: docs.filter((d) => ['fattura', 'ricevuta', 'preventivo', 'bolletta'].includes(d.docKind) && d.amount == null).length,
  };
}
