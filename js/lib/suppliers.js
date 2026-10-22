// Fornitori ricavati dai documenti (nessuna anagrafica duplicata): raggruppati per partita IVA (se presente) o per nome normalizzato.
import { norm } from './search.js';
import { bucketOf } from './expenses.js';
import { spendDocs } from './stats.js';

const vatOf = (d) => (d.fields || []).find((f) => f.key === 'issuerVat' && f.status !== 'rejected')?.value || '';
export const supplierKey = (d) => (d.issuer ? (vatOf(d) ? `iva-${vatOf(d)}` : `n-${norm(d.issuer).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`) : '');

/** @returns {{key,name,vat,docs,total,paid,due,unverified,last}[]} ordinati per spesa decrescente */
export function supplierList(snap) {
  const counted = new Set(spendDocs(snap).map((d) => d.id)); const m = new Map();
  for (const d of snap.documents || []) {
    const key = supplierKey(d); if (!key) continue;
    const s = m.get(key) || { key, name: d.issuer, vat: vatOf(d), docs: [], total: 0, paid: 0, due: 0, unverified: 0, last: '' };
    s.docs.push(d); if ((d.date || '') >= s.last) { s.last = d.date || ''; s.name = d.issuer; }
    if (d.amount != null && counted.has(d.id) && d.docKind !== 'preventivo') { const b = bucketOf(d); s.total += d.amount; s[b === 'quote' ? 'unverified' : b] += d.amount; }
    m.set(key, s);
  }
  const r = (n) => Math.round(n * 100) / 100;
  return [...m.values()].map((s) => ({ ...s, total: r(s.total), paid: r(s.paid), due: r(s.due), unverified: r(s.unverified) })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'it'));
}
