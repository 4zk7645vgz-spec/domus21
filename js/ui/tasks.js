import { h, icon, money } from './h.js';
import * as repo from '../data/repo.js';
import { row, list, card, empty, dueEl, kv, chips, labelOf, nav } from './common.js';
import { editEntity, confirmDialog, toast, showError } from './kit.js';
import { linksPanel } from './links.js';
import { todayStr, formatIT, cmp } from '../lib/dates.js';
import { describe, upcoming } from '../lib/recurrence.js';
import { buildICS } from '../lib/ics.js';
import { deliver } from '../lib/deliver.js';

export function taskRow(t, ctx, today = todayStr()) {
  const done = t.status === 'done';
  const check = h('button', { class: `check-btn${done ? ' on' : ''}`, type: 'button', role: 'checkbox', 'aria-checked': String(done), 'aria-label': `${done ? 'Riapri' : 'Completa'}: ${t.title}`, onclick: (e) => { e.stopPropagation(); toggleTask(t, ctx); } }, h('span', null, done ? icon('check', 16) : null));
  const li = row({ title: t.title, sub: [t.recurrence ? describe(t.recurrence) : null, t.priority === 'high' ? 'Priorità alta' : null].filter(Boolean).join(' · '), href: `#/tasks/${t.id}`, lead: check, cls: done ? 'done' : '' });
  const due = dueEl(t.due, today, done);
  if (due) { const m = h('span', { class: 'row-meta' }, due); li.querySelector('.row').insertBefore(m, li.querySelector('.chev')); }
  return li;
}

export async function toggleTask(t, ctx) {
  try {
    if (t.status === 'done') { await repo.reopenTask(t.id); toast('Attività riaperta'); }
    else {
      const r = await repo.completeTask(t.id);
      toast(r.next ? `Completata. Prossima occorrenza: ${formatIT(r.next.due)}${r.skipped ? ` (${r.skipped} saltate)` : ''}` : 'Completata', 'ok');
    }
    ctx.refresh();
  } catch (e) { showError(e); }
}

export function newTask(ctx, defaults = {}) {
  return editEntity({ store: 'tasks', title: 'Nuova attività', defaults, withTags: true }).then((t) => { if (t) { toast('Attività creata', 'ok'); ctx.refresh(); } return t; });
}

let filter = 'open';
export async function listView(_p, ctx) {
  const snap = await repo.snapshot();
  const today = todayStr();
  const cats = new Map(snap.categories.map((c) => [c.id, c.name]));
  let tasks = snap.tasks;
  if (filter === 'open') tasks = tasks.filter((t) => t.status === 'open');
  else if (filter === 'done') tasks = tasks.filter((t) => t.status === 'done');
  tasks = [...tasks].sort((a, b) => (filter === 'done' ? cmp(b.completedAt || '', a.completedAt || '') : cmp(a.due || '9999', b.due || '9999') || cmp(a.title, b.title)));
  const body = h('div', null, chips([['open', 'Aperte'], ['done', 'Completate'], ['all', 'Tutte']], filter, (k) => { filter = k; ctx.refresh(); }),
    tasks.length ? card(tasks.map((t) => { const li = taskRow(t, ctx, today); const c = cats.get(t.categoryId); if (c) li.querySelector('.row-sub').textContent = [c, li.querySelector('.row-sub').textContent].filter(Boolean).join(' · '); return li; }))
      : empty('tasks', filter === 'done' ? 'Nessuna attività completata' : 'Nessuna attività', 'Aggiungi scadenze, adempimenti e ricorrenze della casa.', h('button', { class: 'btn primary', type: 'button', onclick: () => newTask(ctx) }, 'Nuova attività')));
  return { title: 'Attività', body, fab: { label: 'Nuova attività', onclick: () => newTask(ctx) } };
}

export async function detailView([id], ctx) {
  const t = await repo.get('tasks', id);
  if (!t) return { title: 'Attività', back: '#/tasks', body: empty('alert', 'Attività non trovata', 'Potrebbe essere stata eliminata.') };
  const snap = await repo.snapshot();
  const today = todayStr();
  const cat = snap.categories.find((c) => c.id === t.categoryId)?.name;
  const prop = snap.properties.find((p) => p.id === t.propertyId)?.name;
  const tags = (t.tagIds || []).map((i) => snap.tags.find((x) => x.id === i)?.name).filter(Boolean).join(', ');
  const done = t.status === 'done';
  const info = h('div', { class: 'card pad' }, kv([['Stato', done ? 'Completata' : 'Aperta'], ['Scadenza', t.due ? h('span', null, formatIT(t.due), ' · ', dueEl(t.due, today, done)) : 'Nessuna'], ['Ricorrenza', t.recurrence ? describe(t.recurrence) : ''],
    ['Prossime', t.recurrence && !done ? upcoming({ ...t.recurrence, anchorDay: t.recurrence.anchorDay }, t.due, 3).map((d) => formatIT(d)).join(' · ') : ''], ['Priorità', labelOf('tasks', 'priority', t.priority)], ['Categoria', cat], ['Immobile', prop], ['Costo', t.cost != null ? money(t.cost) : ''], ['Tag', tags], ['Descrizione', t.description], ['Note', t.notes], ['Completata il', t.completedAt ? formatIT(t.completedAt.slice(0, 10)) : ''], ['Occorrenze saltate', t.skipped || '']]));
  const body = h('div', null, info,
    h('div', { class: 'btn-row' },
      h('button', { class: `btn ${done ? '' : 'primary'}`, type: 'button', onclick: () => toggleTask(t, { refresh: ctx.refresh }) }, icon('check', 18), done ? 'Riapri' : 'Completa'),
      h('button', { class: 'btn', type: 'button', onclick: async () => { const r = await editEntity({ store: 'tasks', title: 'Modifica attività', record: t, withTags: true }); if (r) ctx.refresh(); } }, icon('edit', 18), 'Modifica'),
      t.due && !done ? h('button', { class: 'btn', type: 'button', onclick: async () => { const ics = buildICS([{ uid: t.id + (t.occKey ? '-' + t.due : ''), date: t.due, title: t.title, description: t.description }]); const r = await deliver(new Blob([ics], { type: 'text/calendar' }), `domus-${t.due}.ics`); if (r !== 'cancelled') toast('File calendario pronto: aprilo per aggiungerlo a Calendario.'); } }, icon('today', 18), 'Aggiungi al Calendario') : null),
    await linksPanel('task', id, ctx, ['document']),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
      const ok = await confirmDialog({ title: 'Eliminare l\'attività?', message: `"${t.title}" verrà eliminata${t.recurrence && !done ? '. La serie ricorrente terminerà: non verranno generate nuove occorrenze' : ''}.\nI documenti collegati NON vengono eliminati.`, confirmLabel: 'Elimina', danger: true });
      if (ok) { await repo.remove('task', id); toast('Attività eliminata'); nav('/tasks'); }
    } }, icon('trash', 18), 'Elimina')));
  return { title: t.title, small: true, back: '#/tasks', body };
}
