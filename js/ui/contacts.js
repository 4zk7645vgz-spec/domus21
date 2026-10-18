import { h, icon } from './h.js';
import * as repo from '../data/repo.js';
import { row, card, empty, kv, labelOf, nav } from './common.js';
import { editEntity, confirmDialog, toast } from './kit.js';
import { linksPanel } from './links.js';
import { norm } from '../lib/search.js';

let q = '';
const add = (ctx) => editEntity({ store: 'contacts', title: 'Nuovo contatto' }).then((c) => { if (c) { toast('Contatto salvato', 'ok'); ctx.refresh(); } });
export async function listView(_p, ctx) {
  const snap = await repo.snapshot();
  const items = snap.contacts.filter((c) => !q || norm(`${c.name} ${c.company || ''} ${c.role}`).includes(norm(q))).sort((a, b) => a.name.localeCompare(b.name, 'it'));
  const input = h('input', { class: 'search-in', type: 'search', placeholder: 'Cerca contatti', value: q, 'aria-label': 'Cerca contatti', onchange: (e) => { q = e.target.value; ctx.refresh(); } });
  const body = h('div', null, snap.contacts.length ? input : null, items.length ? card(items.map((c) => row({ title: c.name, sub: [labelOf('contacts', 'role', c.role), c.company].filter(Boolean).join(' · '), href: `#/contacts/${c.id}` })))
    : empty('contact', snap.contacts.length ? 'Nessun risultato' : 'Nessun contatto', 'Tecnici, artigiani, fornitori, enti e professionisti utili per la casa.', snap.contacts.length ? null : h('button', { class: 'btn primary', type: 'button', onclick: () => add(ctx) }, 'Nuovo contatto')));
  return { title: 'Contatti', body, back: '#/more', fab: { label: 'Nuovo contatto', onclick: () => add(ctx) } };
}
export async function detailView([id], ctx) {
  const c = await repo.get('contacts', id);
  if (!c) return { title: 'Contatto', back: '#/contacts', body: empty('alert', 'Contatto non trovato', '') };
  const snap = await repo.snapshot();
  const used = snap.maintenance.filter((m) => m.contactId === id);
  const body = h('div', null, h('div', { class: 'card pad' }, kv([['Tipo', labelOf('contacts', 'role', c.role)], ['Azienda', c.company], ['Telefono', c.phone ? h('a', { href: `tel:${c.phone.replace(/[^\d+]/g, '')}` }, c.phone) : ''], ['Email', c.email ? h('a', { href: `mailto:${c.email}` }, c.email) : ''], ['Indirizzo', c.address], ['Note', c.notes]])),
    used.length ? [h('h2', { class: 'sec' }, h('span', null, 'Interventi collegati')), card(used.map((m) => row({ title: m.title, href: `#/home/maintenance/${m.id}` })))] : null,
    await linksPanel('contact', id, ctx, ['document']),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: async () => { if (await editEntity({ store: 'contacts', title: 'Modifica contatto', record: c })) ctx.refresh(); } }, icon('edit', 18), 'Modifica'),
      h('button', { class: 'btn ghost', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Eliminare il contatto?', message: 'Gli interventi collegati restano, senza fornitore.', confirmLabel: 'Elimina', danger: true })) { await repo.remove('contact', id); nav('/contacts'); } } }, icon('trash', 18), 'Elimina')));
  return { title: c.name, small: true, back: '#/contacts', body };
}
