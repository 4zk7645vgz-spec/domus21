// Spese: totali per stato, grafici (mesi, categorie, immobili, stato) e documenti. Usa solo importi confermati o inseriti da te.
// Distingue sempre ciò che è documentato da ciò che è pagato. I filtri si combinano; ogni riga apre il documento.
import { h, icon, money } from './h.js';
import * as repo from '../data/repo.js';
import { computeExpenses } from '../lib/expenses.js';
import { monthlySpend, spendByCategory, spendByState } from '../lib/stats.js';
import { row, card, empty, hrefOf } from './common.js';
import { kpi } from './widgets.js';
import { stackedBars, hBars, donut } from './charts.js';
import { formatIT, todayStr } from '../lib/dates.js';

let year = '', propertyId = '', categoryId = '';

export async function view(_p, ctx) {
  const snap = await repo.snapshot(); const today = todayStr();
  const e = computeExpenses(snap, { year, propertyId, categoryId });
  const props = new Map(snap.properties.map((p) => [p.id, p.name])), cats = new Map(snap.categories.map((c) => [c.id, c.name]));
  const body = h('div');
  const sel = (label, value, items, set) => h('label', null, label, h('select', { onchange: (ev) => { set(ev.target.value); ctx.refresh(); } }, h('option', { value: '' }, 'Tutti'), items.map(([v, l]) => h('option', { value: v, selected: v === value }, l))));
  if (!e.rows.length && !e.years.length) return { title: 'Spese', back: '#/more', body: empty('chart', 'Nessuna spesa documentata', 'Importa fatture, bollette, ricevute o preventivi: quando l\'importo totale è confermato (o lo confermi tu) compare qui con grafici e totali. Domus non conta importi solo "proposti".') };
  body.append(h('div', { class: 'filters' }, sel('Anno', year, e.years.map((y) => [y, y]), (v) => { year = v; }), sel('Immobile', propertyId, [...props], (v) => { propertyId = v; }), sel('Categoria', categoryId, [...cats], (v) => { categoryId = v; })));
  const t = e.totals; const fsnap = { ...snap, documents: e.rows };
  body.append(h('div', { class: 'kpis' },
    kpi({ ic: 'check', label: 'Pagato', value: money(t.paid), href: '#/expenses', tone: 'ok' }),
    kpi({ ic: 'money', label: 'Da pagare', value: money(t.due), href: '#/inbox', tone: t.due ? 'warn' : '' }),
    kpi({ ic: 'info', label: 'Non verificato', value: money(t.unverified), sub: 'archiviato, stato da indicare', href: '#/archive' }),
    kpi({ ic: 'doc', label: 'Preventivato', value: money(t.quote), sub: 'non conteggiato nella spesa', href: '#/archive' })));
  const months = monthlySpend(fsnap, today, 12);
  if (months.some((m) => m.total > 0)) body.append(stackedBars({ title: 'Ultimi 12 mesi', rows: months.map((m) => ({ label: m.label, year: m.year, a: m.paid, b: m.other })), aLabel: 'Pagato', bLabel: 'Da pagare / non verificato' }));
  const byCat = spendByCategory(fsnap, year || undefined); if (byCat.length) body.append(hBars({ title: 'Per categoria', items: byCat }));
  const byProp = Object.entries(e.byProperty).map(([k, v]) => ({ label: props.get(k) || 'Senza immobile', value: Math.round((v.paid + v.due + v.unverified) * 100) / 100 })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  if (byProp.length) body.append(hBars({ title: 'Per immobile', items: byProp }));
  const st = spendByState(fsnap, year || undefined);
  if (st.paid + st.due + st.unverified > 0) body.append(donut({ title: 'Stato delle spese', items: [{ label: 'Pagato', value: st.paid }, { label: 'Da pagare', value: st.due }, { label: 'Non verificato', value: st.unverified }].filter((x) => x.value > 0) }));
  if (e.noAmount) body.append(h('div', { class: 'banner', role: 'note' }, icon('alert', 20), h('div', null, h('b', null, `${e.noAmount} documenti senza importo confermato`), h('p', null, 'Fatture, ricevute, preventivi e bollette senza importo non sono inclusi nei totali.'), h('a', { class: 'btn', href: '#/inbox' }, 'Vai a "Da sistemare"'))));
  if (e.duplicates.length) body.append(h('div', { class: 'banner', role: 'note' }, icon('alert', 20), h('div', null, h('b', null, `${e.duplicates.length} possibili duplicati esclusi`), ...e.duplicates.map((d) => h('p', null, h('a', { href: hrefOf('document', d.doc.id) }, d.doc.name), ` · ${d.reason}`)))));
  body.append(h('h2', { class: 'sec' }, h('span', null, `Documenti (${e.rows.length})`)), e.rows.length ? card([...e.rows].sort((a, b) => ((b.date || '') > (a.date || '') ? 1 : -1)).map((d) => row({ title: d.name, sub: [d.issuer, d.date ? formatIT(d.date) : '', { paid: 'pagato', due: 'da pagare' }[d.payState]].filter(Boolean).join(' · '), meta: money(d.amount), href: hrefOf('document', d.id) }))) : h('p', { class: 'muted' }, 'Nessun documento con questi filtri.'));
  return { title: 'Spese', back: '#/more', body };
}
