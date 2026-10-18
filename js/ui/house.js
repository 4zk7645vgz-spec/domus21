import { h, icon, money } from './h.js';
import * as repo from '../data/repo.js';
import { row, card, empty, kv, segmented, labelOf, nav, dueEl, dueText } from './common.js';
import { editEntity, confirmDialog, toast, showError } from './kit.js';
import { linksPanel } from './links.js';
import { promptForm } from './prompt.js';
import { todayStr, formatIT, cmp } from '../lib/dates.js';
import { buildICS } from '../lib/ics.js';
import { deliver } from '../lib/deliver.js';

let tab = 'properties';
const addProperty = (ctx) => editEntity({ store: 'properties', title: 'Nuovo immobile' }).then((p) => { if (p) { toast('Immobile creato', 'ok'); ctx.refresh(); } });
const addMaint = (ctx, defaults = {}) => editEntity({ store: 'maintenance', title: 'Nuova manutenzione', defaults }).then((m) => { if (m) { toast('Salvata', 'ok'); ctx.refresh(); } return m; });

export async function listView(_p, ctx) {
  const snap = await repo.snapshot();
  const today = todayStr();
  let content;
  if (tab === 'properties') {
    content = snap.properties.length ? card(snap.properties.map((p) => row({ title: p.name, sub: p.address || labelOf('properties', 'kind', p.kind), href: `#/home/property/${p.id}` })))
      : empty('house', 'Nessun immobile', 'Aggiungi la tua abitazione per collegare manutenzioni, contratti e documenti.', h('button', { class: 'btn primary', type: 'button', onclick: () => addProperty(ctx) }, 'Nuovo immobile'));
  } else {
    const ms = [...snap.maintenance].sort((a, b) => cmp(a.nextDue || '9999', b.nextDue || '9999'));
    content = ms.length ? card(ms.map((m) => row({ title: m.title, sub: [labelOf('maintenance', 'kind', m.kind), snap.properties.find((p) => p.id === m.propertyId)?.name].filter(Boolean).join(' · '), meta: m.nextDue ? dueText(m.nextDue, today) : m.warrantyEnd ? `Garanzia fino al ${formatIT(m.warrantyEnd, false)}` : '', metaClass: m.nextDue && m.nextDue < today ? 'due-over' : '', href: `#/home/maintenance/${m.id}` })))
      : empty('wrench', 'Nessuna manutenzione', 'Registra manutenzioni programmate, interventi e garanzie.', h('button', { class: 'btn primary', type: 'button', onclick: () => addMaint(ctx) }, 'Nuova manutenzione'));
  }
  const body = h('div', null, segmented([['properties', 'Immobili'], ['maintenance', 'Manutenzioni']], tab, (k) => { tab = k; ctx.refresh(); }), content);
  return { title: 'Casa', body, back: '#/more', fab: { label: tab === 'properties' ? 'Nuovo immobile' : 'Nuova manutenzione', onclick: () => (tab === 'properties' ? addProperty(ctx) : addMaint(ctx)) } };
}

export async function propertyView([id], ctx) {
  const p = await repo.get('properties', id);
  if (!p) return { title: 'Immobile', back: '#/home', body: empty('alert', 'Immobile non trovato', '') };
  const snap = await repo.snapshot();
  const ms = snap.maintenance.filter((m) => m.propertyId === id).sort((a, b) => cmp(a.nextDue || '9999', b.nextDue || '9999'));
  const rooms = (p.rooms || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const body = h('div', null,
    h('div', { class: 'card pad' }, kv([['Tipologia', labelOf('properties', 'kind', p.kind)], ['Indirizzo', p.address], ['Ambienti', rooms.join(', ')], ['Note', p.notes]])),
    h('h2', { class: 'sec' }, h('span', null, 'Manutenzioni e interventi')),
    ms.length ? card(ms.map((m) => row({ title: m.title, sub: labelOf('maintenance', 'kind', m.kind) + (m.room ? ` · ${m.room}` : ''), meta: dueText(m.nextDue), href: `#/home/maintenance/${m.id}` }))) : h('p', { class: 'muted small' }, 'Nessuna manutenzione registrata.'),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: () => addMaint(ctx, { propertyId: id }) }, icon('plus', 18), 'Nuova manutenzione')),
    await linksPanel('property', id, ctx, ['document', 'task']),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: async () => { if (await editEntity({ store: 'properties', title: 'Modifica immobile', record: p })) ctx.refresh(); } }, icon('edit', 18), 'Modifica'),
      h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
        const ok = await confirmDialog({ title: 'Eliminare l\'immobile?', message: `Verrà eliminato "${p.name}". Manutenzioni, contratti, attività e pratiche collegati restano, ma perdono il riferimento all'immobile. I documenti non vengono toccati.`, confirmLabel: 'Elimina', danger: true });
        if (ok) { await repo.remove('property', id); nav('/home'); }
      } }, icon('trash', 18), 'Elimina')));
  return { title: p.name, small: true, back: '#/home', body };
}

export async function maintenanceView([id], ctx) {
  const m = await repo.get('maintenance', id);
  if (!m) return { title: 'Manutenzione', back: '#/home', body: empty('alert', 'Manutenzione non trovata', '') };
  const snap = await repo.snapshot(); const today = todayStr();
  const prop = snap.properties.find((x) => x.id === m.propertyId)?.name, contact = snap.contacts.find((x) => x.id === m.contactId);
  const doneDlg = async () => {
    const v = await promptForm({ title: 'Segna come eseguita', submitLabel: 'Registra', values: { date: today }, fields: [{ k: 'date', type: 'date', label: 'Data di esecuzione', req: true }, { k: 'cost', type: 'num', label: 'Costo (€)' }, { k: 'note', type: 'str', label: 'Nota' }],
      check: (v) => (v.date > today ? [{ k: 'date', msg: 'la data non può essere futura' }] : []) });
    if (!v) return;
    try { const r = await repo.markMaintenanceDone(id, { date: v.date, cost: v.cost, note: v.note }); toast(r.nextDue ? `Registrata. Prossima: ${formatIT(r.nextDue)}` : 'Registrata', 'ok'); ctx.refresh(); } catch (e) { showError(e); }
  };
  const body = h('div', null,
    h('div', { class: 'card pad' }, kv([['Tipo', labelOf('maintenance', 'kind', m.kind)], ['Immobile', prop], ['Ambiente', m.room], ['Fornitore', contact ? h('a', { href: `#/contacts/${contact.id}` }, contact.name) : ''], ['Ultima', m.lastDone ? formatIT(m.lastDone) : ''], ['Ripetere', m.intervalMonths ? `ogni ${m.intervalMonths} mesi` : ''],
      ['Prossima', m.nextDue ? h('span', null, formatIT(m.nextDue), ' · ', dueEl(m.nextDue, today)) : ''], ['Fine garanzia', m.warrantyEnd ? formatIT(m.warrantyEnd) : ''], ['Costo', m.cost != null ? money(m.cost) : ''], ['Note', m.notes]])),
    h('div', { class: 'btn-row' }, m.kind !== 'garanzia' ? h('button', { class: 'btn primary', type: 'button', onclick: doneDlg }, icon('check', 18), 'Segna eseguita') : null,
      m.nextDue ? h('button', { class: 'btn', type: 'button', onclick: async () => { const r = await deliver(new Blob([buildICS([{ uid: `${m.id}-${m.nextDue}`, date: m.nextDue, title: m.title }])], { type: 'text/calendar' }), `domus-${m.nextDue}.ics`); if (r !== 'cancelled') toast('File calendario pronto.'); } }, icon('today', 18), 'Aggiungi al Calendario') : null),
    h('h2', { class: 'sec' }, h('span', null, 'Storico')),
    (m.history || []).length ? h('div', { class: 'card' }, [...m.history].reverse().map((e) => h('div', { class: 'hist' }, e.text, e.cost != null ? ` · ${money(e.cost)}` : ''))) : h('p', { class: 'muted small' }, 'Nessuna esecuzione registrata.'),
    await linksPanel('maintenance', id, ctx, ['document']),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: async () => { if (await editEntity({ store: 'maintenance', title: 'Modifica', record: m })) ctx.refresh(); } }, icon('edit', 18), 'Modifica'),
      h('button', { class: 'btn ghost', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Eliminare?', message: 'Lo storico verrà eliminato. I documenti collegati restano in archivio.', confirmLabel: 'Elimina', danger: true })) { await repo.remove('maintenance', id); nav('/home'); } } }, icon('trash', 18), 'Elimina')));
  return { title: m.title, small: true, back: '#/home', body };
}
