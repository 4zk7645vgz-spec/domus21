// "Altro": hub delle sezioni, con tessere e contatori reali.
import { h, icon } from './h.js';
import * as repo from '../data/repo.js';
import { buildInbox } from '../lib/inbox.js';
import { collectDeadlines } from '../lib/stats.js';
import { supplierList } from '../lib/suppliers.js';
import { todayStr, addDays } from '../lib/dates.js';

export async function view() {
  const snap = await repo.snapshot(); const today = todayStr();
  const inbox = buildInbox(snap, today).length; const dl = collectDeadlines(snap, today, { until: addDays(today, 30) }).length;
  const T = (ic, title, sub, href, badge) => h('a', { class: 'tile', href }, h('span', { class: 't-ic' }, icon(ic, 22)), h('b', null, title), h('span', { class: 't-sub' }, sub), badge ? h('span', { class: 'badge accent' }, badge) : null);
  return { title: 'Sezioni', body: h('div', { class: 'tiles' },
    T('inbox', 'Da sistemare', 'Verifiche e proposte', '#/inbox', inbox ? String(inbox) : ''),
    T('calendar', 'Calendario', 'Tutte le scadenze', '#/calendar', dl ? `${dl} in 30 gg` : ''),
    T('chart', 'Spese', 'Grafici e totali', '#/expenses'),
    T('building', 'Fornitori', `${supplierList(snap).length} dai documenti`, '#/suppliers'),
    T('house', 'Casa', 'Immobili e manutenzioni', '#/home'),
    T('bolt', 'Utenze e contratti', 'Pagamenti e rinnovi', '#/money'),
    T('contact', 'Contatti', 'Tecnici e professionisti', '#/contacts'),
    T('settings', 'Impostazioni', 'Backup e sicurezza', '#/settings')) };
}
