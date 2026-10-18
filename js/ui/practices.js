import { h, icon } from './h.js';
import * as repo from '../data/repo.js';
import { row, card, empty, kv, chips, labelOf, nav, dueEl } from './common.js';
import { editEntity, confirmDialog, openSheet, buildForm, toast, showError } from './kit.js';
import { linksPanel } from './links.js';
import { SCHEMA, PRACTICE_STATUS } from '../data/schema.js';
import { todayStr, formatIT } from '../lib/dates.js';

let filter = 'active';
export function newPractice(ctx) {
  return editEntity({ store: 'practices', title: 'Nuova pratica', defaults: { openedAt: todayStr() } }).then((p) => { if (p) { toast('Pratica creata', 'ok'); nav(`/practices/${p.id}`); } return p; });
}

export async function listView(_p, ctx) {
  const snap = await repo.snapshot();
  const prog = new Map();
  for (const c of snap.checklist) { const x = prog.get(c.practiceId) || [0, 0]; x[1]++; if (c.done) x[0]++; prog.set(c.practiceId, x); }
  const act = (p) => p.status === 'open' || p.status === 'waiting';
  const items = snap.practices.filter((p) => (filter === 'active' ? act(p) : filter === 'closed' ? !act(p) : true)).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const body = h('div', null, chips([['active', 'Aperte'], ['closed', 'Concluse'], ['all', 'Tutte']], filter, (k) => { filter = k; ctx.refresh(); }),
    items.length ? card(items.map((p) => { const pr = prog.get(p.id); return row({ title: p.title, sub: [labelOf('practices', 'kind', p.kind), p.entity].filter(Boolean).join(' · '), meta: pr ? `${pr[0]}/${pr[1]}` : labelOf('practices', 'status', p.status), href: `#/practices/${p.id}` }); }))
      : empty('practice', 'Nessuna pratica', 'Raccogli adempimenti, scadenze intermedie e documenti di una pratica amministrativa.', h('button', { class: 'btn primary', type: 'button', onclick: () => newPractice(ctx) }, 'Nuova pratica')));
  return { title: 'Pratiche', body, fab: { label: 'Nuova pratica', onclick: () => newPractice(ctx) } };
}

export async function detailView([id], ctx) {
  const p = await repo.get('practices', id);
  if (!p) return { title: 'Pratica', back: '#/practices', body: empty('alert', 'Pratica non trovata', 'Potrebbe essere stata eliminata.') };
  const [items, snap, rels] = await Promise.all([repo.listChecklist(id), repo.snapshot(), repo.linksOf('practice', id)]);
  const today = todayStr();
  const done = items.filter((i) => i.done).length;
  const prop = snap.properties.find((x) => x.id === p.propertyId)?.name;
  const statusSel = h('select', { id: 'pst', 'aria-label': 'Stato pratica', onchange: async (e) => { try { await repo.update('practices', id, { status: e.target.value }); ctx.refresh(); } catch (er) { showError(er); } } },
    PRACTICE_STATUS.map(([v, l]) => h('option', { value: v, selected: p.status === v }, l)));
  const info = h('div', { class: 'card pad' }, kv([['Tipologia', labelOf('practices', 'kind', p.kind)], ['Ente', p.entity], ['Aperta il', formatIT(p.openedAt)], ['Conclusa il', p.concludedAt ? formatIT(p.concludedAt) : ''], ['Immobile', prop], ['Riferimenti', p.references], ['Note', p.notes]]),
    h('div', { class: 'field', style: undefined }, h('label', { for: 'pst' }, 'Stato'), statusSel));

  const mkItem = (i) => h('li', { class: `with-act${i.done ? ' done' : ''}` },
    h('button', { class: `row`, type: 'button', role: 'checkbox', 'aria-checked': String(i.done), onclick: async () => { await repo.setChecklistDone(i.id, !i.done); ctx.refresh(); } },
      h('span', { class: `check-btn${i.done ? ' on' : ''}` }, h('span', null, i.done ? icon('check', 16) : null)),
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, i.text), h('span', { class: 'row-sub' }, [i.kind === 'document' ? (i.done ? 'Documento ricevuto' : 'Documento richiesto') : null, i.due ? h('span', null, 'Scadenza ', dueEl(i.due, today, i.done)) : null].filter(Boolean).flatMap((x, k) => (k ? [' · ', x] : [x]))))),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Rimuovi voce: ${i.text}`, onclick: async () => { await repo.removeChecklistItem(i.id); ctx.refresh(); } }, icon('close', 18)));
  const addItem = async () => {
    const form = buildForm(SCHEMA.checklist, { kind: 'step' });
    const save = h('button', { class: 'btn primary', type: 'button' }, 'Aggiungi');
    const s = openSheet({ title: 'Nuova voce di checklist', body: form.el, footer: [h('button', { class: 'btn', type: 'button', onclick: () => s.close() }, 'Annulla'), save] });
    save.addEventListener('click', async () => { try { await repo.addChecklistItem(id, form.read()); s.close(); ctx.refresh(); } catch (e) { if (e.errors) form.showErrors(e.errors); else showError(e); } });
  };
  const note = async () => {
    const form = buildForm([{ k: 'text', type: 'text', label: 'Annotazione' }], {});
    const save = h('button', { class: 'btn primary', type: 'button' }, 'Salva');
    const s = openSheet({ title: 'Aggiungi alla cronologia', body: form.el, footer: [h('button', { class: 'btn', type: 'button', onclick: () => s.close() }, 'Annulla'), save] });
    save.addEventListener('click', async () => { await repo.addPracticeNote(id, form.read().text); s.close(); ctx.refresh(); });
  };
  const body = h('div', null, info,
    h('h2', { class: 'sec' }, h('span', null, `Checklist (${done}/${items.length})`)),
    items.length ? h('div', { class: 'card' }, h('ul', { class: 'list' }, items.map(mkItem))) : h('p', { class: 'muted small' }, 'Aggiungi gli adempimenti e i documenti richiesti.'),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: addItem }, icon('plus', 18), 'Aggiungi voce')),
    await linksPanel('practice', id, ctx, ['task', 'document']),
    h('h2', { class: 'sec' }, h('span', null, 'Cronologia')),
    h('div', { class: 'card' }, [...(p.history || [])].reverse().slice(0, 40).map((e) => h('div', { class: 'hist' }, h('b', null, formatIT(e.at.slice(0, 10))), ' — ', e.text))),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: note }, 'Annota'),
      h('button', { class: 'btn', type: 'button', onclick: async () => { if (await editEntity({ store: 'practices', title: 'Modifica pratica', record: p })) ctx.refresh(); } }, icon('edit', 18), 'Modifica'),
      h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
        const nDocs = rels.filter((r) => r.type === 'document').length, nTasks = rels.filter((r) => r.type === 'task').length;
        const ok = await confirmDialog({ title: 'Eliminare la pratica?', message: `Verranno eliminate la pratica e la sua checklist (${items.length} voci).\nI ${nDocs} documenti e le ${nTasks} attività collegate NON vengono eliminati: restano disponibili nei rispettivi elenchi.`, confirmLabel: 'Elimina pratica', danger: true });
        if (ok) { await repo.remove('practice', id); toast('Pratica eliminata'); nav('/practices'); }
      } }, icon('trash', 18), 'Elimina')));
  return { title: p.title, small: true, back: '#/practices', body };
}
