// Grafici SVG accessibili, senza librerie e senza stili inline (CSP). Ogni grafico ha titolo, descrizione e tabella alternativa.
import { h, svg } from './h.js';
import { money } from './h.js';

const fmtK = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',')}k` : String(Math.round(n)));
const altTable = (title, head, rows) => h('details', { class: 'chart-data' }, h('summary', null, 'Mostra i dati'), h('table', { class: 'tbl' }, h('caption', { class: 'sr-only' }, title), h('thead', null, h('tr', null, head.map((c, i) => h('th', { class: i ? 'n' : '' }, c)))), h('tbody', null, rows.map((r) => h('tr', null, r.map((c, i) => h(i ? 'td' : 'th', { class: i ? 'n' : '', scope: i ? null : 'row' }, c)))))));

/** Barre verticali impilate: rows [{label, a, b}] (a = pagato, b = altro). */
export function stackedBars({ title, rows, aLabel = 'Pagato', bLabel = 'Altro' }) {
  const W = 340, H = 170, pl = 6, pr = 6, pt = 14, pb = 24; const max = Math.max(1, ...rows.map((r) => r.a + r.b));
  const bw = (W - pl - pr) / rows.length; const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const bars = rows.flatMap((r, i) => { const x = pl + i * bw + bw * 0.16, w = bw * 0.68; return [
    svg('rect', { class: 's1', x, y: y(r.a), width: w, height: Math.max(0, y(0) - y(r.a)), rx: 2 }),
    svg('rect', { class: 's2', x, y: y(r.a + r.b), width: w, height: Math.max(0, y(r.a) - y(r.a + r.b)), rx: 2 }),
    svg('text', { class: 'ax', x: x + w / 2, y: H - 8, 'text-anchor': 'middle' }, r.label),
    r.a + r.b > 0 && r.a + r.b === max ? svg('text', { class: 'ax val', x: x + w / 2, y: y(r.a + r.b) - 4, 'text-anchor': 'middle' }, fmtK(r.a + r.b)) : null]; });
  const total = rows.reduce((s, r) => s + r.a + r.b, 0);
  return h('figure', { class: 'chart' },
    h('figcaption', null, title), svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${title}. Totale ${money(total)}.`, class: 'chart-svg' }, svg('line', { class: 'ax-line', x1: pl, x2: W - pr, y1: y(0), y2: y(0) }), bars),
    h('div', { class: 'legend' }, h('span', null, h('i', { class: 'sw s1' }), aLabel), h('span', null, h('i', { class: 'sw s2' }), bLabel)),
    altTable(title, ['Mese', aLabel, bLabel], rows.map((r) => [`${r.label} ${r.year || ''}`.trim(), money(r.a), money(r.b)])));
}

/** Barre orizzontali: items [{label, value}] */
export function hBars({ title, items, max = 6 }) {
  const list = items.slice(0, max); const top = Math.max(1, ...list.map((i) => i.value));
  return h('figure', { class: 'chart' }, h('figcaption', null, title), h('div', { class: 'hbars', role: 'list' }, list.map((i, n) => {
    const fill = h('i', { class: `d${(n % 4) + 1}` }); fill.style.width = `${Math.max(3, (i.value / top) * 100)}%`;
    return h('div', { class: 'hbar', role: 'listitem' }, h('span', { class: 'hbar-l' }, i.label), h('span', { class: 'hbar-v' }, money(i.value)), h('span', { class: 'hbar-t', 'aria-hidden': 'true' }, fill));
  })), altTable(title, ['Voce', 'Importo'], items.map((i) => [i.label, money(i.value)])));
}

/** Ciambella: items [{label, value}] con totale al centro. */
export function donut({ title, items, center }) {
  const total = items.reduce((s, i) => s + i.value, 0); const R = 42, C = 2 * Math.PI * R; let off = 0;
  const arcs = total > 0 ? items.filter((i) => i.value > 0).map((i, n) => { const len = (i.value / total) * C; const a = svg('circle', { class: `dn d${(n % 4) + 1}`, cx: 60, cy: 60, r: R, fill: 'none', 'stroke-width': 16, 'stroke-dasharray': `${len} ${C - len}`, 'stroke-dashoffset': -off, transform: 'rotate(-90 60 60)' }); off += len; return a; }) : [svg('circle', { class: 'dn-empty', cx: 60, cy: 60, r: R, fill: 'none', 'stroke-width': 16 })];
  return h('figure', { class: 'chart donut' }, h('figcaption', null, title), h('div', { class: 'donut-row' },
    svg('svg', { viewBox: '0 0 120 120', role: 'img', 'aria-label': `${title}. Totale ${money(total)}.`, class: 'donut-svg' }, arcs, svg('text', { class: 'ctr', x: 60, y: 64, 'text-anchor': 'middle' }, center ?? money(total))),
    h('ul', { class: 'legend v' }, items.map((i, n) => h('li', null, h('i', { class: `sw d${(n % 4) + 1}` }), h('span', null, i.label), h('b', null, money(i.value)))))));
}
