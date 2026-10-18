import { h, icon, clear } from './h.js';
import * as repo from '../data/repo.js';
import { buildIndex, query } from '../lib/search.js';
import { row, card, empty, hrefOf, ICON_OF } from './common.js';
import { TYPE_LABEL } from '../data/schema.js';

export async function view(params, ctx) {
  const index = buildIndex(await repo.snapshot());
  const input = h('input', { class: 'search-in', type: 'search', placeholder: 'Cerca attività, documenti, pratiche, contatti…', 'aria-label': 'Ricerca globale', value: params.q || '', autofocus: true });
  const out = h('div', { 'aria-live': 'polite' });
  const draw = () => {
    clear(out);
    const res = query(index, input.value);
    if (!input.value.trim()) { out.append(h('p', { class: 'muted' }, 'Cerca in attività, pratiche, documenti, contatti, contratti, utenze, manutenzioni e immobili.')); return; }
    if (!res.length) { out.append(empty('search', 'Nessun risultato', `Nessun elemento corrisponde a "${input.value}".`)); return; }
    out.append(h('p', { class: 'muted small' }, `${res.length} risultati`), card(res.map((r) => row({ title: r.title, sub: [TYPE_LABEL[r.type], r.sub].filter(Boolean).join(' · '), lead: h('span', { class: 'row-lead' }, icon(ICON_OF[r.type], 20)), href: hrefOf(r.type, r.id) }))));
  };
  input.addEventListener('input', draw); draw();
  queueMicrotask(() => input.focus());
  return { title: 'Cerca', body: h('div', null, input, out), back: '#/today' };
}
