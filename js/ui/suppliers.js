// Fornitori: elenco aggregato dai documenti e scheda con storico e totali.
import { h, icon, money } from './h.js';
import * as repo from '../data/repo.js';
import { supplierList } from '../lib/suppliers.js';
import { row, card, empty, kv, hrefOf } from './common.js';
import { formatIT } from '../lib/dates.js';

export async function listView() {
  const list = supplierList(await repo.snapshot());
  return { title: 'Fornitori', back: '#/more', body: list.length ? card(list.map((s) => row({ title: s.name, sub: [`${s.docs.length} document${s.docs.length === 1 ? 'o' : 'i'}`, s.last ? `ultimo ${formatIT(s.last)}` : ''].filter(Boolean).join(' · '), meta: s.total ? money(s.total) : '', href: `#/suppliers/${encodeURIComponent(s.key)}`, lead: h('span', { class: 'row-lead' }, icon('building', 22)) })))
    : empty('contact', 'Nessun fornitore', 'Compaiono da soli quando confermi l\'emittente di un documento.') };
}
export async function detailView([key]) {
  const s = supplierList(await repo.snapshot()).find((x) => x.key === key);
  if (!s) return { title: 'Fornitore', back: '#/suppliers', body: empty('alert', 'Fornitore non trovato', 'Potrebbe non avere più documenti.') };
  return { title: s.name, small: true, back: '#/suppliers', body: h('div', null,
    h('div', { class: 'card pad' }, kv([['Partita IVA', s.vat], ['Documenti', String(s.docs.length)], ['Pagato', money(s.paid)], ['Da pagare', money(s.due)], ['Non verificato', money(s.unverified)], ['Totale', money(s.total)]])),
    h('h2', { class: 'sec' }, h('span', null, 'Documenti')),
    card([...s.docs].sort((a, b) => ((b.date || '') > (a.date || '') ? 1 : -1)).map((d) => row({ title: d.name, sub: [d.docKind !== 'nd' ? d.docKind : '', d.date ? formatIT(d.date) : ''].filter(Boolean).join(' · '), meta: d.amount != null ? money(d.amount) : '', href: hrefOf('document', d.id) })))) };
}
