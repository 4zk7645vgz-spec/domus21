import { h, icon } from './h.js';
import { row, card } from './common.js';

export async function view() {
  const item = (ic, title, sub, href) => row({ title, sub, href, lead: h('span', { class: 'row-lead' }, icon(ic, 22)) });
  return { title: 'Altro', body: h('div', null, card([
    item('house', 'Casa', 'Immobili, manutenzioni, interventi, garanzie', '#/home'),
    item('money', 'Spese', 'Preventivato, fatturato, pagato, da pagare', '#/expenses'),
    item('money', 'Utenze e contratti', 'Fornitori, scadenze, pagamenti, rinnovi', '#/money'),
    item('contact', 'Contatti', 'Tecnici, artigiani, enti, professionisti', '#/contacts'),
    item('settings', 'Impostazioni', 'Backup, storage, categorie, diagnostica', '#/settings'),
  ])) };
}
