// Spese: riepilogo per stato (preventivato / pagato / da pagare / non verificato), immobile, categoria e anno.
// Usa solo importi confermati o inseriti dall'utente. Distingue sempre ciò che è documentato da ciò che è pagato.
import { h, icon, money } from './h.js';
import * as repo from '../data/repo.js';
import { computeExpenses, BUCKETS } from '../lib/expenses.js';
import { row, card, empty, hrefOf, chips } from './common.js';
import { formatIT } from '../lib/dates.js';

let year = '', propertyId = '', categoryId = '';

export async function view(_p, ctx) {
  const snap = await repo.snapshot();
  const e = computeExpenses(snap, { year, propertyId, categoryId });
  const props = new Map(snap.properties.map((p) => [p.id, p.name])), cats = new Map(snap.categories.map((c) => [c.id, c.name]));
  const body = h('div');
  const sel = (label, value, items, set) => h('label', { class: 'field' }, label, h('select', { onchange: (ev) => { set(ev.target.value); ctx.refresh(); } }, h('option', { value: '' }, 'Tutti'), items.map(([v, l]) => h('option', { value: v, selected: v === value }, l))));
  body.append(h('div', { class: 'btn-row' }, sel('Anno', year, e.years.map((y) => [y, y]), (v) => { year = v; }), sel('Immobile', propertyId, [...props], (v) => { propertyId = v; }), sel('Categoria', categoryId, [...cats], (v) => { categoryId = v; })));
  if (!e.rows.length && !e.years.length) {
    body.append(empty('money', 'Nessuna spesa documentata', 'Importa fatture, ricevute o preventivi dall\'Archivio e conferma l\'importo totale: appariranno qui. Domus non conta importi solo "proposti".'));
    return { title: 'Spese', back: '#/more', body };
  }
  body.append(h('div', { class: 'card pad' }, h('table', { class: 'tbl' }, h('tbody', null,
    Object.entries(BUCKETS).map(([k, l]) => h('tr', null, h('th', { scope: 'row' }, l), h('td', { class: 'n' }, money(e.totals[k])))),
  ))));
  body.append(h('p', { class: 'muted small' }, '"Pagato" e "Da pagare" dipendono dallo stato che imposti sul documento. Un documento archiviato senza stato è "non verificato".'));
  if (e.noAmount) body.append(h('div', { class: 'banner', role: 'note' }, icon('alert', 20), h('div', null, h('b', null, `${e.noAmount} documenti senza importo confermato`), h('p', null, 'Fatture, ricevute, preventivi e bollette senza importo non sono inclusi nei totali.'))));
  if (e.duplicates.length) body.append(h('div', { class: 'banner', role: 'note' }, icon('alert', 20), h('div', null, h('b', null, `${e.duplicates.length} possibili duplicati esclusi`), ...e.duplicates.map((d) => h('p', null, h('a', { href: hrefOf('document', d.doc.id) }, d.doc.name), ` · ${d.reason}`)))));
  const group = (title, data, nameOf) => {
    const rows = Object.entries(data).filter(([, t]) => Object.values(t).some(Boolean));
    if (rows.length < 1) return null;
    return [h('h2', { class: 'sec' }, h('span', null, title)), h('div', { class: 'card pad' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, ''), h('th', { class: 'n' }, 'Pagato'), h('th', { class: 'n' }, 'Da pagare'), h('th', { class: 'n' }, 'Altro'))),
      h('tbody', null, rows.map(([k, t]) => h('tr', null, h('th', { scope: 'row' }, nameOf(k)), h('td', { class: 'n' }, money(t.paid)), h('td', { class: 'n' }, money(t.due)), h('td', { class: 'n' }, money(t.unverified + t.quote)))))))];
  };
  body.append(...[group('Per immobile', e.byProperty, (k) => props.get(k) || 'Senza immobile'), group('Per categoria', e.byCategory, (k) => cats.get(k) || 'Senza categoria'), group('Per anno', e.byYear, (k) => k)].filter(Boolean).flat());
  body.append(h('h2', { class: 'sec' }, h('span', null, `Documenti (${e.rows.length})`)), e.rows.length ? card([...e.rows].sort((a, b) => ((b.date || '') > (a.date || '') ? 1 : -1)).map((d) => row({ title: d.name, sub: [d.issuer, d.date ? formatIT(d.date) : ''].filter(Boolean).join(' · '), meta: money(d.amount), href: hrefOf('document', d.id) }))) : h('p', { class: 'muted' }, 'Nessun documento con questi filtri.'));
  return { title: 'Spese', back: '#/more', body };
}
