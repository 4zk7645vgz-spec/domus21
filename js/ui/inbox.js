// "Da sistemare": tutto ciò che richiede una decisione, in un'unica coda ordinata per priorità.
import { h } from './h.js';
import * as repo from '../data/repo.js';
import { buildInbox } from '../lib/inbox.js';
import { inboxList } from './widgets.js';
import { empty } from './common.js';
import { todayStr } from '../lib/dates.js';
import { pickAndImport } from './links.js';

export async function view(_p, ctx) {
  const items = buildInbox(await repo.snapshot(), todayStr());
  return { title: 'Da sistemare', back: '#/more', body: items.length
    ? h('div', null, h('p', { class: 'muted small' }, 'Ogni voce apre il documento. Dove Domus può creare o collegare qualcosa da dati che hai confermato, trovi un pulsante a un tocco: non fa nulla senza il tuo tocco.'), inboxList(items, ctx))
    : empty('check', 'Tutto a posto', 'Nessun documento da verificare e nessuna proposta in sospeso.', h('button', { class: 'btn primary', type: 'button', onclick: () => pickAndImport({ onDone: ctx.refresh }) }, 'Importa un documento')) };
}
