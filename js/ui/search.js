import { h, icon, clear } from './h.js';
import * as repo from '../data/repo.js';
import { buildIndex, query } from '../lib/search.js';
import { row, card, empty, hrefOf, ICON_OF } from './common.js';
import { TYPE_LABEL } from '../data/schema.js';
import { answer, CAPABILITIES } from '../lib/ask.js';
import { todayStr } from '../lib/dates.js';

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
  // "Chiedi a Domus": risposte calcolate sui dati registrati, con fonti. Non è un modello linguistico.
  const snapP = repo.snapshot();
  const ask = h('input', { class: 'search-in', type: 'text', placeholder: 'Es.: quanto ho speso nel 2026?', 'aria-label': 'Fai una domanda ai tuoi dati', enterkeyhint: 'send' });
  const ans = h('div', { 'aria-live': 'polite' });
  const go = async () => {
    clear(ans); const snap = await snapP; const r = answer(ask.value, snap, todayStr());
    ans.append(h('div', { class: 'card pad ask-answer' }, r.lines.join('\n')),
      r.sources.length ? h('div', null, h('p', { class: 'muted small' }, 'Fonti'), card(r.sources.map((s) => row({ title: s.title, sub: s.note, lead: h('span', { class: 'row-lead' }, icon(ICON_OF[s.type], 20)), href: hrefOf(s.type, s.id) })))) : null);
  };
  ask.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  const askBox = h('div', null, h('h2', { class: 'sec' }, h('span', null, 'Chiedi a Domus')), ask, h('button', { class: 'btn', type: 'button', onclick: go }, 'Chiedi'), h('p', { class: 'muted small' }, `Risponde solo con dati registrati e confermati, citando i documenti. Non è un'IA: capisce domande su ${CAPABILITIES}.`), ans);
  return { title: 'Cerca', body: h('div', null, input, out, askBox), back: '#/today' };
}
